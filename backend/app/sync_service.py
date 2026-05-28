import asyncio
import logging
import time
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.board_mapping import BoardLike, board_for_area, board_snapshots_from_rows
from app.linked_errors import is_error_work_item_type, linked_item_parent_map
from app.release_fields import work_item_release_label
from app.config import settings
from app.db import SessionLocal, close_db_session
from app.json_utils import as_dict, as_relation_list, as_work_item_list
from app.metrics_service import refresh_metrics_shipments
from app.models import Board, ChangeRequest, RawTfsPayload, Requirement, SyncRun, WorkItem, WorkItemRelation
from app.tfs_auth import TfsAuth
from app.tfs_errors import friendly_http_error
from app.tfs_client import (
    TfsClient,
    date_from_field_list,
    identity_name,
    normalize_compact_fields,
    parse_tfs_calendar_date,
    parse_tfs_date,
    parse_tfs_datetime,
)

logger = logging.getLogger(__name__)


def user_start_date_from_fields(fields: dict[str, Any]) -> date | None:
    """Дата из поля Start Date (как в форме TFS: Microsoft.VSTS.Scheduling.StartDate)."""
    return parse_tfs_calendar_date(fields.get(settings.tfs_user_start_date_field))


def item_dates(fields: dict[str, Any]) -> tuple[date | None, date | None]:
    start = date_from_field_list(fields, settings.start_date_field_list)
    target = date_from_field_list(fields, settings.target_date_field_list)
    return start, target


def overlaps_period(start: date | None, target: date | None, date_from: date, date_to: date) -> bool:
    if start is None or target is None:
        return False
    return (
        (date_from <= start <= date_to)
        or (date_from <= target <= date_to)
        or (start <= date_from and target >= date_to)
    )


def filter_items_for_period(items: list[dict[str, Any]], date_from: date, date_to: date) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []
    for item in as_work_item_list(items):
        fields = item.get("fields") or {}
        start, target = item_dates(fields)
        if overlaps_period(start, target, date_from, date_to):
            filtered.append(item)
    return filtered


def relation_target_id(relation: dict[str, Any]) -> int | None:
    if relation.get("ID") is not None:
        try:
            return int(relation["ID"])
        except (TypeError, ValueError):
            return None
    url = relation.get("url", "")
    try:
        return int(str(url).rstrip("/").split("/")[-1])
    except ValueError:
        return None


def relation_type(relation: dict[str, Any]) -> str:
    if relation.get("rel"):
        return str(relation["rel"])
    if relation.get("LinkType") is not None:
        return str(relation["LinkType"])
    return str(as_dict(relation.get("attributes")).get("name") or "unknown")


def work_item_kanban_column(fields: dict[str, Any] | None) -> str | None:
    """Название колонки на Kanban-доске TFS (System.BoardColumn), не workflow State."""
    if not fields:
        return None
    value = fields.get("System.BoardColumn")
    if value in (None, ""):
        return None
    return str(value).strip()


def work_item_tags(fields: dict[str, Any] | None) -> list[str]:
    """Теги TFS (System.Tags), разделитель «;»."""
    if not fields:
        return []
    raw = fields.get("System.Tags")
    if raw in (None, ""):
        return []
    return [part.strip() for part in str(raw).split(";") if part.strip()]


def merged_fields(item: dict[str, Any], compact_data: dict[str, Any] | None = None) -> dict[str, Any]:
    fields = dict(item.get("fields") or {})
    compact_fields = normalize_compact_fields((compact_data or {}).get("fields"))
    fields.update({key: value for key, value in compact_fields.items() if value not in (None, "")})
    return fields


def tfs_item_url(item_id: int, tfs_auth: TfsAuth) -> str:
    return f"{tfs_auth.base_url}/{tfs_auth.project}/_workitems/edit/{item_id}"


