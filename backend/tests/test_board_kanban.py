from app.board_kanban import (
    board_column_resolve_candidates,
    board_id_from_backlog,
    column_names_from_payload,
    kanban_columns_from_board_raw,
    pick_backlog_for_change_requests,
)


def test_pick_change_request_backlog() -> None:
    backlogs = [
        {"id": "Stories", "name": "Stories"},
        {"id": "changerequests", "name": "Запросы на изменение"},
    ]
    picked = pick_backlog_for_change_requests(backlogs, "Запросы на изменение")
    assert picked is not None
    assert picked["id"] == "changerequests"


def test_column_names_from_payload() -> None:
    payload = {
        "value": [
            {"name": "Backlog"},
            {"name": "Design Backlog"},
            {"name": "Pilot"},
        ]
    }
    assert column_names_from_payload(payload) == ["Backlog", "Design Backlog", "Pilot"]


def test_column_names_from_payload_sorts_by_order_field() -> None:
    payload = {
        "value": [
            {"name": "Closed", "order": 3},
            {"name": "Backlog", "order": 0},
            {"name": "Analysis", "order": 1},
        ]
    }
    assert column_names_from_payload(payload) == ["Backlog", "Analysis", "Closed"]


def test_board_column_resolve_candidates() -> None:
    backlog = {
        "id": "changerequests",
        "name": "Запросы на изменение",
        "boardId": "35f716ec-ed6c-4d13-afe2-e35d9ffa3c59",
        "url": "https://tfs.example/Tele2/team/_apis/work/backlogs/changerequests",
    }
    candidates = board_column_resolve_candidates(backlog)
    assert candidates[0] == "35f716ec-ed6c-4d13-afe2-e35d9ffa3c59"
    assert "changerequests" in candidates
    assert "Запросы на изменение" in candidates


def test_board_id_from_backlog_url() -> None:
    backlog = {"url": "https://tfs.example/Tele2/team/_apis/work/backlogs/changerequests"}
    assert board_id_from_backlog(backlog) == "changerequests"


def test_kanban_columns_from_board_raw() -> None:
    raw = {"kanban_columns": ["New", "Development", "Closed"]}
    assert kanban_columns_from_board_raw(raw) == ["New", "Development", "Closed"]
