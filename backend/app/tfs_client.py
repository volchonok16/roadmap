import asyncio
import json
import logging
import re
import time
from collections.abc import Callable, Iterable
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo
from urllib.parse import quote

import httpx
from dateutil.parser import parse as parse_datetime

from app.board_kanban import (
    board_column_resolve_candidates,
    column_names_from_payload,
    pick_backlog_for_change_requests,
)
from app.board_mapping import guess_area_path_from_board_name
from app.config import settings
from app.http_auth import build_http_auth
from app.json_utils import as_dict, as_json_dict, as_list, as_relation_list, as_work_item_list
from app.tfs_auth import TfsAuth

BOARD_ID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
MS_DATE_RE = re.compile(r"^/Date\((?P<milliseconds>-?\d+)(?:[+-]\d+)?\)/$")
ALL_TEAMS_ARTIFACT_PICKER_PROVIDER = "ms.vss-work-web.all-teams-artifact-picker-data-provider"
BOARDS_DIRECTORY_PROVIDER = "ms.vss-work-web.boards-hub-directory-data-provider"
EMBEDDED_BOARD_RE = re.compile(
    r'"artifactId":"(?P<id>[0-9a-fA-F-]{36})"[^}]*?"artifactName":"(?P<name>(?:\\.|[^"\\])*)"',
)

logger = logging.getLogger(__name__)

SYSTEM_FIELD_ALIASES = {
    "-3": "System.Id",
    "1": "System.Title",
    "2": "System.State",
    "25": "System.WorkItemType",
    "-7": "System.AreaPath",
    "-12": "System.AreaLeaf",
    "-42": "System.TeamProject",
}


def parse_tfs_date(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        match = MS_DATE_RE.match(value)
        if match:
            return datetime.fromtimestamp(int(match.group("milliseconds")) / 1000, UTC).date()
        return parse_datetime(value, dayfirst=True).date()
    return None


# TFS показывает «DD.MM.YYYY 0:00» в часовом поясе коллекции (MSK для Tele2).
TFS_CALENDAR_TZ = ZoneInfo("Europe/Moscow")


def parse_tfs_calendar_date(value: Any) -> date | None:
    """Календарный день как в форме TFS (16.06.2026 0:00, а не UTC-день 15.06)."""
    parsed = parse_tfs_datetime(value)
    if parsed:
        return parsed.astimezone(TFS_CALENDAR_TZ).date()
    return parse_tfs_date(value)


def format_tfs_calendar_datetime(value: date) -> str:
    """Полночь календарного дня MSK → ISO UTC для поля Scheduling в TFS."""
    dt = datetime(value.year, value.month, value.day, 0, 0, 0, tzinfo=TFS_CALENDAR_TZ)
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def date_from_field_list(fields: dict[str, Any], names: Iterable[str]) -> date | None:
    for name in names:
        value = fields.get(name)
        if value in (None, ""):
            continue
        if name.startswith("Microsoft.VSTS.Scheduling.") or (
            isinstance(value, str) and "T" in value and value.endswith("Z")
        ):
            parsed = parse_tfs_calendar_date(value)
        else:
            parsed = parse_tfs_date(value)
        if parsed:
            return parsed
    return None


def parse_tfs_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=UTC)
    if isinstance(value, str):
        text = value.strip()
        if "T" in text and text.endswith("Z"):
            return datetime.fromisoformat(text.replace("Z", "+00:00"))
        match = MS_DATE_RE.match(text)
        if match:
            return datetime.fromtimestamp(int(match.group("milliseconds")) / 1000, UTC)
        parsed = parse_datetime(text, dayfirst=True)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None


def first_field(fields: dict[str, Any], names: Iterable[str]) -> Any:
    for name in names:
        if fields.get(name) not in (None, ""):
            return fields[name]
    return None


def normalize_compact_fields(fields: dict[str, Any] | None) -> dict[str, Any]:
    if not fields:
        return {}

    normalized = dict(fields)
    for key, reference_name in SYSTEM_FIELD_ALIASES.items():
        if key in fields and reference_name not in normalized:
            normalized[reference_name] = fields[key]
    return normalized


def identity_name(value: Any) -> tuple[str | None, str | None, str | None]:
    if isinstance(value, dict):
        identity = value.get("identityRef") if isinstance(value.get("identityRef"), dict) else value
        return (
            identity.get("displayName") or value.get("distinctDisplayName"),
            identity.get("uniqueName"),
            identity.get("imageUrl")
            or as_dict(as_dict(identity.get("_links")).get("avatar")).get("href"),
        )
    if isinstance(value, str):
        return value, None, None
    return None, None, None


