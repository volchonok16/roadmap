from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class BoardOut(ApiModel):
    id: str
    name: str
    project_id: str | None = None
    project_name: str | None = None
    href: str | None = None
    area_path: str | None = None
    columns: list[str] = Field(default_factory=list)


class LinkedErrorOut(ApiModel):
    id: int
    title: str
    state: str
    column: str | None = None
    assignee: str | None = None
    assignee_avatar_url: str | None = None
    tfs_url: str | None = None


class RequirementOut(ApiModel):
    id: int
    title: str
    state: str
    release: str | None = None
    column: str | None = None
    assignee: str | None = None
    assignee_avatar_url: str | None = None
    tfs_url: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    closed_date: datetime | None = None
    errors: list[LinkedErrorOut] = Field(default_factory=list)


class ChangeRequestOut(ApiModel):
    id: int
    title: str
    state: str
    release: str | None = None
    column: str | None = None
    tags: list[str] = Field(default_factory=list)
    board_id: str | None = None
    board_name: str | None = None
    area_path: str | None = None
    assignee: str | None = None
    assignee_avatar_url: str | None = None
    tfs_url: str | None = None
    start_date: date
    target_date: date
    user_start_date: date | None = None
    requirements: list[RequirementOut]
    errors: list[LinkedErrorOut] = Field(default_factory=list)


class RoadmapOut(ApiModel):
    boards: list[BoardOut]
    items: list[ChangeRequestOut]
    generated_at: datetime


class MetricsReleaseOut(ApiModel):
    label: str
    date: str | None = None


class MetricsShipmentOut(ApiModel):
    board_id: str | None = None
    board_name: str
    release_label: str
    release_date: str | None = None
    count: int
    req_total: int = 0
    error_count: int = 0


class MetricsTotalsOut(ApiModel):
    streams: int = 0
    zni_count: int = 0
    closed_requirements: int = 0
    closed_without_release: int = 0
    requirements_count: int = 0
    errors_count: int = 0
    total_tasks_count: int = 0
    active_requirements_count: int = 0
    active_errors_count: int = 0
    active_total_count: int = 0


class MetricsDashboardOut(ApiModel):
    boards: list[BoardOut]
    releases: list[MetricsReleaseOut]
    shipments: list[MetricsShipmentOut]
    totals: MetricsTotalsOut
    period_from: date
    period_to: date
    generated_at: datetime
    cache_built_at: datetime | None = None


class MetricsGridLayoutItemOut(ApiModel):
    i: str
    x: int
    y: int
    w: int
    h: int
    min_w: int | None = None
    min_h: int | None = None
    max_w: int | None = None
    max_h: int | None = None


class MetricsUiPreferencesOut(ApiModel):
    layout: list[MetricsGridLayoutItemOut]
    chart_types: dict[str, Literal["line", "bar", "area"]] = Field(default_factory=dict)


class MetricsUiPreferencesIn(ApiModel):
    layout: list[MetricsGridLayoutItemOut]
    chart_types: dict[str, Literal["line", "bar", "area"]] = Field(default_factory=dict)


class TfsAuthIn(ApiModel):
    base_url: str | None = None
    project: str
    project_id: str | None = None
    domain: str | None = None
    pat: str | None = None
    username: str | None = None
    password: str | None = None
    cookie: str | None = None
    extra_headers: str | None = None


class TfsBridgeIn(ApiModel):
    cookie: str
    base_url: str | None = None
    project: str | None = None
    project_id: str | None = None
    extra_headers: str | None = None


class AuthDefaultsOut(ApiModel):
    base_url: str
    project: str
    project_id: str | None = None
    app_url: str
    api_url: str
    bridge_submit_url: str
    bridge_allowed_origins: list[str]


class TfsAuthStatusOut(ApiModel):
    authenticated: bool
    base_url: str | None = None
    project: str | None = None
    project_id: str | None = None


class AuthLoginOut(ApiModel):
    session_id: str
    base_url: str
    project: str
    project_id: str | None = None


class SyncRunIn(ApiModel):
    mode: Literal["period", "full"] = "full"
    date_from: date | None = Field(default=None, alias="from")
    date_to: date | None = Field(default=None, alias="to")


class SchedulingPushItemIn(ApiModel):
    id: int
    start_date: date = Field(alias="startDate")
    target_date: date = Field(alias="targetDate")


class SchedulingPushIn(ApiModel):
    items: list[SchedulingPushItemIn]
    use_user_start_date: bool = Field(default=True, alias="useUserStartDate")


class SchedulingPushItemOut(ApiModel):
    id: int
    ok: bool
    error: str | None = None
    start_date: date | None = Field(default=None, alias="startDate")
    target_date: date | None = Field(default=None, alias="targetDate")
    user_start_date: date | None = Field(default=None, alias="userStartDate")


class SchedulingPushOut(ApiModel):
    results: list[SchedulingPushItemOut]
    success_count: int = 0


class SyncRunOut(ApiModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)

    id: int
    status: str
    message: str | None = None
    boards_count: int = 0
    change_requests_count: int = 0
    requirements_count: int = 0
    linked_items_count: int = 0
    started_at: datetime
    finished_at: datetime | None = None
