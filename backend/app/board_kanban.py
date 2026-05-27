"""Колонки Kanban-досок TFS (REST work/backlogs + work/boards/.../columns)."""
from __future__ import annotations

from typing import Any

from app.config import settings
from app.json_utils import as_list


def kanban_columns_from_board_raw(raw: dict[str, Any] | None) -> list[str]:
    if not raw:
        return []
    stored = raw.get("kanban_columns")
    if isinstance(stored, list):
        return [str(item).strip() for item in stored if str(item).strip()]
    return []


def pick_backlog_for_change_requests(backlogs: list[dict[str, Any]], backlog_name: str) -> dict[str, Any] | None:
    target = backlog_name.strip().lower()
    for row in backlogs:
        name = str(row.get("name") or "").strip()
        if name.lower() == target:
            return row
    for row in backlogs:
        name = str(row.get("name") or "").strip().lower()
        if "изменен" in name or "change request" in name:
            return row
    return None


def board_id_from_backlog(backlog: dict[str, Any]) -> str | None:
    backlog_id = backlog.get("id")
    if isinstance(backlog_id, str) and backlog_id.strip():
        return backlog_id.strip()
    url = backlog.get("url")
    if isinstance(url, str) and "/" in url:
        return url.rstrip("/").split("/")[-1]
    return None


def column_names_from_payload(payload: Any) -> list[str]:
    """Имена колонок в порядке доски TFS (массив value или поле order)."""
    rows = as_list(payload.get("value") if isinstance(payload, dict) else None)
    ordered: list[tuple[int, int, str]] = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        name = row.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        order_raw = row.get("order")
        order = int(order_raw) if isinstance(order_raw, (int, float)) else index
        ordered.append((order, index, name.strip()))
    if not ordered:
        return []
    ordered.sort(key=lambda item: (item[0], item[1]))
    return [name for _, _, name in ordered]


def board_column_resolve_candidates(backlog: dict[str, Any]) -> list[str]:
    """Варианты идентификатора доски для REST .../boards/{board}/columns."""
    candidates: list[str] = []
    seen: set[str] = set()

    def push(value: str | None) -> None:
        if not value:
            return
        trimmed = value.strip()
        if not trimmed or trimmed in seen:
            return
        seen.add(trimmed)
        candidates.append(trimmed)

    for key in ("boardId", "boardReference"):
        raw = backlog.get(key)
        if isinstance(raw, str):
            push(raw)
    push(board_id_from_backlog(backlog))
    name = str(backlog.get("name") or "").strip()
    push(name)
    return candidates


def merge_board_kanban_columns(board: dict[str, Any], columns: list[str]) -> None:
    raw = dict(board.get("raw") or {})
    if columns:
        raw["kanban_columns"] = columns
        raw["kanban_backlog"] = settings.tfs_kanban_backlog_name
    board["raw"] = raw
    board["kanban_columns"] = columns
