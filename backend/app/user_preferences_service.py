from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import UserPreference
from app.tfs_auth import TfsAuth

METRICS_UI_PREFERENCE_KEY = "metrics.ui"


def require_account_key(auth: TfsAuth) -> str:
    key = (auth.account_key or "").strip()
    if not key:
        raise ValueError("account_key is missing on session")
    return key


def read_user_preference(db: Session, account_key: str, preference_key: str) -> dict | None:
    row = (
        db.query(UserPreference)
        .filter(UserPreference.account_key == account_key, UserPreference.preference_key == preference_key)
        .one_or_none()
    )
    if not row:
        return None
    payload = row.payload
    return payload if isinstance(payload, dict) else None


def write_user_preference(db: Session, account_key: str, preference_key: str, payload: dict) -> dict:
    row = (
        db.query(UserPreference)
        .filter(UserPreference.account_key == account_key, UserPreference.preference_key == preference_key)
        .one_or_none()
    )
    if row is None:
        row = UserPreference(account_key=account_key, preference_key=preference_key, payload=payload)
        db.add(row)
    else:
        row.payload = payload
    db.commit()
    db.refresh(row)
    return row.payload if isinstance(row.payload, dict) else payload