def _dedupe_api_versions(versions: Iterable[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    result: list[str] = []
    for version in versions:
        version = version.strip()
        if not version or version in seen:
            continue
        seen.add(version)
        result.append(version)
    return tuple(result)


def _api_version_candidates(preferred: str | None = None) -> tuple[str, ...]:
    ordered = (preferred or settings.tfs_api_version, "6.1", "6.0", "5.1")
    return _dedupe_api_versions(ordered)


def _wit_batch_api_version_candidates(preferred: str | None = None) -> tuple[str, ...]:
    """workItemsBatch на TFS 6.1 часто требует api-version с суффиксом -preview."""
    base = (preferred or settings.tfs_api_version).strip()
    ordered: list[str] = []
    if base:
        ordered.append(base)
        if "preview" not in base.lower():
            root = base.split("-", 1)[0]
            if re.fullmatch(r"\d+\.\d+", root):
                ordered.append(f"{root}-preview")
                ordered.append(f"{root}-preview.1")
    ordered.extend(["6.1-preview", "6.1-preview.1", "6.0-preview", "6.0", "5.1"])
    return _dedupe_api_versions(ordered)


CONTRIBUTION_API_VERSIONS = ("6.1-preview.1", "5.1-preview.1")


def wiql_escape(value: str) -> str:
    return value.replace("'", "''")


def wiql_quote(value: str) -> str:
    return f"'{wiql_escape(value)}'"


def wit_api_field_names(names: Iterable[str]) -> list[str]:
    """workItemsBatch fields= принимает reference name (с точкой), не числовые id вроде 10050."""
    result: list[str] = []
    seen: set[str] = set()
    for name in names:
        candidate = name.strip()
        if not candidate or candidate in seen:
            continue
        if candidate.isdigit() or "." not in candidate:
            continue
        seen.add(candidate)
        result.append(candidate)
    return result


def wiql_date(value: date) -> str:
    """TFS WIQL date fields reject time components (date precision only)."""
    return wiql_quote(value.isoformat())


class TfsClient:
    def __init__(self, tfs_auth: TfsAuth, *, use_ntlm: bool = True) -> None:
        if not tfs_auth.has_credentials():
            raise ValueError("TFS credentials are not configured. Sign in on the login form.")

        headers = {"Accept": "application/json"}
        http_auth = build_http_auth(tfs_auth, use_ntlm=use_ntlm)

        if tfs_auth.cookie:
            headers["Cookie"] = tfs_auth.cookie

        if tfs_auth.extra_headers:
            headers.update(tfs_auth.extra_headers)

        self.tfs_auth = tfs_auth
        self.project = tfs_auth.project
        self.project_id = tfs_auth.project_id
        self.base_url = tfs_auth.base_url

        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            auth=http_auth,
            headers=headers,
            timeout=settings.tfs_timeout_seconds,
            verify=settings.tfs_verify_tls,
        )

    async def close(self) -> None:
        await self.client.aclose()

    def _board_href(self, team_name: str) -> str:
        segment = quote(team_name, safe="")
        return f"{self.base_url.rstrip('/')}/{self.project}/_boards/board/t/{segment}"

    def _board_from_team_entry(
        self,
        team_id: str,
        team_name: str,
        *,
        source: str,
        href: str | None = None,
        area_path: str | None = None,
        raw: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "id": team_id,
            "name": team_name,
            "project_id": self.project_id,
            "project_name": self.project,
            "href": href or self._board_href(team_name),
            "area_path": area_path,
            "raw": raw or {"source": source, "id": team_id, "name": team_name},
        }

    def _boards_from_teams_list(self, teams: Iterable[dict[str, Any]], *, source: str) -> list[dict[str, Any]]:
        boards: list[dict[str, Any]] = []
        for team in teams:
            if not isinstance(team, dict):
                continue
            team_id = team.get("id")
            team_name = team.get("name")
            if not isinstance(team_id, str) or not BOARD_ID_RE.match(team_id):
                continue
            if not isinstance(team_name, str) or not team_name.strip():
                continue
            boards.append(
                self._board_from_team_entry(
                    team_id,
                    team_name.strip(),
                    source=source,
                    href=None,
                    raw=team,
                )
            )
        return boards

    def _default_boards(self) -> list[dict[str, Any]]:
        if not settings.tfs_default_board_id and not settings.tfs_default_board_name:
            return []
        board_id = settings.tfs_default_board_id or "default-board"
        return [
            {
                "id": board_id,
                "name": settings.tfs_default_board_name,
                "project_id": self.project_id,
                "project_name": self.project,
                "href": None,
                "area_path": settings.tfs_default_board_area,
                "raw": {"source": "default"},
            }
        ]

    def _directory_source_page(self) -> dict[str, Any]:
        return {
            "url": f"{self.base_url.rstrip('/')}/{self.project}/_boards/directory",
            "routeId": "ms.vss-work-web.boards-directory-route",
            "routeValues": {
                "project": self.project,
                "viewname": "directory",
                "controller": "ContributedPage",
                "action": "Execute",
            },
        }

    async def _query_directory_providers(self, contribution_ids: list[str]) -> dict[str, Any]:
        source_page = self._directory_source_page()
        payloads = [
            {
                "contributionIds": contribution_ids,
                "dataProviderContext": {"properties": {"sourcePage": source_page}},
            },
            {
                "contributionIds": contribution_ids,
                "context": {"properties": {"sourcePage": source_page}},
            },
        ]
        last_error: Exception | None = None
        for payload in payloads:
            try:
                return await self.query_contribution_data_provider(payload)
            except Exception as exc:
                last_error = exc
        if last_error:
            raise last_error
        return {}

    def _boards_from_directory_providers(self, response: dict[str, Any]) -> list[dict[str, Any]]:
        boards: list[dict[str, Any]] = []
        data = as_dict(response.get("data"))
        for provider_key, provider in data.items():
            if not isinstance(provider, dict):
                continue
            teams = provider.get("teams")
            if isinstance(teams, list):
                boards.extend(self._boards_from_teams_list(teams, source=provider_key))
            for favorite in as_list(provider.get("favorites")):
                if not isinstance(favorite, dict):
                    continue
                board_id = favorite.get("artifactId")
                name = favorite.get("artifactName") or as_dict(favorite.get("artifactProperties")).get("TeamName")
                if isinstance(board_id, str) and BOARD_ID_RE.match(board_id) and isinstance(name, str):
                    boards.append(
                        self._board_from_team_entry(
                            board_id,
                            name.strip(),
                            source=f"{provider_key}-favorite",
                            raw=favorite,
                        )
                    )
        return boards

    def _boards_from_directory_fps(self, payload: Any) -> list[dict[str, Any]]:
        fps = as_dict(payload if isinstance(payload, dict) else {}).get("fps")
        if not fps:
            return []
        data_providers = as_dict(fps.get("dataProviders"))
        embedded = as_dict(data_providers.get("data"))
        if not embedded:
            return []
        return self._boards_from_directory_providers({"data": embedded})

    async def _boards_from_all_teams_provider(self) -> list[dict[str, Any]]:
        """Список команд как в каталоге /_boards/directory."""
        response = await self._query_directory_providers(
            [ALL_TEAMS_ARTIFACT_PICKER_PROVIDER, BOARDS_DIRECTORY_PROVIDER],
        )
        return self._boards_from_directory_providers(response)

    async def _boards_from_directory_hub_provider(self) -> list[dict[str, Any]]:
        response = await self._query_directory_providers([BOARDS_DIRECTORY_PROVIDER])
        return self._boards_from_directory_providers(response)

    async def _boards_from_project_teams(self, *, mine: bool | None = None) -> list[dict[str, Any]]:
        if not self.project_id:
            return []
        label = "project-teams-mine" if mine else "project-teams"
        teams: list[dict[str, Any]] = []
        skip = 0
        page_size = 500
        while True:
            params: dict[str, str] = {
                "api-version": settings.tfs_api_version,
                "$top": str(page_size),
                "$skip": str(skip),
            }
            if mine is True:
                params["$mine"] = "true"
            response = await self.client.get(
                f"/_apis/projects/{self.project_id}/teams",
                params=params,
            )
            if response.status_code != 200:
                response.raise_for_status()
            payload = as_json_dict(response.json())
            batch = payload.get("value", [])
            if not isinstance(batch, list) or not batch:
                break
            teams.extend(batch)
            if len(batch) < page_size:
                break
            skip += page_size
        return self._boards_from_teams_list(teams, source=label)

    async def _boards_from_directory(self) -> list[dict[str, Any]]:
        response = await self.client.get(
            f"/{self.project}/_boards/directory",
            params={"__rt": "fps", "__ver": "2"},
        )
        if response.status_code != 200:
            response.raise_for_status()
        payload = response.json()
        boards = self._boards_from_directory_fps(payload)
        if boards:
            return boards
        boards = self._extract_boards(payload)
        if boards:
            return boards
        return self._extract_boards_from_text(response.text)

    @staticmethod
    def _parse_team_field_default_area(payload: dict[str, Any]) -> str | None:
        default_value = payload.get("defaultValue")
        if isinstance(default_value, str) and default_value.strip():
            return default_value.strip()
        for item in as_list(payload.get("values")):
            if not isinstance(item, dict):
                continue
            value = item.get("value")
            if item.get("isDefault") and isinstance(value, str) and value.strip():
                return value.strip()
        return None

    async def get_team_default_area_path(self, team_name: str) -> str | None:
        segment = quote(team_name, safe="")
        for api_version in _api_version_candidates():
            response = await self.client.get(
                f"/{self.project}/{segment}/_apis/work/teamsettings/teamfieldvalues",
                params={"api-version": api_version},
            )
            if response.status_code == 200:
                parsed = self._parse_team_field_default_area(as_json_dict(response.json()))
                if parsed:
                    return parsed
            if response.status_code in {400, 404}:
                continue
            response.raise_for_status()
        return guess_area_path_from_board_name(team_name, self.project)

    async def list_team_backlogs(self, team_name: str) -> list[dict[str, Any]]:
        segment = quote(team_name, safe="")
        for api_version in _api_version_candidates():
            response = await self.client.get(
                f"/{self.project}/{segment}/_apis/work/backlogs",
                params={"api-version": api_version},
            )
            if response.status_code == 200:
                payload = as_json_dict(response.json())
                rows = payload.get("value", [])
                return [row for row in rows if isinstance(row, dict)]
            if response.status_code in {400, 404}:
                continue
            response.raise_for_status()
        return []

    async def list_team_boards(self, team_name: str) -> list[dict[str, Any]]:
        segment = quote(team_name, safe="")
        for api_version in _api_version_candidates():
            response = await self.client.get(
                f"/{self.project}/{segment}/_apis/work/boards",
                params={"api-version": api_version},
            )
            if response.status_code == 200:
                payload = as_json_dict(response.json())
                rows = payload.get("value", [])
                return [row for row in rows if isinstance(row, dict)]
            if response.status_code in {400, 404}:
                continue
            response.raise_for_status()
        return []

    async def list_board_column_names(self, team_name: str, board_id: str) -> list[str]:
        segment = quote(team_name, safe="")
        board_segment = quote(board_id, safe="")
        for api_version in _api_version_candidates():
            response = await self.client.get(
                f"/{self.project}/{segment}/_apis/work/boards/{board_segment}/columns",
                params={"api-version": api_version},
            )
            if response.status_code == 200:
                return column_names_from_payload(as_json_dict(response.json()))
            if response.status_code in {400, 404}:
                continue
            response.raise_for_status()
        return []

    async def get_change_request_board_columns(self, team_name: str) -> list[str]:
        backlogs = await self.list_team_backlogs(team_name)
        backlog = pick_backlog_for_change_requests(backlogs, settings.tfs_kanban_backlog_name)
        if not backlog:
            return []

        best_columns: list[str] = []
        tried: set[str] = set()

        async def try_board(board_key: str) -> None:
            nonlocal best_columns
            key = board_key.strip()
            if not key or key in tried:
                return
            tried.add(key)
            columns = await self.list_board_column_names(team_name, key)
            if len(columns) > len(best_columns):
                best_columns = columns

        for candidate in board_column_resolve_candidates(backlog):
            await try_board(candidate)

        backlog_name = str(backlog.get("name") or "").strip().lower()
        for board in await self.list_team_boards(team_name):
            board_id = str(board.get("id") or "").strip()
            board_name = str(board.get("name") or "").strip().lower()
            if not board_id:
                continue
            if backlog_name and (
                backlog_name == board_name
                or backlog_name in board_name
                or board_name in backlog_name
            ):
                await try_board(board_id)

        return best_columns

    async def enrich_board_kanban_columns(self, boards: list[dict[str, Any]]) -> None:
        if not settings.tfs_fetch_board_columns or not boards:
            return

        semaphore = asyncio.Semaphore(6)

        async def enrich_one(board: dict[str, Any]) -> None:
            if not self.is_team_board(board):
                return
            name = str(board.get("name") or "").strip()
            if not name:
                return
            async with semaphore:
                columns = await self.get_change_request_board_columns(name)
                if columns:
                    from app.board_kanban import merge_board_kanban_columns

                    merge_board_kanban_columns(board, columns)
                await asyncio.sleep(settings.tfs_request_delay_seconds)

        await asyncio.gather(*(enrich_one(board) for board in boards))

    async def enrich_board_area_paths(self, boards: list[dict[str, Any]]) -> None:
        """Быстрое обогащение: эвристика для всех, REST teamsettings — только для части."""
        if not boards:
            return

        for board in boards:
            if board.get("area_path"):
                continue
            guessed = guess_area_path_from_board_name(board["name"], self.project)
            if guessed:
                board["area_path"] = guessed

        api_candidates = [board for board in boards if not board.get("area_path")][:40]
        if not api_candidates:
            return

        semaphore = asyncio.Semaphore(max(1, min(settings.tfs_compact_concurrency, 6)))

        async def enrich_one(board: dict[str, Any]) -> None:
            async with semaphore:
                area_path = await self.get_team_default_area_path(board["name"])
            if area_path:
                board["area_path"] = area_path

        await asyncio.gather(*(enrich_one(board) for board in api_candidates))

    async def _boards_from_favorites(self) -> list[dict[str, Any]]:
        if not self.project_id:
            return []
        response = await self.client.get(
            "/_apis/Favorite/Favorites",
            params={
                "artifactType": "Microsoft.TeamFoundation.Work.TeamBoardSets",
                "artifactScopeType": "Project",
                "artifactScopeId": self.project_id,
                "includeExtendedDetails": "false",
                "api-version": "5.1-preview.1",
            },
        )
        if response.status_code != 200:
            response.raise_for_status()
        return self._extract_boards(response.json())

    @staticmethod
    def is_team_board(board: dict[str, Any]) -> bool:
        board_id = board.get("id")
        return isinstance(board_id, str) and bool(BOARD_ID_RE.match(board_id))

    async def get_boards(self) -> tuple[list[dict[str, Any]], list[str]]:
        """Собирает доски как на /_boards/directory (all-teams provider + REST teams)."""
        merged: dict[str, dict[str, Any]] = {}
        notes: list[str] = []

        async def collect(label: str, fetcher) -> None:
            try:
                items = await fetcher()
                for board in items:
                    if self.is_team_board(board):
                        merged[board["id"]] = board
                if items:
                    notes.append(f"{label}: {len(items)}")
            except httpx.HTTPStatusError as exc:
                notes.append(f"{label}: HTTP {exc.response.status_code}")
            except Exception as exc:
                notes.append(f"{label}: {exc}")

        # Сначала каталог /_boards/directory (все Streams-доски), затем REST teams.
        await collect("directory-fps", self._boards_from_directory)
        await collect("all-teams-provider", self._boards_from_all_teams_provider)
        await collect("directory-hub-provider", self._boards_from_directory_hub_provider)
        await collect("favorites", self._boards_from_favorites)
        await collect("project-teams", lambda: self._boards_from_project_teams(mine=None))
        await collect("project-teams-mine", lambda: self._boards_from_project_teams(mine=True))

        if not merged:
            defaults = self._default_boards()
            for board in defaults:
                merged[board["id"]] = board
            if defaults:
                notes.append(f"default: {len(defaults)}")

        # Повторный проход: встроенные artifactId в HTML/JSON каталога.
        try:
            directory_boards = await self._boards_from_directory()
            for board in directory_boards:
                if self.is_team_board(board):
                    merged[board["id"]] = board
            if directory_boards:
                notes.append(f"directory-merge: {len(directory_boards)}")
        except Exception as exc:
            notes.append(f"directory-merge: {exc}")

        boards = sorted(merged.values(), key=lambda item: item["name"].lower())
        try:
            await self.enrich_board_area_paths(boards)
            notes.append(f"area-paths: {sum(1 for board in boards if board.get('area_path'))}/{len(boards)}")
        except Exception as exc:
            notes.append(f"area-paths: {exc}")
        try:
            await self.enrich_board_kanban_columns(boards)
            notes.append(
                f"kanban-columns: {sum(1 for board in boards if (board.get('raw') or {}).get('kanban_columns'))}/{len(boards)}"
            )
        except Exception as exc:
            notes.append(f"kanban-columns: {exc}")

        return boards, notes

    async def run_wiql(self, query: str) -> dict[str, Any]:
        normalized = " ".join(line.strip() for line in query.strip().splitlines())
        last_response: httpx.Response | None = None
        for api_version in _api_version_candidates():
            response = await self.client.post(
                f"/{self.project}/_apis/wit/wiql",
                params={"api-version": api_version},
                json={"query": normalized},
            )
            last_response = response
            if response.status_code == 200:
                body = response.json()
                return body if isinstance(body, dict) else {}
            if response.status_code == 400 and "out of range" in response.text.lower():
                continue
        if last_response is not None:
            last_response.raise_for_status()
        raise httpx.HTTPError("WIQL request failed without response")

    async def get_change_request_ids(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        limit_results: bool = True,
        area_path: str | None = None,
    ) -> list[int]:
        types = ", ".join(wiql_quote(item) for item in settings.change_type_list)
        project = wiql_quote(self.project)
        states = ", ".join(wiql_quote(state) for state in settings.change_request_state_list)
        period_clause = ""
        if date_from and date_to:
            start = wiql_date(date_from)
            end = wiql_date(date_to)
            period_clause = (
                f" AND [System.ChangedDate] >= {start} AND [System.ChangedDate] <= {end}"
            )
        area_clause = ""
        if area_path:
            area_clause = f" AND [System.AreaPath] UNDER {wiql_quote(area_path)}"

        queries = [
            (
                "full",
                f"SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = {project} "
                f"AND [System.WorkItemType] IN ({types}) AND [System.State] IN ({states})"
                f"{period_clause}{area_clause} ORDER BY [System.ChangedDate] DESC",
            ),
            (
                "no-state-filter",
                f"SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = {project} "
                f"AND [System.WorkItemType] IN ({types})"
                f"{period_clause}{area_clause} ORDER BY [System.ChangedDate] DESC",
            ),
        ]

        last_exc: Exception | None = None
        for _label, query in queries:
            try:
                payload = await self.run_wiql(query)
                ids = [item["id"] for item in as_list(payload.get("workItems")) if isinstance(item, dict)]
                if limit_results and len(ids) > settings.tfs_wiql_max_results:
                    return ids[: settings.tfs_wiql_max_results]
                return ids
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if exc.response.status_code != 400:
                    raise

        if last_exc:
            raise last_exc
        return []

    async def get_work_items_batch(
        self,
        ids: list[int],
        *,
        on_progress: Callable[[int, int], None] | None = None,
    ) -> list[dict[str, Any]]:
        if not ids:
            return []

        result: list[dict[str, Any]] = []
        fields = [
            "System.Id",
            "System.Title",
            "System.WorkItemType",
            "System.State",
            "System.AreaPath",
            "System.CreatedDate",
            "System.ChangedDate",
            "System.ChangedBy",
            "System.AssignedTo",
            "System.TeamProject",
            "System.BoardColumn",
            "System.Tags",
            "Microsoft.VSTS.Common.ClosedDate",
        ]
        fields = wit_api_field_names(fields + settings.scheduling_batch_field_list)

        for offset in range(0, len(ids), settings.tfs_batch_size):
            chunk = ids[offset : offset + settings.tfs_batch_size]
            body: dict[str, Any] = {"ids": chunk, "$expand": "All", "errorPolicy": 2}
            if not settings.tfs_fetch_all_fields:
                body["fields"] = fields
            started = time.monotonic()
            logger.info(
                "tfs_workitems_batch_request stage=changes offset=%s total=%s chunk=%s",
                offset,
                len(ids),
                len(chunk),
            )
            response = await self._post_with_api_versions(
                f"/{self.project}/_apis/wit/workItemsBatch",
                json=body,
            )
            logger.info(
                "tfs_workitems_batch_response stage=changes offset=%s status=%s duration_s=%.2f",
                offset,
                response.status_code,
                time.monotonic() - started,
            )
            response.raise_for_status()
            batch = response.json()
            result.extend(as_work_item_list(batch.get("value") if isinstance(batch, dict) else None))
            if on_progress is not None:
                on_progress(min(offset + len(chunk), len(ids)), len(ids))
            await asyncio.sleep(settings.tfs_request_delay_seconds)

        return result

    async def enrich_scheduling_fields(
        self,
        items: list[dict[str, Any]],
        *,
        on_progress: Callable[[int, int], None] | None = None,
    ) -> None:
        """Дозагрузка Start/Target Date, если batch не вернул пустые поля."""
        if not items:
            return

        scheduling_fields = wit_api_field_names(settings.scheduling_batch_field_list)
        missing_ids = [
            item["id"]
            for item in items
            if isinstance(item, dict)
            and not (item.get("fields") or {}).get(settings.tfs_user_start_date_field)
        ]
        if not missing_ids:
            return

        by_id = {item["id"]: item for item in items if isinstance(item, dict)}
        for offset in range(0, len(missing_ids), settings.tfs_batch_size):
            chunk = missing_ids[offset : offset + settings.tfs_batch_size]
            body: dict[str, Any] = {"ids": chunk, "fields": scheduling_fields, "errorPolicy": 2}
            started = time.monotonic()
            logger.info(
                "tfs_workitems_batch_request stage=enrich offset=%s total=%s chunk=%s",
                offset,
                len(missing_ids),
                len(chunk),
            )
            response = await self._post_with_api_versions(
                f"/{self.project}/_apis/wit/workItemsBatch",
                json=body,
            )
            logger.info(
                "tfs_workitems_batch_response stage=enrich offset=%s status=%s duration_s=%.2f",
                offset,
                response.status_code,
                time.monotonic() - started,
            )
            response.raise_for_status()
            batch = response.json()
            for row in as_list(batch.get("value") if isinstance(batch, dict) else None):
                if not isinstance(row, dict):
                    continue
                item = by_id.get(row["id"])
                if not item:
                    continue
                fields = item.setdefault("fields", {})
                fields.update(row.get("fields") or {})
            if on_progress is not None:
                on_progress(min(offset + len(chunk), len(missing_ids)), len(missing_ids))
            await asyncio.sleep(settings.tfs_request_delay_seconds)

    async def get_work_item_compact_data(self, item_id: int, team_name: str | None = None) -> dict[str, Any] | None:
        if not settings.tfs_fetch_compact_details:
            return None

        route_values = {
            "project": self.project,
            "pivot": "board",
            "teamName": team_name or "",
            "backlogLevel": "Запросы на изменение",
            "viewname": "team-board-content",
            "controller": "Apps",
            "action": "ContributedHub",
        }
        source_page = {
            "url": f"{self.base_url}/{self.project}/_workitems/edit/{item_id}",
            "routeId": "ms.vss-work-web.team-board-content-route",
            "routeValues": route_values,
        }
        payload = {
            "contributionIds": ["ms.vss-work-web.work-item-data-provider"],
            "context": {
                "properties": {
                    "id": item_id,
                    "include-in-recent-activity": False,
                    "pageSource": {
                        "project": {"id": self.project_id, "name": self.project},
                        "sourcePage": source_page,
                    },
                    "sourcePage": source_page,
                }
            },
        }
        response = await self.client.post(
            "/_apis/Contribution/dataProviders/query",
            params={"api-version": "5.1-preview.1"},
            json=payload,
        )
        response.raise_for_status()
        provider = as_dict(as_dict(response.json()).get("data")).get("ms.vss-work-web.work-item-data-provider")
        if not isinstance(provider, dict):
            return None
        return provider.get("work-item-data")

    async def get_requirement_ids_for_changes(self, work_items: list[dict[str, Any]]) -> list[int]:
        ids: set[int] = set()
        for item in work_items:
            for relation in as_relation_list(item.get("relations")):
                attributes = as_dict(relation.get("attributes"))
                if attributes.get("name") not in {"Child", "Related"}:
                    continue
                url = relation.get("url", "")
                try:
                    ids.add(int(url.rstrip("/").split("/")[-1]))
                except ValueError:
                    continue
        return sorted(ids)

    async def get_work_item_updates(self, item_id: int) -> dict[str, Any]:
        last_response: httpx.Response | None = None
        for api_version in _api_version_candidates():
            response = await self.client.get(
                f"/{self.project}/_apis/wit/workItems/{item_id}/updates",
                params={"api-version": api_version},
            )
            last_response = response
            if response.status_code == 200:
                payload = response.json()
                return payload if isinstance(payload, dict) else {}
            if response.status_code == 400 and "out of range" in response.text.lower():
                continue
        if last_response is not None:
            last_response.raise_for_status()
        raise httpx.HTTPError(f"Updates request failed without response for work item {item_id}")

    async def patch_work_item(self, item_id: int, patch_ops: list[dict[str, Any]]) -> dict[str, Any]:
        path = f"/{self.project}/_apis/wit/workitems/{item_id}"
        headers = {"Content-Type": "application/json-patch+json"}
        last_response: httpx.Response | None = None
        for api_version in _api_version_candidates():
            response = await self.client.patch(
                path,
                params={"api-version": api_version},
                json=patch_ops,
                headers=headers,
            )
            last_response = response
            if response.status_code in (200, 201):
                payload = response.json()
                if isinstance(payload, dict):
                    return payload
                return {}
            if response.status_code == 400 and "out of range" in response.text.lower():
                continue
        if last_response is not None:
            last_response.raise_for_status()
        raise httpx.HTTPError(f"PATCH failed without response for work item {item_id}")

    async def _post_with_api_versions(self, path: str, *, json: dict[str, Any]) -> httpx.Response:
        versions = (
            _wit_batch_api_version_candidates()
            if "workitemsbatch" in path.lower()
            else _api_version_candidates()
        )
        last_response: httpx.Response | None = None
        for api_version in versions:
            for attempt in range(1, 4):
                try:
                    response = await self.client.post(path, params={"api-version": api_version}, json=json)
                except (httpx.TimeoutException, httpx.RequestError) as exc:
                    logger.warning(
                        "tfs_post_retry path=%s api_version=%s attempt=%s error=%s",
                        path,
                        api_version,
                        attempt,
                        str(exc),
                    )
                    if attempt >= 3:
                        raise
                    await asyncio.sleep(min(1.0 * attempt, 3.0))
                    continue
                last_response = response
                if response.status_code == 200:
                    return response
                if response.status_code == 400:
                    body_lower = response.text.lower()
                    if "out of range" in body_lower or "preview" in body_lower:
                        break
                return response
        if last_response is not None:
            return last_response
        raise httpx.HTTPError(f"Request failed without response for {path}")

    async def query_contribution_data_provider(self, payload: dict[str, Any]) -> dict[str, Any]:
        last_response: httpx.Response | None = None
        for api_version in CONTRIBUTION_API_VERSIONS:
            response = await self.client.post(
                "/_apis/Contribution/dataProviders/query",
                params={"api-version": api_version},
                json=payload,
            )
            last_response = response
            if response.status_code == 200:
                return as_json_dict(response.json())
            if response.status_code == 400 and "out of range" in response.text.lower():
                continue
        if last_response is not None:
            last_response.raise_for_status()
        raise httpx.HTTPError("Contribution dataProviders/query failed without response")

    def _extract_boards_from_text(self, text: str) -> list[dict[str, Any]]:
        found: dict[str, dict[str, Any]] = {}
        for match in EMBEDDED_BOARD_RE.finditer(text):
            board_id = match.group("id")
            name = json.loads(f'"{match.group("name")}"')
            if not isinstance(name, str):
                continue
            found[board_id] = self._board_from_team_entry(
                board_id,
                name,
                source="directory-fps",
            )
        return list(found.values())

    def _extract_boards(self, payload: Any) -> list[dict[str, Any]]:
        found: dict[str, dict[str, Any]] = {}

        def walk(node: Any) -> None:
            if isinstance(node, dict):
                board_id = node.get("artifactId") or node.get("id")
                name = (
                    node.get("artifactName")
                    or node.get("name")
                    or as_dict(node.get("artifactProperties")).get("TeamName")
                )
                if isinstance(board_id, str) and BOARD_ID_RE.match(board_id) and isinstance(name, str):
                    scope = node.get("artifactScope") if isinstance(node.get("artifactScope"), dict) else {}
                    links = node.get("_links") if isinstance(node.get("_links"), dict) else {}
                    page = links.get("page") if isinstance(links.get("page"), dict) else {}
                    found[board_id] = {
                        "id": board_id,
                        "name": name,
                        "project_id": scope.get("id") or self.project_id,
                        "project_name": scope.get("name") or self.project,
                        "href": page.get("href"),
                        "area_path": node.get("areaPath") or node.get("area_path"),
                        "raw": node,
                    }
                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)

        walk(payload)
        return list(found.values())
