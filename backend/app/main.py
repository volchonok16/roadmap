import asyncio
import logging
from datetime import UTC, date, datetime, timedelta

import httpx
from fastapi import Depends, FastAPI, Form, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, load_only

from app.auth_service import (
    bridge_allowed_origins,
    bridge_result_html,
    bridge_submit_url,
    default_api_url,
    default_app_url,
    login_with_auth,
)
from app.account_key import fallback_account_key, resolve_account_key
from app.auth_sessions import delete_session, get_session, update_session
from app.board_mapping import streams_board_display_name
from app.config import settings
from app.sync_service import (
    supplement_boards_from_area_paths,
    user_start_date_from_fields,
    work_item_kanban_column,
    work_item_release_label,
    work_item_tags,
)
from app.db import Base, SessionLocal, engine, ensure_perf_indexes, get_db
from app.metrics_preferences import default_metrics_ui_preferences, normalize_metrics_ui_preferences
from app.metrics_service import load_metrics_dashboard, refresh_metrics_shipments
from app.user_preferences_service import (
    METRICS_UI_PREFERENCE_KEY,
    read_user_preference,
    require_account_key,
    write_user_preference,
)
from app.models import Board, SyncRun, WorkItem
from app.board_kanban import kanban_columns_from_board_raw
from app.scheduling_push import push_scheduling_items
from app.schemas import (
    AuthDefaultsOut,
    AuthLoginOut,
    BoardOut,
    ChangeRequestOut,
    LinkedErrorOut,
    MetricsDashboardOut,
    MetricsUiPreferencesIn,
    MetricsUiPreferencesOut,
    RequirementOut,
    RoadmapOut,
    SchedulingPushIn,
    SchedulingPushOut,
    SchedulingPushItemOut,
    SyncRunIn,
    SyncRunOut,
    TfsAuthIn,
    TfsAuthStatusOut,
    TfsBridgeIn,
)
from app.sync_service import fail_stale_running_syncs, replace_board_catalog, run_sync
from app.tfs_auth import TfsAuth, build_tfs_auth
from app.tfs_client import TfsClient

logger = logging.getLogger(__name__)

