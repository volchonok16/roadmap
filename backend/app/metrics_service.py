"""Витрина отгрузки по релизам — быстрые метрики без полного /api/roadmap."""
from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import and_, delete, or_
from sqlalchemy.orm import Session, load_only

from app.board_mapping import streams_board_display_name
from app.config import settings
from app.models import Board, MetricsShipment, WorkItem

from app.release_fields import work_item_release_label
from app.requirement_status import is_requirement_closed

# Минимальные наборы колонок для метрик — не грузим тяжёлые JSONB.
_CHANGE_LO = load_only(WorkItem.id, WorkItem.board_id, WorkItem.area_path, WorkItem.fields)
_REQ_LO = load_only(WorkItem.id, WorkItem.parent_id, WorkItem.state, WorkItem.fields)
_ERROR_LO = load_only(WorkItem.id, WorkItem.parent_id, WorkItem.state, WorkItem.fields)
CHANGE_TYPE = "Запрос на изменение"
REQUIREMENT_TYPE = "Требование"


def _kanban_column(fields: dict[str, Any] | None) -> str | None:
    if not fields:
        return None
    value = fields.get("System.BoardColumn")
    if value in (None, ""):
        return None
    return str(value).strip()


def parse_release_date_from_label(label: str) -> date | None:
    parts = label.split(".")
    if len(parts) < 3:
        return None
    try:
        year = int(parts[0])
        month = int(parts[1])
        day = int(parts[2])
        return date(year, month, day)
    except ValueError:
        return None


def metrics_default_period(today: date | None = None) -> tuple[date, date]:
    anchor = today or datetime.now(UTC).date()
    return date(anchor.year - 3, 1, 1), date(anchor.year + 2, 12, 31)


def _parent_period_filter(date_from: date, date_to: date):
    return and_(
        WorkItem.start_date.is_not(None),
        WorkItem.target_date.is_not(None),
        or_(
            and_(WorkItem.start_date >= date_from, WorkItem.start_date <= date_to),
            and_(WorkItem.target_date >= date_from, WorkItem.target_date <= date_to),
            and_(WorkItem.start_date <= date_from, WorkItem.target_date >= date_to),
        ),
    )


def _board_key(board_id: str | None, area_path: str | None) -> str | None:
    if board_id:
        return board_id
    if area_path:
        return f"area:{area_path}"
    return None


def _board_display_name(board_id: str | None, area_path: str | None, board_by_id: dict[str, Board]) -> str:
    if board_id and board_id in board_by_id:
        return board_by_id[board_id].name
    if area_path:
        area_key = f"area:{area_path}"
        if area_key in board_by_id:
            return board_by_id[area_key].name
        return streams_board_display_name(area_path)
    return "Без доски"


def _linked_release_label(req_fields: dict[str, Any], parent_fields: dict[str, Any]) -> str | None:
    """Релиз из полей TFS: сначала на требовании, затем на родительском ЗНИ."""
    label = work_item_release_label(req_fields)
    if label:
        return label
    return work_item_release_label(parent_fields)


def collect_release_schedule(labels: list[str]) -> list[tuple[str, date]]:
    by_label: dict[str, date] = {}
    for label in labels:
        if not label:
            continue
        parsed = parse_release_date_from_label(label)
        if parsed is None:
            continue
        by_label[label] = parsed
    return sorted(by_label.items(), key=lambda item: item[1])


def release_window_for_closed_date(
    closed_day: date,
    schedule: list[tuple[str, date]],
    period_start: date,
) -> str | None:
    if not schedule:
        return None
    for index, (label, release_day) in enumerate(schedule):
        prev = period_start if index == 0 else schedule[index - 1][1]
        if closed_day > prev and closed_day <= release_day:
            return label
    last_label, last_day = schedule[-1]
    if closed_day > last_day:
        return last_label
    return None


def assign_shipment_release(req_fields: dict[str, Any], parent_fields: dict[str, Any]) -> str | None:
    """
    Отгрузка только при явной привязке к релизу в TFS (FieldInRelease и аналоги).
    Дата Closed без поля релиза не подставляет релиз автоматически.
    """
    label = _linked_release_label(req_fields, parent_fields)
    if label and parse_release_date_from_label(label):
        return label
    return None


def _collect_release_labels_from_db(
    db: Session,
    period_from: date,
    period_to: date,
) -> list[tuple[str, date]]:
    parents = (
        db.query(WorkItem)
        .options(_CHANGE_LO)
        .filter(WorkItem.work_item_type == CHANGE_TYPE, _parent_period_filter(period_from, period_to))
        .all()
    )
    parent_ids = [row.id for row in parents]
    parent_by_id = {row.id: row for row in parents}
    requirements: list[WorkItem] = []
    if parent_ids:
        requirements = (
            db.query(WorkItem)
            .options(_REQ_LO)
            .filter(WorkItem.work_item_type == REQUIREMENT_TYPE, WorkItem.parent_id.in_(parent_ids))
            .all()
        )

    labels: list[str] = []
    for parent in parents:
        label = _linked_release_label({}, parent.fields or {})
        if label:
            labels.append(label)
    for req in requirements:
        parent = parent_by_id.get(req.parent_id) if req.parent_id else None
        label = _linked_release_label(req.fields or {}, parent.fields if parent else {})
        if label:
            labels.append(label)
    return collect_release_schedule(labels)


