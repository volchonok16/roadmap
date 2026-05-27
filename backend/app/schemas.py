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


class RequirementOut(ApiModel):
    id: int
    title: str
    state: str
    column: str | None = None
    assignee: str | None = None
    assignee_avatar_url: str | None = None
    tfs_url: str | None = None
    start_date: date | None = None
    target_date: date | None = None


class ChangeRequestOut(ApiModel):
    id: int
    title: str
    state: str
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


class RoadmapOut(ApiModel):
    boards: list[BoardOut]
    items: list[ChangeRequestOut]
    generated_at: datetime


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
