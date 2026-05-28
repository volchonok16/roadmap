import logging
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_timeout=60,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Индексы, которые не создаются через create_all (CONCURRENTLY нельзя в транзакции).
_PERF_INDEXES = [
    (
        "ix_work_items_type_start_target",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_work_items_type_start_target "
        "ON work_items (work_item_type, start_date, target_date)",
    ),
    (
        "ix_work_items_type_parent",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_work_items_type_parent "
        "ON work_items (work_item_type, parent_id)",
    ),
]


def ensure_perf_indexes() -> None:
    """Создаёт составные индексы вне транзакции (CONCURRENTLY). Безопасно повторять."""
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        for name, ddl in _PERF_INDEXES:
            try:
                conn.execute(text(ddl))
                logger.info("index_ensured name=%s", name)
            except Exception as exc:
                logger.warning("index_ensure_skipped name=%s reason=%s", name, exc)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def close_db_session(db: Session | None) -> None:
    """Вернуть соединение в пул (важно перед долгими await к TFS)."""
    if db is not None:
        db.close()