def refresh_metrics_shipments(
    db: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> datetime:
    period_from, period_to = date_from or metrics_default_period()[0], date_to or metrics_default_period()[1]
    built_at = datetime.now(UTC)

    boards_rows = db.query(Board).order_by(Board.name).all()
    board_by_id = {row.id: row for row in boards_rows}

    parents = (
        db.query(WorkItem)
        .options(_CHANGE_LO)
        .filter(WorkItem.work_item_type == CHANGE_TYPE, _parent_period_filter(period_from, period_to))
        .all()
    )
    parent_ids = [row.id for row in parents]
    parent_by_id = {row.id: row for row in parents}

    requirements: list[WorkItem] = []
    if parent_ids:
        requirements = (
            db.query(WorkItem)
            .options(_REQ_LO)
            .filter(WorkItem.work_item_type == REQUIREMENT_TYPE, WorkItem.parent_id.in_(parent_ids))
            .all()
        )

    release_labels: list[str] = []
    for parent in parents:
        label = _linked_release_label({}, parent.fields or {})
        if label:
            release_labels.append(label)
    for req in requirements:
        parent = parent_by_id.get(req.parent_id) if req.parent_id else None
        parent_fields = parent.fields if parent else {}
        label = _linked_release_label(req.fields or {}, parent_fields or {})
        if label:
            release_labels.append(label)

    # closed_req: closed requirements per (board, release)
    # total_req:  ALL requirements (any state) per (board, release) — green line
    closed_req_counts: dict[tuple[str | None, str, str], int] = {}
    total_req_counts: dict[tuple[str | None, str, str], int] = {}
    req_by_id: dict[int, WorkItem] = {req.id: req for req in requirements}

    for req in requirements:
        parent = parent_by_id.get(req.parent_id) if req.parent_id else None
        parent_fields = parent.fields if parent else {}
        area_path = parent.area_path if parent else None
        board_id = _board_key(parent.board_id if parent else None, area_path)
        board_name = _board_display_name(
            parent.board_id if parent else None,
            area_path,
            board_by_id,
        )
        release = assign_shipment_release(req.fields or {}, parent_fields or {})
        if release:
            key = (board_id, board_name, release)
            total_req_counts[key] = total_req_counts.get(key, 0) + 1
            if is_requirement_closed(req.state, _kanban_column(req.fields)):
                closed_req_counts[key] = closed_req_counts.get(key, 0) + 1
        elif is_requirement_closed(req.state, _kanban_column(req.fields)):
            key = (board_id, board_name, "Без релиза")
            closed_req_counts[key] = closed_req_counts.get(key, 0) + 1

    # closed errors per (board, release) — red line
    error_parent_ids = list(dict.fromkeys([*parent_ids, *list(req_by_id.keys())]))
    errors: list[WorkItem] = []
    if error_parent_ids:
        errors = (
            db.query(WorkItem)
            .options(_ERROR_LO)
            .filter(
                WorkItem.work_item_type.in_(settings.error_type_list),
                WorkItem.parent_id.in_(error_parent_ids),
            )
            .all()
        )

    closed_error_counts: dict[tuple[str | None, str, str], int] = {}
    for error in errors:
        if not is_requirement_closed(error.state, _kanban_column(error.fields)):
            continue
        if not error.parent_id:
            continue
        if error.parent_id in req_by_id:
            # Ошибка привязана к требованию
            req_parent = req_by_id[error.parent_id]
            zni = parent_by_id.get(req_parent.parent_id) if req_parent.parent_id else None
            release = assign_shipment_release(req_parent.fields or {}, zni.fields if zni else {})
            area_path = zni.area_path if zni else None
            b_id = _board_key(zni.board_id if zni else None, area_path)
            b_name = _board_display_name(zni.board_id if zni else None, area_path, board_by_id)
        elif error.parent_id in parent_by_id:
            # Ошибка привязана напрямую к ЗНИ
            zni = parent_by_id[error.parent_id]
            release = assign_shipment_release({}, zni.fields or {})
            area_path = zni.area_path
            b_id = _board_key(zni.board_id, area_path)
            b_name = _board_display_name(zni.board_id, area_path, board_by_id)
        else:
            continue
        if not release:
            continue
        key = (b_id, b_name, release)
        closed_error_counts[key] = closed_error_counts.get(key, 0) + 1

    all_keys = set(closed_req_counts.keys()) | set(total_req_counts.keys()) | set(closed_error_counts.keys())

    db.execute(delete(MetricsShipment))
    rows: list[MetricsShipment] = []
    for key in all_keys:
        b_id, b_name, release_label = key
        release_date = parse_release_date_from_label(release_label) if release_label not in ("Closed без даты", "Без релиза") else None
        rows.append(
            MetricsShipment(
                board_id=b_id,
                board_name=b_name,
                release_label=release_label,
                release_date=release_date,
                shipment_count=closed_req_counts.get(key, 0),
                req_total=total_req_counts.get(key, 0),
                error_count=closed_error_counts.get(key, 0),
                period_from=period_from,
                period_to=period_to,
                built_at=built_at,
            )
        )
    if rows:
        db.add_all(rows)
    db.commit()
    return built_at


def load_metrics_dashboard(
    db: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    period_from, period_to = date_from or metrics_default_period()[0], date_to or metrics_default_period()[1]
    built_at = db.query(MetricsShipment.built_at).order_by(MetricsShipment.built_at.desc()).limit(1).scalar()

    if built_at is None:
        built_at = refresh_metrics_shipments(db, date_from=period_from, date_to=period_to)

    facts = (
        db.query(MetricsShipment)
        .filter(
            MetricsShipment.period_from <= period_to,
            MetricsShipment.period_to >= period_from,
        )
        .order_by(MetricsShipment.release_date, MetricsShipment.board_name)
        .all()
    )

    boards_rows = db.query(Board).order_by(Board.name).all()

    # Используем только id — не грузим JSONB (24k ЗНИ × 20–100 KB = секунды ожидания).
    zni_count = (
        db.query(WorkItem.id)
        .filter(WorkItem.work_item_type == CHANGE_TYPE, _parent_period_filter(period_from, period_to))
        .count()
    )
    parent_ids: list[int] = [
        row[0]
        for row in db.query(WorkItem.id)
        .filter(WorkItem.work_item_type == CHANGE_TYPE, _parent_period_filter(period_from, period_to))
        .all()
    ]
    _CLOSED_STATES = ("Closed", "Resolved", "Done", "Complete", "Completed")

    requirements_count = 0
    active_requirements_count = 0
    requirement_ids: list[int] = []
    if parent_ids:
        req_rows = (
            db.query(WorkItem.id, WorkItem.state)
            .filter(WorkItem.work_item_type == REQUIREMENT_TYPE, WorkItem.parent_id.in_(parent_ids))
            .all()
        )
        requirement_ids = [row[0] for row in req_rows]
        requirements_count = len(requirement_ids)
        active_requirements_count = sum(1 for row in req_rows if row[1] not in _CLOSED_STATES)
    errors_count = 0
    active_errors_count = 0
    error_parent_ids = list(dict.fromkeys([*parent_ids, *requirement_ids]))
    if error_parent_ids:
        err_rows = (
            db.query(WorkItem.id, WorkItem.state)
            .filter(
                WorkItem.work_item_type.in_(settings.error_type_list),
                WorkItem.parent_id.in_(error_parent_ids),
            )
            .all()
        )
        errors_count = len(err_rows)
        active_errors_count = sum(1 for row in err_rows if row[1] not in _CLOSED_STATES)

    shipments = [
        {
            "board_id": row.board_id,
            "board_name": row.board_name,
            "release_label": row.release_label,
            "release_date": row.release_date.isoformat() if row.release_date else None,
            "count": row.shipment_count,
            "req_total": row.req_total,
            "error_count": row.error_count,
        }
        for row in facts
    ]

    # Релизы берём прямо из витрины (не перезапрашиваем WorkItem ещё раз).
    seen_releases: set[str] = set()
    releases: list[dict[str, Any]] = []
    for row in sorted(facts, key=lambda r: (r.release_date or date.min, r.release_label)):
        label = row.release_label
        if label in ("Без релиза",) or label in seen_releases:
            continue
        if row.release_date:
            seen_releases.add(label)
            releases.append({"label": label, "date": row.release_date.isoformat()})

    closed_total = sum(
        row.shipment_count for row in facts if row.release_label not in ("Без релиза",)
    )
    without_release = sum(row.shipment_count for row in facts if row.release_label == "Без релиза")

    return {
        "boards": [
            {
                "id": board.id,
                "name": board.name,
                "project_id": board.project_id,
                "project_name": board.project_name,
                "href": board.href,
                "area_path": board.area_path,
                "columns": [],
            }
            for board in boards_rows
        ],
        "releases": releases,
        "shipments": shipments,
        "totals": {
            "streams": len(boards_rows),
            "zni_count": zni_count,
            "closed_requirements": closed_total + without_release,
            "closed_without_release": without_release,
            "requirements_count": requirements_count,
            "errors_count": errors_count,
            "total_tasks_count": requirements_count + errors_count,
            "active_requirements_count": active_requirements_count,
            "active_errors_count": active_errors_count,
            "active_total_count": active_requirements_count + active_errors_count,
        },
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "generated_at": datetime.now(UTC),
        "cache_built_at": built_at,
    }
