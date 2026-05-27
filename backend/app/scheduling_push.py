"""Отправка сроков ЗНИ в TFS после правки на таймлайне."""
from __future__ import annotations

from datetime import date
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import WorkItem
from app.sync_service import item_dates, user_start_date_from_fields
from app.tfs_auth import TfsAuth
from app.tfs_client import TfsClient, format_tfs_calendar_datetime, parse_tfs_calendar_date
from app.tfs_errors import friendly_http_error


def _start_field_for_push(use_user_start_date: bool) -> str:
    if use_user_start_date:
        return settings.tfs_user_start_date_field
    return settings.start_date_field_list[0] if settings.start_date_field_list else settings.tfs_user_start_date_field


def _target_field_for_push() -> str:
    return settings.target_date_field_list[0] if settings.target_date_field_list else "Microsoft.VSTS.Scheduling.TargetDate"


def build_scheduling_patch_ops(
    start_date: date,
    target_date: date,
    *,
    use_user_start_date: bool,
) -> list[dict[str, Any]]:
    if target_date < start_date:
        raise ValueError("Плановая дата не может быть раньше даты старта")
    start_field = _start_field_for_push(use_user_start_date)
    target_field = _target_field_for_push()
    return [
        {"op": "replace", "path": f"/fields/{start_field}", "value": format_tfs_calendar_datetime(start_date)},
        {"op": "replace", "path": f"/fields/{target_field}", "value": format_tfs_calendar_datetime(target_date)},
    ]


def apply_work_item_fields_from_tfs(row: WorkItem, tfs_item: dict[str, Any]) -> None:
    fields = dict(tfs_item.get("fields") or {})
    row.rev = tfs_item.get("rev") or row.rev
    row.fields = {**(row.fields or {}), **fields}
    start, target = item_dates(row.fields)
    if start:
        row.start_date = start
    if target:
        row.target_date = target


async def push_scheduling_items(
    db: Session,
    tfs_auth: TfsAuth,
    items: list[dict[str, Any]],
    *,
    use_user_start_date: bool,
) -> list[dict[str, Any]]:
    """items: [{id, startDate, targetDate}] — ISO dates."""
    results: list[dict[str, Any]] = []
    client = TfsClient(tfs_auth)
    try:
        for raw in items:
            item_id = int(raw["id"])
            start_date = date.fromisoformat(str(raw["startDate"]))
            target_date = date.fromisoformat(str(raw["targetDate"]))
            row = db.get(WorkItem, item_id)
            if row is None:
                results.append({"id": item_id, "ok": False, "error": "Work item not found"})
                continue
            if row.work_item_type not in ("Запрос на изменение", "Требование"):
                results.append(
                    {
                        "id": item_id,
                        "ok": False,
                        "error": "Only change requests and requirements can be updated",
                    }
                )
                continue
            item_use_user_start = (
                use_user_start_date if row.work_item_type == "Запрос на изменение" else False
            )
            try:
                try:
                    patch_ops = build_scheduling_patch_ops(
                        start_date,
                        target_date,
                        use_user_start_date=item_use_user_start,
                    )
                except ValueError as exc:
                    results.append({"id": item_id, "ok": False, "error": str(exc)})
                    continue
                updated = await client.patch_work_item(item_id, patch_ops)
                apply_work_item_fields_from_tfs(row, updated)
                db.add(row)
                results.append(
                    {
                        "id": item_id,
                        "ok": True,
                        "startDate": row.start_date.isoformat() if row.start_date else None,
                        "targetDate": row.target_date.isoformat() if row.target_date else None,
                        "userStartDate": user_start_date_from_fields(row.fields or {}).isoformat()
                        if user_start_date_from_fields(row.fields or {})
                        else None,
                    }
                )
            except httpx.HTTPStatusError as exc:
                results.append({"id": item_id, "ok": False, "error": friendly_http_error(exc)})
            except Exception as exc:
                results.append({"id": item_id, "ok": False, "error": str(exc)})
        db.commit()
    finally:
        await client.close()
    return results
