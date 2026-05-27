"""Нормализация колонки/статуса требования (как на фронте requirementColumns)."""
from __future__ import annotations

REQUIREMENT_COLUMN_ORDER = [
    "New",
    "Backlog",
    "Full Analysis",
    "Requirement Review",
    "Development Backlog",
    "Development",
    "Code Review Backlog",
    "Code Review",
    "Test Backlog",
    "Test",
    "Test Review",
    "Acceptance",
    "Merge-Backlog",
    "Merge",
    "Merged",
    "Closed",
]

COLUMN_ALIASES = {
    "requirement review": "Requirement Review",
    "code review backlog": "Code Review Backlog",
    "code-review backlog": "Code Review Backlog",
    "code review": "Code Review",
    "code-review": "Code Review",
    "test backlog": "Test Backlog",
    "test review": "Test Review",
    "merge-backlog": "Merge-Backlog",
    "merge backlog": "Merge-Backlog",
    "merged": "Merge",
    "11. closed": "Closed",
    "arch/full analysis": "Full Analysis",
    "analysis backlog": "Full Analysis",
    "done": "Closed",
    "resolved": "Closed",
    "fixed": "Closed",
    "complete": "Closed",
    "completed": "Closed",
}


def normalize_requirement_column(label: str) -> str:
    trimmed = label.strip()
    if not trimmed:
        return trimmed
    alias = COLUMN_ALIASES.get(trimmed.lower())
    if alias:
        return alias
    for item in REQUIREMENT_COLUMN_ORDER:
        if item.lower() == trimmed.lower():
            return item
    return trimmed


def is_requirement_closed(state: str, column: str | None = None) -> bool:
    raw = (column or "").strip() or state.strip()
    return normalize_requirement_column(raw) == "Closed"
