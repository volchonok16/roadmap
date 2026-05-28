from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(String(64), index=True)
    project_name: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255), index=True)
    href: Mapped[str | None] = mapped_column(Text)
    area_path: Mapped[str | None] = mapped_column(String(512), index=True)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    work_items: Mapped[list["WorkItem"]] = relationship(back_populates="board")


class WorkItem(Base):
    __tablename__ = "work_items"
    __table_args__ = (
        # Ускоряет основной фильтр Roadmap: тип + диапазон дат
        Index("ix_work_items_type_start_target", "work_item_type", "start_date", "target_date"),
        # Ускоряет загрузку требований/ошибок по родителю
        Index("ix_work_items_type_parent", "work_item_type", "parent_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rev: Mapped[int | None] = mapped_column(Integer)
    parent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("work_items.id", ondelete="SET NULL"), index=True)
    board_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("boards.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(Text)
    work_item_type: Mapped[str] = mapped_column(String(128), index=True)
    state: Mapped[str] = mapped_column(String(128), index=True)
    team_project: Mapped[str | None] = mapped_column(String(255), index=True)
    area_path: Mapped[str | None] = mapped_column(String(512), index=True)
    area_leaf: Mapped[str | None] = mapped_column(String(255), index=True)
    assigned_to_name: Mapped[str | None] = mapped_column(String(255), index=True)
    assigned_to_unique_name: Mapped[str | None] = mapped_column(String(255))
    assigned_to_avatar_url: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date, index=True)
    target_date: Mapped[date | None] = mapped_column(Date, index=True)
    changed_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    closed_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    fields: Mapped[dict] = mapped_column(JSONB, default=dict)
    compact_fields: Mapped[dict] = mapped_column(JSONB, default=dict)
    relations: Mapped[list] = mapped_column(JSONB, default=list)
    referenced_persons: Mapped[dict] = mapped_column(JSONB, default=dict)
    referenced_nodes: Mapped[dict] = mapped_column(JSONB, default=dict)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    board: Mapped[Board | None] = relationship(back_populates="work_items")


class WorkItemRelation(Base):
    __tablename__ = "work_item_relations"
    __table_args__ = (UniqueConstraint("source_id", "target_id", "link_type", name="uq_work_item_relation"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_id: Mapped[int] = mapped_column(Integer, ForeignKey("work_items.id", ondelete="CASCADE"), index=True)
    target_id: Mapped[int] = mapped_column(Integer, index=True)
    link_type: Mapped[str] = mapped_column(String(128), index=True)
    attributes: Mapped[dict] = mapped_column(JSONB, default=dict)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChangeRequest(Base):
    __tablename__ = "change_requests"

    id: Mapped[int] = mapped_column(Integer, ForeignKey("work_items.id", ondelete="CASCADE"), primary_key=True)
    board_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("boards.id", ondelete="SET NULL"), index=True)
    state: Mapped[str] = mapped_column(String(128), index=True)
    start_date: Mapped[date | None] = mapped_column(Date, index=True)
    target_date: Mapped[date | None] = mapped_column(Date, index=True)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[int] = mapped_column(Integer, ForeignKey("work_items.id", ondelete="CASCADE"), primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("work_items.id", ondelete="SET NULL"), index=True)
    state: Mapped[str] = mapped_column(String(128), index=True)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RawTfsPayload(Base):
    __tablename__ = "raw_tfs_payloads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sync_run_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("sync_runs.id", ondelete="SET NULL"), index=True)
    source: Mapped[str] = mapped_column(String(128), index=True)
    tfs_url: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class MetricsShipment(Base):
    """Витрина: отгруженные (Closed) требования по доске и релизу."""

    __tablename__ = "metrics_shipments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    board_id: Mapped[str | None] = mapped_column(String(64), index=True)
    board_name: Mapped[str] = mapped_column(String(255), index=True)
    release_label: Mapped[str] = mapped_column(String(128), index=True)
    release_date: Mapped[date | None] = mapped_column(Date, index=True)
    shipment_count: Mapped[int] = mapped_column(Integer, default=0)
    # Количество требований ЛЮБОГО статуса, привязанных к этому релизу (зелёная линия).
    req_total: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Количество закрытых ошибок, привязанных к этому релизу (красная линия).
    error_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    period_from: Mapped[date] = mapped_column(Date, index=True)
    period_to: Mapped[date] = mapped_column(Date, index=True)
    built_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class WorkItemColumnTransition(Base):
    """История переходов Kanban-колонки для метрик возврата в доработку."""

    __tablename__ = "work_item_column_transitions"
    __table_args__ = (
        UniqueConstraint(
            "work_item_id",
            "rev",
            "from_column",
            "to_column",
            name="uq_work_item_column_transition",
        ),
        Index("ix_work_item_column_transitions_work_item", "work_item_id"),
        Index("ix_work_item_column_transitions_changed_at", "changed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    work_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("work_items.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(Integer, index=True)
    board_id: Mapped[str | None] = mapped_column(String(64), index=True)
    board_name: Mapped[str] = mapped_column(String(255), index=True)
    title: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(128), index=True)
    area_path: Mapped[str | None] = mapped_column(String(512), index=True)
    rev: Mapped[int | None] = mapped_column(Integer)
    from_column: Mapped[str] = mapped_column(String(255), index=True)
    to_column: Mapped[str] = mapped_column(String(255), index=True)
    changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserPreference(Base):
    __tablename__ = "user_preferences"
    __table_args__ = (UniqueConstraint("account_key", "preference_key", name="uq_user_preference"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_key: Mapped[str] = mapped_column(String(512), index=True)
    preference_key: Mapped[str] = mapped_column(String(128), index=True)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        index=True,
    )


class SyncRun(Base):
    __tablename__ = "sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    message: Mapped[str | None] = mapped_column(Text)
    boards_count: Mapped[int] = mapped_column(Integer, default=0)
    change_requests_count: Mapped[int] = mapped_column(Integer, default=0)
    requirements_count: Mapped[int] = mapped_column(Integer, default=0)
    linked_items_count: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