def item_payload(
    item: dict[str, Any],
    boards: list[BoardLike],
    tfs_auth: TfsAuth,
    parent_id: int | None = None,
    compact_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fields = item.get("fields", {})
    all_fields = merged_fields(item, compact_data)
    compact_fields = normalize_compact_fields((compact_data or {}).get("fields"))
    start, target = item_dates(all_fields)
    if start and not target:
        target = start + timedelta(days=14)

    area_path = all_fields.get("System.AreaPath")
    board = board_for_area(boards, area_path)
    assigned_to_name, assigned_to_unique_name, assigned_to_avatar_url = identity_name(all_fields.get("System.AssignedTo"))
    relations = as_relation_list(item.get("relations"))
    if isinstance(compact_data, dict):
        relations.extend(as_relation_list(compact_data.get("relations")))

    return {
        "id": item["id"],
        "rev": item.get("rev")
        or (compact_data.get("revision") if isinstance(compact_data, dict) else None)
        or item.get("rev"),
        "parent_id": parent_id,
        "board_id": board.id if board else None,
        "title": all_fields.get("System.Title", f"Work item {item['id']}"),
        "work_item_type": all_fields.get("System.WorkItemType", ""),
        "state": all_fields.get("System.State", ""),
        "team_project": all_fields.get("System.TeamProject"),
        "area_path": area_path,
        "area_leaf": all_fields.get("System.AreaLeaf") or (area_path.split("\\")[-1] if area_path else None),
        "assigned_to_name": assigned_to_name,
        "assigned_to_unique_name": assigned_to_unique_name,
        "assigned_to_avatar_url": assigned_to_avatar_url,
        "start_date": start,
        "target_date": target,
        "changed_date": parse_tfs_datetime(all_fields.get("System.ChangedDate")),
        "closed_date": parse_tfs_datetime(all_fields.get("Microsoft.VSTS.Common.ClosedDate")),
        "fields": all_fields,
        "compact_fields": compact_fields,
        "relations": relations,
        "referenced_persons": (compact_data or {}).get("referencedPersons") or {},
        "referenced_nodes": (compact_data or {}).get("referencedNodes") or {},
        "raw": {"batch": item, "compact": compact_data, "url": tfs_item_url(item["id"], tfs_auth)},
    }


def supplement_boards_from_area_paths(db: Session, boards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Добавляет доски по AreaPath из уже выгруженных ЗНИ, если каталог TFS неполный."""
    from app.board_mapping import streams_board_display_name

    merged = {board["id"]: board for board in boards if isinstance(board.get("id"), str)}
    rows = (
        db.query(WorkItem.area_path)
        .filter(
            WorkItem.work_item_type == "Запрос на изменение",
            WorkItem.area_path.is_not(None),
        )
        .distinct()
        .all()
    )
    for (area_path,) in rows:
        if not area_path or not isinstance(area_path, str):
            continue
        synthetic_id = f"area:{area_path}"
        if synthetic_id in merged:
            continue
        leaf = area_path.replace("\\", "/").split("/")[-1]
        name = streams_board_display_name(area_path) if "streams" in area_path.lower() else leaf
        merged[synthetic_id] = {
            "id": synthetic_id,
            "name": name,
            "project_id": None,
            "project_name": None,
            "href": None,
            "area_path": area_path,
            "raw": {"source": "area-path", "area_path": area_path},
        }
    return sorted(merged.values(), key=lambda item: str(item.get("name", "")).lower())


def replace_board_catalog(db: Session, boards_payload: list[dict[str, Any]]) -> list[dict[str, Any]]:
    team_boards = [board for board in boards_payload if TfsClient.is_team_board(board)]
    if not team_boards:
        return supplement_boards_from_area_paths(db, [])

    synced_ids: set[str] = set()
    for board in team_boards:
        upsert_board(db, board)
        synced_ids.add(board["id"])

    # Не удаляем каталог, если TFS вернул мало досок (часто только «моя» команда).
    if len(team_boards) >= 5:
        db.query(Board).filter(Board.id.notin_(synced_ids)).delete(synchronize_session=False)

    full_catalog = supplement_boards_from_area_paths(db, team_boards)
    for board in full_catalog:
        if str(board.get("id", "")).startswith("area:"):
            upsert_board(db, board)
    return full_catalog


def upsert_board(db: Session, board: dict[str, Any]) -> None:
    statement = insert(Board).values(
        id=board["id"],
        project_id=board.get("project_id"),
        project_name=board.get("project_name"),
        name=board["name"],
        href=board.get("href"),
        area_path=board.get("area_path"),
        raw=board.get("raw", board),
    )
    statement = statement.on_conflict_do_update(
        index_elements=[Board.id],
        set_={
            "project_id": statement.excluded.project_id,
            "project_name": statement.excluded.project_name,
            "name": statement.excluded.name,
            "href": statement.excluded.href,
            "area_path": statement.excluded.area_path,
            "raw": statement.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    )
    db.execute(statement)


def upsert_work_item(db: Session, payload: dict[str, Any]) -> None:
    statement = insert(WorkItem).values(**payload)
    statement = statement.on_conflict_do_update(
        index_elements=[WorkItem.id],
        set_={
            "rev": statement.excluded.rev,
            "parent_id": statement.excluded.parent_id,
            "board_id": statement.excluded.board_id,
            "title": statement.excluded.title,
            "work_item_type": statement.excluded.work_item_type,
            "state": statement.excluded.state,
            "team_project": statement.excluded.team_project,
            "area_path": statement.excluded.area_path,
            "area_leaf": statement.excluded.area_leaf,
            "assigned_to_name": statement.excluded.assigned_to_name,
            "assigned_to_unique_name": statement.excluded.assigned_to_unique_name,
            "assigned_to_avatar_url": statement.excluded.assigned_to_avatar_url,
            "start_date": statement.excluded.start_date,
            "target_date": statement.excluded.target_date,
            "changed_date": statement.excluded.changed_date,
            "closed_date": statement.excluded.closed_date,
            "fields": statement.excluded.fields,
            "compact_fields": statement.excluded.compact_fields,
            "relations": statement.excluded.relations,
            "referenced_persons": statement.excluded.referenced_persons,
            "referenced_nodes": statement.excluded.referenced_nodes,
            "raw": statement.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    )
    db.execute(statement)


def upsert_change_request(db: Session, payload: dict[str, Any]) -> None:
    statement = insert(ChangeRequest).values(
        id=payload["id"],
        board_id=payload.get("board_id"),
        state=payload.get("state", ""),
        start_date=payload.get("start_date"),
        target_date=payload.get("target_date"),
        raw=payload.get("raw", {}),
    )
    statement = statement.on_conflict_do_update(
        index_elements=[ChangeRequest.id],
        set_={
            "board_id": statement.excluded.board_id,
            "state": statement.excluded.state,
            "start_date": statement.excluded.start_date,
            "target_date": statement.excluded.target_date,
            "raw": statement.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    )
    db.execute(statement)


def upsert_requirement(db: Session, payload: dict[str, Any]) -> None:
    statement = insert(Requirement).values(
        id=payload["id"],
        parent_id=payload.get("parent_id"),
        state=payload.get("state", ""),
        raw=payload.get("raw", {}),
    )
    statement = statement.on_conflict_do_update(
        index_elements=[Requirement.id],
        set_={
            "parent_id": statement.excluded.parent_id,
            "state": statement.excluded.state,
            "raw": statement.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    )
    db.execute(statement)


def upsert_relation(db: Session, source_id: int, relation: dict[str, Any]) -> int | None:
    target_id = relation_target_id(relation)
    if target_id is None:
        return None
    link_type = relation_type(relation)
    statement = insert(WorkItemRelation).values(
        source_id=source_id,
        target_id=target_id,
        link_type=link_type,
        attributes=as_dict(relation.get("attributes")),
        raw=relation,
    )
    statement = statement.on_conflict_do_update(
        index_elements=[WorkItemRelation.source_id, WorkItemRelation.target_id, WorkItemRelation.link_type],
        set_={
            "attributes": statement.excluded.attributes,
            "raw": statement.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    )
    db.execute(statement)
    return target_id


REQUIREMENT_LINK_NAMES = {
    "child",
    "hierarchy-forward",
    "system.linktypes.hierarchy-forward",
    "related",
    "system.linktypes.related",
}


def is_requirement_link(relation: dict[str, Any]) -> bool:
    link = relation_type(relation).lower()
    name = str(as_dict(relation.get("attributes")).get("name") or "").lower()
    return link in REQUIREMENT_LINK_NAMES or name in REQUIREMENT_LINK_NAMES


def relation_parent_map(change_payloads: list[dict[str, Any]]) -> dict[int, int]:
    result: dict[int, int] = {}
    for payload in change_payloads:
        parent_id = payload["id"]
        for relation in as_relation_list(payload.get("relations")):
            if not is_requirement_link(relation):
                continue
            child_id = relation_target_id(relation)
            if child_id is not None:
                result[child_id] = parent_id
    return result


async def fetch_compact_map(
    client: TfsClient,
    change_items: list[dict[str, Any]],
) -> dict[int, dict[str, Any] | None]:
    if not settings.tfs_fetch_compact_details:
        return {}

    semaphore = asyncio.Semaphore(max(1, settings.tfs_compact_concurrency))
    results: dict[int, dict[str, Any] | None] = {}

    async def fetch_one(item_id: int) -> None:
        async with semaphore:
            try:
                results[item_id] = await client.get_work_item_compact_data(item_id)
            except Exception:
                results[item_id] = None
            await asyncio.sleep(settings.tfs_request_delay_seconds)

    await asyncio.gather(*(fetch_one(item["id"]) for item in as_work_item_list(change_items)))
    return results


def compact_payload_for_raw(payload: dict[str, Any]) -> dict[str, Any]:
    """PostgreSQL JSONB не больше ~256MB — в архив кладём только сводку."""
    compact: dict[str, Any] = {key: value for key, value in payload.items() if key not in {"items", "ids"}}
    ids = payload.get("ids")
    if isinstance(ids, list):
        compact["ids_count"] = len(ids)
        if ids:
            compact["ids_first"] = ids[0]
            compact["ids_last"] = ids[-1]
            compact["ids_sample"] = ids[:30]
    items = payload.get("items")
    if not isinstance(items, list):
        return compact

    compact["items_count"] = len(items)
    if not items:
        return compact

    first = items[0]
    if isinstance(first, dict) and "name" in first and "id" in first:
        compact["boards_sample"] = [{"id": board.get("id"), "name": board.get("name")} for board in items[:12]]
        return compact

    compact["items_sample"] = [
        {
            "id": item.get("id"),
            "type": (item.get("fields") or {}).get("System.WorkItemType"),
            "state": (item.get("fields") or {}).get("System.State"),
            "title": (item.get("fields") or {}).get("System.Title"),
        }
        for item in items[:15]
        if isinstance(item, dict)
    ]
    return compact


def save_raw_payload(db: Session, sync_run_id: int, source: str, payload: dict[str, Any], tfs_url: str | None = None) -> None:
    db.add(
        RawTfsPayload(
            sync_run_id=sync_run_id,
            source=source,
            tfs_url=tfs_url,
            payload=compact_payload_for_raw(payload),
        )
    )


def touch_sync_progress(db: Session, sync_run: SyncRun, message: str) -> None:
    sync_run.message = message
    db.add(sync_run)
    db.commit()


def fail_stale_running_syncs(db: Session, *, max_age_minutes: int = 20) -> int:
    cutoff = datetime.now(UTC) - timedelta(minutes=max_age_minutes)
    rows = (
        db.query(SyncRun)
        .filter(SyncRun.status == "running", SyncRun.started_at < cutoff)
        .all()
    )
    for row in rows:
        row.status = "failed"
        row.message = "Выгрузка зависла или прервана. Нажмите «Обновить» ещё раз."
        row.finished_at = datetime.now(UTC)
        db.add(row)
    if rows:
        db.commit()
    return len(rows)


async def run_sync(
    db: Session,
    tfs_auth: TfsAuth,
    *,
    sync_run: SyncRun | None = None,
    mode: str = "full",
    date_from: date | None = None,
    date_to: date | None = None,
) -> SyncRun:
    started_at_monotonic = time.monotonic()
    period_mode = mode == "period" and date_from is not None and date_to is not None
    if sync_run is None:
        sync_run = SyncRun(status="running", message="Запуск…")
        db.add(sync_run)
        db.commit()
        db.refresh(sync_run)

    sync_run_id = sync_run.id
    logger.info(
        "sync_run_started id=%s mode=%s period=%s from=%s to=%s",
        sync_run_id,
        mode,
        period_mode,
        date_from,
        date_to,
    )

    def open_db() -> tuple[Session, SyncRun]:
        session = SessionLocal()
        row = session.get(SyncRun, sync_run_id)
        if row is None:
            session.close()
            raise RuntimeError(f"Sync run {sync_run_id} not found")
        return session, row

    client = TfsClient(tfs_auth)
    try:
        team_boards: list[dict[str, Any]] = []
        board_notes: list[str] = []
        board_catalog: list[BoardLike] = []
        if period_mode:
            touch_sync_progress(db, sync_run, f"Обновление за период {date_from:%d.%m.%Y} — {date_to:%d.%m.%Y}…")
            board_catalog = board_snapshots_from_rows(db.query(Board).all())
        else:
            touch_sync_progress(db, sync_run, "Полная выгрузка: загрузка досок из TFS…")
            close_db_session(db)
            db = None  # type: ignore[assignment]
            boards_payload, board_notes = await client.get_boards()
            db, sync_run = open_db()
            team_boards = replace_board_catalog(db, boards_payload)
            save_raw_payload(
                db,
                sync_run_id,
                "boards",
                {"notes": board_notes, "total_fetched": len(boards_payload), "items": team_boards},
            )
            db.commit()
            board_catalog = board_snapshots_from_rows(db.query(Board).all())
            close_db_session(db)
            db = None  # type: ignore[assignment]

        if db is None:
            db, sync_run = open_db()
        touch_sync_progress(db, sync_run, "Поиск ЗНИ в TFS (WIQL)…")
        close_db_session(db)
        db = None  # type: ignore[assignment]
        wiql_started = time.monotonic()
        if period_mode:
            change_ids = await client.get_change_request_ids(
                date_from=date_from,
                date_to=date_to,
                limit_results=True,
            )
        else:
            boards_without_area = sum(
                1 for board in board_catalog if not getattr(board, "area_path", None)
            )
            area_paths = sorted(
                {
                    str(board.area_path).strip()
                    for board in board_catalog
                    if getattr(board, "area_path", None) and str(board.area_path).strip()
                }
            )
            change_ids_by_board: list[int] = []
            for index, area_path in enumerate(area_paths, start=1):
                db, sync_run = open_db()
                touch_sync_progress(
                    db,
                    sync_run,
                    f"Поиск ЗНИ по доскам ({index}/{len(area_paths)}): {area_path}",
                )
                close_db_session(db)
                db = None  # type: ignore[assignment]
                ids = await client.get_change_request_ids(
                    limit_results=False,
                    area_path=area_path,
                )
                change_ids_by_board.extend(ids)
            change_ids = list(dict.fromkeys(change_ids_by_board))
            if boards_without_area > 0 or not change_ids:
                db, sync_run = open_db()
                touch_sync_progress(
                    db,
                    sync_run,
                    "Часть досок без AreaPath, добавляю общий поиск ЗНИ…",
                )
                close_db_session(db)
                db = None  # type: ignore[assignment]
                all_ids = await client.get_change_request_ids(limit_results=False)
                change_ids = list(dict.fromkeys([*change_ids, *all_ids]))
        logger.info(
            "sync_run_wiql_done id=%s count=%s duration_s=%.2f",
            sync_run_id,
            len(change_ids),
            time.monotonic() - wiql_started,
        )
        wiql_cap = settings.tfs_wiql_max_results
        cap_note = f" (лимит {wiql_cap})" if not period_mode and len(change_ids) >= wiql_cap else ""
        db, sync_run = open_db()
        touch_sync_progress(db, sync_run, f"Найдено {len(change_ids)} ЗНИ{cap_note}, загрузка карточек…")
        close_db_session(db)
        db = None  # type: ignore[assignment]
        progress_step = max(settings.tfs_batch_size * 10, 1000)
        last_loaded = 0

        def report_change_load(processed: int, total: int) -> None:
            nonlocal last_loaded
            if processed < total and processed - last_loaded < progress_step:
                return
            last_loaded = processed
            session, row = open_db()
            touch_sync_progress(session, row, f"Загрузка карточек ЗНИ: {processed}/{total}")
            close_db_session(session)
            logger.info(
                "sync_run_changes_progress id=%s processed=%s total=%s",
                sync_run_id,
                processed,
                total,
            )

        batch_started = time.monotonic()
        change_items = await client.get_work_items_batch(change_ids, on_progress=report_change_load)
        logger.info(
            "sync_run_changes_loaded id=%s count=%s duration_s=%.2f",
            sync_run_id,
            len(change_items),
            time.monotonic() - batch_started,
        )
        last_enriched = 0

        def report_enrich(processed: int, total: int) -> None:
            nonlocal last_enriched
            if processed < total and processed - last_enriched < progress_step:
                return
            last_enriched = processed
            session, row = open_db()
            touch_sync_progress(session, row, f"Дозагрузка дат ЗНИ: {processed}/{total}")
            close_db_session(session)
            logger.info(
                "sync_run_enrich_progress id=%s processed=%s total=%s",
                sync_run_id,
                processed,
                total,
            )

        enrich_started = time.monotonic()
        await client.enrich_scheduling_fields(change_items, on_progress=report_enrich)
        logger.info(
            "sync_run_enrich_done id=%s duration_s=%.2f",
            sync_run_id,
            time.monotonic() - enrich_started,
        )
        db, sync_run = open_db()
        save_raw_payload(db, sync_run_id, "change_requests_batch", {"ids": change_ids, "items": change_items})

        allowed_states = set(settings.change_request_state_list)
        filtered_changes = [
            item
            for item in as_work_item_list(change_items)
            if (item.get("fields") or {}).get("System.WorkItemType") in settings.change_type_list
            and (item.get("fields") or {}).get("System.State") in allowed_states
        ]
        if period_mode and date_from and date_to:
            filtered_changes = filter_items_for_period(filtered_changes, date_from, date_to)
            touch_sync_progress(db, sync_run, f"В периоде {len(filtered_changes)} ЗНИ с датами, сохранение…")
        touch_sync_progress(
            db,
            sync_run,
            f"Обработка {len(filtered_changes)} ЗНИ"
            + ("" if settings.tfs_fetch_compact_details and len(filtered_changes) <= 80 else " (без детализации)…"),
        )
        fetch_compact = settings.tfs_fetch_compact_details and len(filtered_changes) <= 80
        close_db_session(db)
        db = None  # type: ignore[assignment]
        compact_by_id = await fetch_compact_map(client, filtered_changes) if fetch_compact else {}
        db, sync_run = open_db()

        change_payloads: list[dict[str, Any]] = []
        for item in filtered_changes:
            compact_data = compact_by_id.get(item["id"])
            payload = item_payload(item, board_catalog, tfs_auth, compact_data=compact_data)
            upsert_work_item(db, payload)
            upsert_change_request(db, payload)
            for relation in as_relation_list(payload.get("relations")):
                upsert_relation(db, payload["id"], relation)
            change_payloads.append(payload)
        db.commit()

        if not board_catalog:
            board_catalog = board_snapshots_from_rows(db.query(Board).all())
        parent_map = relation_parent_map(change_payloads)
        touch_sync_progress(db, sync_run, f"Загрузка связей ({len(parent_map)} элементов)…")
        close_db_session(db)
        db = None  # type: ignore[assignment]
        linked_ids = sorted(parent_map.keys())
        total_linked = len(linked_ids)
        requirement_items: list[dict[str, Any]] = []
        linked_chunk = max(500, settings.tfs_batch_size * 20)
        for offset in range(0, total_linked, linked_chunk):
            chunk_ids = linked_ids[offset : offset + linked_chunk]
            chunk_items = await client.get_work_items_batch(chunk_ids)
            await client.enrich_scheduling_fields(chunk_items)
            requirement_items.extend(chunk_items)
            processed = min(offset + len(chunk_ids), total_linked)
            if processed == total_linked or processed % max(linked_chunk * 2, 1000) == 0:
                db, sync_run = open_db()
                touch_sync_progress(
                    db,
                    sync_run,
                    f"Загрузка связей: {processed}/{total_linked}",
                )
                close_db_session(db)
                db = None  # type: ignore[assignment]
        db, sync_run = open_db()
        save_raw_payload(db, sync_run_id, "linked_items_batch", {"ids": linked_ids, "items": requirement_items})
        saved_requirements = 0
        saved_linked_items = 0
        requirement_payloads: list[dict[str, Any]] = []
        for item in as_work_item_list(requirement_items):
            fields = item.get("fields") or {}
            payload = item_payload(item, board_catalog, tfs_auth, parent_id=parent_map.get(item["id"]))
            upsert_work_item(db, payload)
            saved_linked_items += 1
            for relation in as_relation_list(payload.get("relations")):
                upsert_relation(db, payload["id"], relation)
            if fields.get("System.WorkItemType") in settings.requirement_type_list:
                upsert_requirement(db, payload)
                saved_requirements += 1
                requirement_payloads.append(payload)
        db.commit()

        zni_ids = {payload["id"] for payload in change_payloads}
        requirement_ids = {payload["id"] for payload in requirement_payloads}
        error_parent_map = linked_item_parent_map(requirement_payloads)
        known_ids = set(parent_map.keys()) | set(error_parent_map.keys())
        error_ids_to_fetch = sorted(error_parent_map.keys() - known_ids)
        if error_ids_to_fetch:
            touch_sync_progress(db, sync_run, f"Загрузка ошибок ({len(error_ids_to_fetch)})…")
            close_db_session(db)
            db = None  # type: ignore[assignment]
            error_items = await client.get_work_items_batch(error_ids_to_fetch)
            db, sync_run = open_db()
            save_raw_payload(db, sync_run_id, "linked_errors_batch", {"ids": error_ids_to_fetch, "items": error_items})
            for item in as_work_item_list(error_items):
                fields = item.get("fields") or {}
                if not is_error_work_item_type(str(fields.get("System.WorkItemType") or "")):
                    continue
                payload = item_payload(
                    item,
                    board_catalog,
                    tfs_auth,
                    parent_id=error_parent_map.get(item["id"]),
                )
                upsert_work_item(db, payload)
                for relation in as_relation_list(payload.get("relations")):
                    upsert_relation(db, payload["id"], relation)
                saved_linked_items += 1
            db.commit()

        sync_run.status = "success"
        boards_count = len(team_boards) if team_boards else len(board_catalog)
        sync_run.boards_count = boards_count
        sync_run.change_requests_count = len(change_payloads)
        sync_run.requirements_count = saved_requirements
        sync_run.linked_items_count = saved_linked_items
        board_info = f"Доски: {boards_count}"
        if board_notes:
            board_info += f" ({', '.join(board_notes)})"
        mode_label = "Период" if period_mode else "Полная выгрузка"
        sync_run.message = (
            f"{mode_label}: {board_info}, ЗНИ: {len(change_payloads)}, "
            f"связанные элементы: {saved_linked_items}, требования: {saved_requirements}"
        )
        logger.info(
            "sync_run_success id=%s zni=%s linked=%s requirements=%s duration_s=%.2f",
            sync_run_id,
            len(change_payloads),
            saved_linked_items,
            saved_requirements,
            time.monotonic() - started_at_monotonic,
        )
    except httpx.HTTPStatusError as exc:
        if db is None:
            db, sync_run = open_db()
        db.rollback()
        sync_run.status = "failed"
        sync_run.message = friendly_http_error(exc)
        logger.exception(
            "sync_run_http_failed id=%s status=%s url=%s",
            sync_run_id,
            exc.response.status_code,
            str(exc.request.url) if exc.request else "",
        )
    except Exception as exc:
        if db is None:
            db, sync_run = open_db()
        db.rollback()
        sync_run.status = "failed"
        sync_run.message = str(exc)
        logger.exception("sync_run_failed id=%s", sync_run_id)
    finally:
        await client.close()
        if db is None:
            db, sync_run = open_db()
        sync_run.finished_at = datetime.now(UTC)
        db.add(sync_run)
        db.commit()
        db.refresh(sync_run)
        if sync_run.status == "success" and settings.metrics_refresh_after_sync:
            try:
                refresh_metrics_shipments(db)
            except Exception as metrics_exc:
                sync_run.message = f"{sync_run.message} · витрина метрик: {metrics_exc}"
                db.add(sync_run)
                db.commit()
        close_db_session(db)

    return sync_run
