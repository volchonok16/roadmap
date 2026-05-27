"""Витрина отгрузки по релизам — быстрые метрики без полного /api/roadmap."""
from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import and_, delete, or_
from sqlalchemy.orm import Session

from app.board_mapping import streams_board_display_name
from app.models import Board, MetricsShipment, WorkItem
from app.release_fields import release_label_from_text, work_item_release_label
from app.requirement_status import is_requirement_closed
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


def _board_display_name(board_id: str | None, area_path: str | None, board_by_id: dict[str, Board]) -> str:
    if board_id and board_id in board_by_id:
        return board_by_id[board_id].name
    if area_path:
        return streams_board_display_name(area_path)
    return "Без доски"


def _release_label_from_row(
    req_fields: dict[str, Any],
    req_title: str,
    parent_fields: dict[str, Any],
    parent_title: str,
) -> str | None:
    direct = work_item_release_label(req_fields)
    if direct:
        return direct
    from_title = release_label_from_text(req_title)
    if from_title:
        return from_title
    parent_release = work_item_release_label(parent_fields)
    if parent_release:
        return parent_release
    return release_label_from_text(parent_title)


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


def assign_shipment_release(
    req_fields: dict[str, Any],
    req_title: str,
    parent_fields: dict[str, Any],
    parent_title: str,
    closed_day: date | None,
    schedule: list[tuple[str, date]],
    period_start: date,
) -> str | None:
    """
    Отгрузка в релиз: в первую очередь поле релиза TFS (FieldInRelease),
    как на доске. Если поля нет — окно по ClosedDate между датами релизов.
    """
    label = _release_label_from_row(req_fields, req_title, parent_fields, parent_title)
    if label and parse_release_date_from_label(label):
        return label
    if closed_day is not None:
        return release_window_for_closed_date(closed_day, schedule, period_start)
    return None


def _collect_release_labels_from_db(
    db: Session,
    period_from: date,
    period_to: date,
) -> list[tuple[str, date]]:
    parents = (
        db.query(WorkItem)
        .filter(WorkItem.work_item_type == CHANGE_TYPE, _parent_period_filter(period_from, period_to))
        .all()
    )
    parent_ids = [row.id for row in parents]
    parent_by_id = {row.id: row for row in parents}
    requirements: list[WorkItem] = []
    if parent_ids:
        requirements = (
            db.query(WorkItem)
            .filter(WorkItem.work_item_type == REQUIREMENT_TYPE, WorkItem.parent_id.in_(parent_ids))
            .all()
        )

    labels: list[str] = []
    for parent in parents:
        label = _release_label_from_row({}, parent.title, parent.fields or {}, parent.title)
        if label:
            labels.append(label)
    for req in requirements:
        parent = parent_by_id.get(req.parent_id) if req.parent_id else None
        label = _release_label_from_row(
            req.fields or {},
            req.title,
            parent.fields if parent else {},
            parent.title if parent else "",
        )
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
        .filter(WorkItem.work_item_type == CHANGE_TYPE, _parent_period_filter(period_from, period_to))
        .all()
    )
    parent_ids = [row.id for row in parents]
    parent_by_id = {row.id: row for row in parents}

    requirements: list[WorkItem] = []
    if parent_ids:
        requirements = (
            db.query(WorkItem)
            .filter(WorkItem.work_item_type == REQUIREMENT_TYPE, WorkItem.parent_id.in_(parent_ids))
            .all()
        )

    release_labels: list[str] = []
    for parent in parents:
        label = _release_label_from_row({}, parent.title, parent.fields or {}, parent.title)
        if label:
            release_labels.append(label)
    for req in requirements:
        parent = parent_by_id.get(req.parent_id) if req.parent_id else None
        parent_fields = parent.fields if parent else {}
        parent_title = parent.title if parent else ""
        label = _release_label_from_row(req.fields or {}, req.title, parent_fields or {}, parent_title)
        if label:
            release_labels.append(label)

    schedule = collect_release_schedule(release_labels)
    counts: dict[tuple[str | None, str, str], int] = {}
    without_release = 0

    for req in requirements:
        if not is_requirement_closed(req.state, _kanban_column(req.fields)):
            continue
        closed_day = req.closed_date.date() if req.closed_date else None
        parent = parent_by_id.get(req.parent_id) if req.parent_id else None
        parent_fields = parent.fields if parent else {}
        parent_title = parent.title if parent else ""
        board_id = parent.board_id if parent else None
        area_path = parent.area_path if parent else None
        board_name = _board_display_name(board_id, area_path, board_by_id)

        release = assign_shipment_release(
            req.fields or {},
            req.title,
            parent_fields or {},
            parent_title,
            closed_day,
            schedule,
            period_from,
        )
        if not release:
            without_release += 1
            key = (board_id, board_name, "Без релиза")
            counts[key] = counts.get(key, 0) + 1
            continue
        key = (board_id, board_name, release)
        counts[key] = counts.get(key, 0) + 1

    db.execute(delete(MetricsShipment))
    rows: list[MetricsShipment] = []
    for (board_id, board_name, release_label), count in counts.items():
        release_date = parse_release_date_from_label(release_label) if release_label != "Closed без даты" else None
        rows.append(
            MetricsShipment(
                board_id=board_id,
                board_name=board_name,
                release_label=release_label,
                release_date=release_date,
                shipment_count=count,
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
    zni_count = (
        db.query(WorkItem)
        .filter(WorkItem.work_item_type == CHANGE_TYPE, _parent_period_filter(period_from, period_to))
        .count()
    )

    shipments = [
        {
            "board_id": row.board_id,
            "board_name": row.board_name,
            "release_label": row.release_label,
            "release_date": row.release_date.isoformat() if row.release_date else None,
            "count": row.shipment_count,
        }
        for row in facts
    ]

    schedule = _collect_release_labels_from_db(db, period_from, period_to)
    releases = [
        {"label": label, "date": day.isoformat()}
        for label, day in schedule
    ]

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
        },
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "generated_at": datetime.now(UTC),
        "cache_built_at": built_at,
    }
