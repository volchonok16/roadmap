import json
from datetime import date
from pathlib import Path

from app.tfs_client import TfsClient, normalize_compact_fields, parse_tfs_calendar_date, parse_tfs_date, wit_api_field_names
from app.tfs_auth import TfsAuth


def test_parse_ms_json_date() -> None:
    parsed = parse_tfs_date("/Date(0)/")
    assert parsed == date(1970, 1, 1)


def test_parse_ru_date_string() -> None:
    assert parse_tfs_date("25.05.2026 0:00") == date(2026, 5, 25)


def test_wit_api_field_names_skips_numeric_ids() -> None:
    names = wit_api_field_names(
        ["10050", "Microsoft.VSTS.Scheduling.TargetDate", "32", "Custom.StartDate"]
    )
    assert names == ["Microsoft.VSTS.Scheduling.TargetDate", "Custom.StartDate"]


def test_scheduling_batch_fields_exclude_custom() -> None:
    from app.config import settings

    assert "Custom.TargetDate" not in settings.scheduling_batch_field_list
    assert "Microsoft.VSTS.Scheduling.StartDate" in settings.scheduling_batch_field_list


def test_parse_calendar_target_date_msk() -> None:
    # Целевая дата 16.06.2026 0:00 в TFS
    assert parse_tfs_calendar_date("2026-06-15T21:00:00Z") == date(2026, 6, 16)


def test_normalize_compact_aliases() -> None:
    fields = {"2": "Express Analysis", "-7": "Tele2\\Digital\\Streams\\Inbox", "25": "Запрос на изменение"}
    normalized = normalize_compact_fields(fields)
    assert normalized["System.State"] == "Express Analysis"
    assert normalized["System.AreaPath"] == "Tele2\\Digital\\Streams\\Inbox"
    assert normalized["System.WorkItemType"] == "Запрос на изменение"


def _client_stub() -> TfsClient:
    auth = TfsAuth(
        base_url="https://tfs.t2.ru/tfs/Main",
        project="Tele2",
        project_id="c56fb5fe-9752-462a-82ae-0b9e10364510",
        pat="test",
    )
    return TfsClient(auth, use_ntlm=False)


def test_boards_from_all_teams_provider_payload() -> None:
    fixture = Path(__file__).parent / "fixtures" / "all_teams_provider_sample.json"
    payload = json.loads(fixture.read_text(encoding="utf-8"))
    provider = payload["data"]["ms.vss-work-web.all-teams-artifact-picker-data-provider"]
    client = _client_stub()
    boards = client._boards_from_teams_list(provider["teams"], source="test")
    assert len(boards) == 2
    assert boards[0]["id"] == "35f716ec-ed6c-4d13-afe2-e35d9ffa3c59"
    assert boards[0]["name"] == "Digital Inbox"
    assert boards[0]["href"].endswith("/Tele2/_boards/board/t/Digital%20Inbox")


def test_extract_boards_from_directory_fps_text() -> None:
    text = (
        '{"artifactId":"35f716ec-ed6c-4d13-afe2-e35d9ffa3c59",'
        '"artifactName":"Digital Inbox","artifactType":"Microsoft.TeamFoundation.Work.TeamBoardSets"}'
    )
    client = _client_stub()
    boards = client._extract_boards_from_text(text)
    assert len(boards) == 1
    assert boards[0]["name"] == "Digital Inbox"