app = FastAPI(title="TFS Roadmap API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    try:
        Base.metadata.create_all(bind=engine)
    except IntegrityError as exc:
        # Multi-worker startup can race on CREATE TABLE checkfirst.
        message = str(exc)
        if "pg_type_typname_nsp_index" not in message or "auth_sessions" not in message:
            raise
    db = SessionLocal()
    try:
        fail_stale_running_syncs(db, max_age_minutes=settings.sync_stale_running_minutes)
    finally:
        db.close()
    ensure_perf_indexes()


async def run_sync_background(
    sync_run_id: int,
    tfs_auth: TfsAuth,
    *,
    mode: str = "full",
    date_from: date | None = None,
    date_to: date | None = None,
) -> None:
    db = SessionLocal()
    try:
        sync_run = db.get(SyncRun, sync_run_id)
        if sync_run is None or sync_run.status != "running":
            return
        await run_sync(db, tfs_auth, sync_run=sync_run, mode=mode, date_from=date_from, date_to=date_to)
    except Exception as exc:
        sync_run = db.get(SyncRun, sync_run_id)
        if sync_run and sync_run.status == "running":
            sync_run.status = "failed"
            sync_run.message = str(exc)
            sync_run.finished_at = datetime.now(UTC)
            db.add(sync_run)
            db.commit()
        logger.exception("sync_run_background_failed id=%s", sync_run_id)
    finally:
        db.close()


async def run_metrics_refresh_background(
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> None:
    db = SessionLocal()
    try:
        refresh_metrics_shipments(db, date_from=date_from, date_to=date_to)
    finally:
        db.close()


def require_tfs_auth(x_session_id: str | None = Header(default=None, alias="X-Session-Id")) -> TfsAuth:
    auth = get_session(x_session_id)
    if auth is None:
        raise HTTPException(status_code=401, detail="TFS session is missing. Sign in on the login form.")
    return auth


async def require_tfs_auth_with_account(
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
) -> TfsAuth:
    auth = require_tfs_auth(x_session_id)
    if auth.account_key:
        return auth
    client = TfsClient(auth)
    try:
        account_key = await resolve_account_key(client, auth)
    except Exception:
        account_key = fallback_account_key(auth)
    finally:
        await client.close()
    from dataclasses import replace

    resolved = replace(auth, account_key=account_key)
    if x_session_id:
        update_session(x_session_id, resolved)
    return resolved


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/auth/defaults", response_model=AuthDefaultsOut)
def auth_defaults() -> AuthDefaultsOut:
    return AuthDefaultsOut(
        base_url=settings.tfs_base_url,
        project=settings.tfs_project,
        project_id=settings.tfs_project_id,
        app_url=default_app_url(),
        api_url=default_api_url(),
        bridge_submit_url=bridge_submit_url(),
        bridge_allowed_origins=bridge_allowed_origins(),
    )


@app.get("/api/auth/status", response_model=TfsAuthStatusOut)
def auth_status(x_session_id: str | None = Header(default=None, alias="X-Session-Id")) -> TfsAuthStatusOut:
    auth = get_session(x_session_id)
    if auth is None:
        return TfsAuthStatusOut(authenticated=False)
    return TfsAuthStatusOut(
        authenticated=True,
        base_url=auth.base_url,
        project=auth.project,
        project_id=auth.project_id,
    )


@app.post("/api/auth/login", response_model=AuthLoginOut)
async def auth_login(payload: TfsAuthIn) -> AuthLoginOut:
    try:
        auth = build_tfs_auth(
            base_url=payload.base_url,
            project=payload.project,
            project_id=payload.project_id,
            domain=payload.domain,
            pat=payload.pat,
            username=payload.username,
            password=payload.password,
            cookie=payload.cookie,
            extra_headers=payload.extra_headers,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await login_with_auth(auth)


@app.post("/api/auth/bridge", response_model=AuthLoginOut)
async def auth_bridge(payload: TfsBridgeIn) -> AuthLoginOut:
    try:
        auth = build_tfs_auth(
            base_url=payload.base_url or settings.tfs_base_url,
            project=payload.project or settings.tfs_project,
            project_id=payload.project_id or settings.tfs_project_id,
            cookie=payload.cookie,
            extra_headers=payload.extra_headers,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await login_with_auth(auth)


@app.post("/api/auth/bridge-submit", response_class=HTMLResponse)
async def auth_bridge_submit(
    cookie: str = Form(default=""),
    base_url: str | None = Form(default=None),
    project: str | None = Form(default=None),
    project_id: str | None = Form(default=None),
    return_url: str | None = Form(default=None),
) -> HTMLResponse:
    app_url = (return_url or default_app_url()).rstrip("/")
    try:
        auth = build_tfs_auth(
            base_url=base_url or settings.tfs_base_url,
            project=project or settings.tfs_project,
            project_id=project_id or settings.tfs_project_id,
            cookie=cookie,
        )
        result = await login_with_auth(auth)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return HTMLResponse(bridge_result_html("", app_url, detail), status_code=exc.status_code)
    except ValueError as exc:
        return HTMLResponse(bridge_result_html("", app_url, str(exc)), status_code=400)

    return HTMLResponse(bridge_result_html(result.session_id, app_url))


@app.post("/api/auth/logout")
def auth_logout(x_session_id: str | None = Header(default=None, alias="X-Session-Id")) -> dict[str, str]:
    delete_session(x_session_id)
    return {"status": "ok"}


@app.get("/api/avatar")
async def avatar(url: str, tfs_auth: TfsAuth = Depends(require_tfs_auth)) -> Response:
    if not url.startswith(tfs_auth.base_url.split("/tfs/")[0]):
        raise HTTPException(status_code=400, detail="Unsupported avatar host")

    client = TfsClient(tfs_auth)
    try:
        response = await client.client.get(url)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Avatar proxy failed: {exc}") from exc
    finally:
        await client.close()

    return Response(content=response.content, media_type=response.headers.get("content-type", "image/png"))


def board_out(row: Board) -> BoardOut:
    return BoardOut(
        id=row.id,
        name=row.name,
        project_id=row.project_id,
        project_name=row.project_name,
        href=row.href,
        area_path=row.area_path,
        columns=kanban_columns_from_board_raw(row.raw if isinstance(row.raw, dict) else None),
    )


def board_out_from_payload(board: dict) -> BoardOut:
    raw = board.get("raw") if isinstance(board.get("raw"), dict) else board
    columns = board.get("kanban_columns")
    if not isinstance(columns, list):
        columns = kanban_columns_from_board_raw(raw if isinstance(raw, dict) else None)
    return BoardOut(
        id=str(board["id"]),
        name=str(board.get("name") or board["id"]),
        project_id=board.get("project_id"),
        project_name=board.get("project_name"),
        href=board.get("href"),
        area_path=board.get("area_path"),
        columns=[str(item).strip() for item in columns if str(item).strip()],
    )


def boards_payload_from_rows(rows: list[Board]) -> list[dict]:
    return [
        {
            "id": row.id,
            "name": row.name,
            "project_id": row.project_id,
            "project_name": row.project_name,
            "href": row.href,
            "area_path": row.area_path,
            "raw": row.raw,
        }
        for row in rows
    ]


def list_boards_out(db: Session) -> list[BoardOut]:
    rows = db.query(Board).order_by(Board.name).all()
    merged = supplement_boards_from_area_paths(db, boards_payload_from_rows(rows))
    return [board_out_from_payload(board) for board in merged]


def apply_board_scope(query, board_ids: list[str] | None):
    if not board_ids:
        return query
    clauses = []
    for board_id in board_ids:
        if board_id.startswith("area:"):
            area_path = board_id.removeprefix("area:").replace("/", "\\")
            clauses.append(WorkItem.area_path == area_path)
        else:
            clauses.append(WorkItem.board_id == board_id)
    if len(clauses) == 1:
        return query.filter(clauses[0])
    return query.filter(or_(*clauses))


def merge_board_catalog(boards_rows: list[Board], change_rows: list[WorkItem]) -> list[BoardOut]:
    """Каталог досок + доски, встречающиеся у ЗНИ (если TFS catalog ещё неполный)."""
    merged: dict[str, BoardOut] = {row.id: board_out(row) for row in boards_rows}
    for row in change_rows:
        if not row.board_id or row.board_id in merged:
            continue
        name = streams_board_display_name(row.area_path) if row.area_path else "Доска"
        merged[row.board_id] = BoardOut(
            id=row.board_id,
            name=name,
            project_name=row.team_project,
            area_path=row.area_path,
        )
    return sorted(merged.values(), key=lambda board: board.name.lower())


def work_item_url(row: WorkItem, tfs_auth: TfsAuth | None = None) -> str:
    base_url = (tfs_auth.base_url if tfs_auth else settings.tfs_base_url).rstrip("/")
    project = tfs_auth.project if tfs_auth else settings.tfs_project
    return f"{base_url}/{project}/_workitems/edit/{row.id}"


# Колонки WorkItem, нужные для /api/roadmap.
# Тяжёлые JSONB (raw, relations, compact_fields, referenced_persons/nodes) не грузим.
_ROADMAP_WORK_ITEM_COLS = [
    WorkItem.id,
    WorkItem.parent_id,
    WorkItem.board_id,
    WorkItem.title,
    WorkItem.work_item_type,
    WorkItem.state,
    WorkItem.area_path,
    WorkItem.area_leaf,
    WorkItem.assigned_to_name,
    WorkItem.assigned_to_unique_name,
    WorkItem.assigned_to_avatar_url,
    WorkItem.start_date,
    WorkItem.target_date,
    WorkItem.closed_date,
    WorkItem.fields,  # нужен для release label + kanban column
]


@app.get("/api/boards", response_model=list[BoardOut])
def boards(db: Session = Depends(get_db)) -> list[BoardOut]:
    return list_boards_out(db)


@app.post("/api/boards/refresh", response_model=list[BoardOut])
async def refresh_boards(
    db: Session = Depends(get_db),
    tfs_auth: TfsAuth = Depends(require_tfs_auth),
) -> list[BoardOut]:
    client = TfsClient(tfs_auth)
    try:
        boards_payload, board_notes = await client.get_boards()
        team_boards = replace_board_catalog(db, boards_payload)
        db.commit()
        if not team_boards:
            raise HTTPException(
                status_code=502,
                detail=f"Не удалось получить доски из TFS. {', '.join(board_notes) if board_notes else 'Пустой ответ.'}",
            )
        return list_boards_out(db)
    except httpx.HTTPStatusError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc
    finally:
        await client.close()


@app.post("/api/sync/run", response_model=SyncRunOut)
async def sync(
    body: SyncRunIn,
    db: Session = Depends(get_db),
    tfs_auth: TfsAuth = Depends(require_tfs_auth),
) -> SyncRunOut:
    fail_stale_running_syncs(db, max_age_minutes=settings.sync_stale_running_minutes)
    latest = db.query(SyncRun).order_by(SyncRun.started_at.desc()).first()
    if latest and latest.status == "running":
        return SyncRunOut.model_validate(latest)
    if latest and latest.started_at:
        started_at = latest.started_at if latest.started_at.tzinfo else latest.started_at.replace(tzinfo=UTC)
        cooldown_until = started_at + timedelta(seconds=settings.sync_button_cooldown_seconds)
        if latest.status == "success" and latest.finished_at and datetime.now(UTC) < cooldown_until:
            return SyncRunOut.model_validate(latest)

    period_mode = body.mode == "period"
    if period_mode and (body.date_from is None or body.date_to is None):
        raise HTTPException(status_code=400, detail="Для режима period нужны параметры from и to.")

    start_message = (
        f"Обновление за период {body.date_from:%d.%m.%Y} — {body.date_to:%d.%m.%Y}…"
        if period_mode
        else "Полная выгрузка из TFS…"
    )
    sync_run = SyncRun(status="running", message=start_message)
    db.add(sync_run)
    db.commit()
    db.refresh(sync_run)
    asyncio.create_task(
        run_sync_background(
            sync_run.id,
            tfs_auth,
            mode=body.mode,
            date_from=body.date_from,
            date_to=body.date_to,
        )
    )
    return SyncRunOut.model_validate(sync_run)


@app.get("/api/sync/runs/latest", response_model=SyncRunOut | None)
def latest_sync(db: Session = Depends(get_db)) -> SyncRunOut | None:
    row = db.query(SyncRun).order_by(SyncRun.started_at.desc()).first()
    return SyncRunOut.model_validate(row) if row else None


@app.get("/api/work-items/{item_id}/raw")
def work_item_raw(item_id: int, db: Session = Depends(get_db)) -> dict:
    row = db.get(WorkItem, item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Work item not found")
    return {
        "id": row.id,
        "fields": row.fields,
        "compactFields": row.compact_fields,
        "relations": row.relations,
        "referencedPersons": row.referenced_persons,
        "referencedNodes": row.referenced_nodes,
        "raw": row.raw,
    }


@app.post("/api/work-items/push-scheduling", response_model=SchedulingPushOut)
async def push_scheduling(
    body: SchedulingPushIn,
    tfs_auth: TfsAuth = Depends(require_tfs_auth),
    db: Session = Depends(get_db),
) -> SchedulingPushOut:
    if not body.items:
        raise HTTPException(status_code=400, detail="Нет изменений для отправки в TFS")
    payload = [
        {"id": item.id, "startDate": item.start_date.isoformat(), "targetDate": item.target_date.isoformat()}
        for item in body.items
    ]
    results = await push_scheduling_items(
        db,
        tfs_auth,
        payload,
        use_user_start_date=body.use_user_start_date,
    )
    out = [SchedulingPushItemOut.model_validate(row) for row in results]
    success_count = sum(1 for row in out if row.ok)
    if success_count == 0:
        first_error = next((row.error for row in out if row.error), "TFS update failed")
        raise HTTPException(status_code=502, detail=first_error)
    return SchedulingPushOut(results=out, success_count=success_count)


@app.get("/api/user/metrics-preferences", response_model=MetricsUiPreferencesOut)
def get_metrics_ui_preferences(
    auth: TfsAuth = Depends(require_tfs_auth_with_account),
    db: Session = Depends(get_db),
) -> MetricsUiPreferencesOut:
    account_key = require_account_key(auth)
    stored = read_user_preference(db, account_key, METRICS_UI_PREFERENCE_KEY)
    if stored is None:
        normalized = default_metrics_ui_preferences()
        write_user_preference(db, account_key, METRICS_UI_PREFERENCE_KEY, normalized)
    else:
        normalized = normalize_metrics_ui_preferences(stored)
    return MetricsUiPreferencesOut.model_validate(normalized)


@app.put("/api/user/metrics-preferences", response_model=MetricsUiPreferencesOut)
def put_metrics_ui_preferences(
    body: MetricsUiPreferencesIn,
    auth: TfsAuth = Depends(require_tfs_auth_with_account),
    db: Session = Depends(get_db),
) -> MetricsUiPreferencesOut:
    account_key = require_account_key(auth)
    payload = normalize_metrics_ui_preferences(body.model_dump(by_alias=False))
    saved = write_user_preference(db, account_key, METRICS_UI_PREFERENCE_KEY, payload)
    normalized = normalize_metrics_ui_preferences(saved)
    return MetricsUiPreferencesOut.model_validate(normalized)


@app.get("/api/metrics/dashboard", response_model=MetricsDashboardOut)
async def metrics_dashboard(
    date_from: date = Query(alias="from"),
    date_to: date = Query(alias="to"),
    refresh: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> MetricsDashboardOut:
    if refresh:
        asyncio.create_task(run_metrics_refresh_background(date_from=date_from, date_to=date_to))
    payload = load_metrics_dashboard(db, date_from=date_from, date_to=date_to)
    return MetricsDashboardOut.model_validate(payload)


@app.get("/api/roadmap", response_model=RoadmapOut)
def roadmap(
    board_id: list[str] = Query(default=[]),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    include_all: bool = Query(default=False),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
    db: Session = Depends(get_db),
) -> RoadmapOut:
    tfs_auth = get_session(x_session_id)
    boards_rows = db.query(Board).order_by(Board.name).all()

    query = db.query(WorkItem).filter(WorkItem.work_item_type == "Запрос на изменение")
    if not include_all:
        if date_from is None or date_to is None:
            raise HTTPException(status_code=400, detail="Параметры from и to обязательны")
        query = query.filter(
            WorkItem.start_date.is_not(None),
            WorkItem.target_date.is_not(None),
            or_(
                and_(WorkItem.start_date >= date_from, WorkItem.start_date <= date_to),
                and_(WorkItem.target_date >= date_from, WorkItem.target_date <= date_to),
                and_(WorkItem.start_date <= date_from, WorkItem.target_date >= date_to),
            ),
        )
    query = apply_board_scope(query, board_id or None)

    _lo = load_only(*_ROADMAP_WORK_ITEM_COLS)
    change_rows = query.options(_lo).order_by(WorkItem.start_date, WorkItem.id).all()
    change_ids = [item.id for item in change_rows]
    requirement_rows = (
        db.query(WorkItem)
        .options(_lo)
        .filter(
            WorkItem.work_item_type == "Требование",
            WorkItem.parent_id.in_(change_ids or [-1]),
        )
        .order_by(WorkItem.id)
        .all()
    )

    parent_ids = set(change_ids) | {row.id for row in requirement_rows}
    error_rows = (
        db.query(WorkItem)
        .options(_lo)
        .filter(
            WorkItem.work_item_type.in_(settings.error_type_list),
            WorkItem.parent_id.in_(list(parent_ids) or [-1]),
        )
        .order_by(WorkItem.id)
        .all()
    )
    errors_by_parent: dict[int, list[LinkedErrorOut]] = {}
    for row in error_rows:
        if row.parent_id is None:
            continue
        errors_by_parent.setdefault(row.parent_id, []).append(
            LinkedErrorOut(
                id=row.id,
                title=row.title,
                state=row.state,
                column=work_item_kanban_column(row.fields),
                assignee=row.assigned_to_name,
                assignee_avatar_url=row.assigned_to_avatar_url,
                tfs_url=work_item_url(row, tfs_auth),
            )
        )

    requirements_by_parent: dict[int, list[RequirementOut]] = {}
    for row in requirement_rows:
        if row.parent_id is None:
            continue
        requirements_by_parent.setdefault(row.parent_id, []).append(
            RequirementOut(
                id=row.id,
                title=row.title,
                state=row.state,
                release=work_item_release_label(row.fields),
                column=work_item_kanban_column(row.fields),
                assignee=row.assigned_to_name,
                assignee_avatar_url=row.assigned_to_avatar_url,
                tfs_url=work_item_url(row, tfs_auth),
                start_date=row.start_date,
                target_date=row.target_date,
                closed_date=row.closed_date,
                errors=errors_by_parent.get(row.id, []),
            )
        )

    boards_for_client = merge_board_catalog(boards_rows, change_rows)
    board_by_id = {board.id: board for board in boards_for_client}
    timeline_anchor = date_from or datetime.now(UTC).date()
    items = [
        ChangeRequestOut(
            id=row.id,
            title=row.title,
            state=row.state,
            release=work_item_release_label(row.fields),
            column=work_item_kanban_column(row.fields),
            tags=work_item_tags(row.fields),
            board_id=row.board_id,
            board_name=(
                board_by_id[row.board_id].name
                if row.board_id in board_by_id
                else (streams_board_display_name(row.area_path) if row.area_path else None)
            ),
            area_path=row.area_path,
            assignee=row.assigned_to_name,
            assignee_avatar_url=row.assigned_to_avatar_url,
            tfs_url=work_item_url(row, tfs_auth),
            start_date=row.start_date or row.target_date or timeline_anchor,
            target_date=row.target_date or row.start_date or timeline_anchor,
            user_start_date=user_start_date_from_fields(row.fields or {}),
            requirements=requirements_by_parent.get(row.id, []),
            errors=errors_by_parent.get(row.id, []),
        )
        for row in change_rows
    ]

    return RoadmapOut(
        boards=boards_for_client,
        items=items,
        generated_at=datetime.now(UTC),
    )
