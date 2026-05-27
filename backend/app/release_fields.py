"""Релиз из полей TFS (FieldInRelease) и строк вида 2026.06.02.0-R."""
from __future__ import annotations

import re
from typing import Any

RELEASE_LABEL_RE = re.compile(r"\b(20\d{2}\.\d{2}\.\d{2}\.\d+-R)\b")

RELEASE_FIELD_KEYS = (
    "FieldInRelease",
    "Custom.FieldInRelease",
    "Logrocon.FoundinRelease",
    "Logrocon.Release",
)


def release_label_from_text(text: str | None) -> str | None:
    if not text:
        return None
    match = RELEASE_LABEL_RE.search(str(text).strip())
    return match.group(1) if match else None


def work_item_release_label(fields: dict[str, Any] | None) -> str | None:
    if not fields:
        return None

    for key in RELEASE_FIELD_KEYS:
        label = release_label_from_text(fields.get(key))
        if label:
            return label

    for key, value in fields.items():
        key_lower = str(key).lower()
        if "inrelease" in key_lower or key_lower.endswith("release"):
            label = release_label_from_text(str(value) if value is not None else None)
            if label:
                return label

    for value in fields.values():
        if isinstance(value, str):
            label = release_label_from_text(value)
            if label:
                return label

    return None
