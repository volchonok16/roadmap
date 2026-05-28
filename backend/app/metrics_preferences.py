from __future__ import annotations

from typing import Any

METRICS_GRID_COLS = 12
WIDGET_IDS = frozenset({"streams-count", "release-shipment", "release-progress", "analysis-stay", "test-rework"})
CHART_TYPES = frozenset({"line", "bar", "area"})

DEFAULT_LAYOUT: list[dict[str, Any]] = [
    {"i": "streams-count", "x": 0, "y": 0, "w": 3, "h": 3, "minW": 2, "minH": 2, "maxW": 4, "maxH": 8},
    {"i": "release-shipment", "x": 3, "y": 0, "w": 9, "h": 9, "minW": 4, "minH": 4, "maxW": 12, "maxH": 24},
    {"i": "release-progress", "x": 0, "y": 9, "w": 12, "h": 9, "minW": 4, "minH": 4, "maxW": 12, "maxH": 24},
    {"i": "analysis-stay", "x": 0, "y": 18, "w": 12, "h": 8, "minW": 4, "minH": 4, "maxW": 12, "maxH": 24},
    {"i": "test-rework", "x": 0, "y": 26, "w": 12, "h": 8, "minW": 4, "minH": 4, "maxW": 12, "maxH": 24},
]
DEFAULT_CHART_TYPES = {"release-shipment": "line"}


def default_metrics_ui_preferences() -> dict[str, Any]:
    return {"layout": [dict(item) for item in DEFAULT_LAYOUT], "chart_types": dict(DEFAULT_CHART_TYPES)}


def _is_valid_layout_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    widget_id = item.get("i")
    if widget_id not in WIDGET_IDS:
        return False
    try:
        x, y, w, h = int(item["x"]), int(item["y"]), int(item["w"]), int(item["h"])
    except (KeyError, TypeError, ValueError):
        return False
    if w < 1 or h < 1 or x < 0 or y < 0 or x + w > METRICS_GRID_COLS:
        return False
    return True


def normalize_layout(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return [dict(item) for item in DEFAULT_LAYOUT]
    items = [item for item in raw if _is_valid_layout_item(item)]
    ids = {item["i"] for item in items}
    # Добавляем отсутствующие новые виджеты из дефолта (для миграции старых раскладок)
    missing = [dict(item) for item in DEFAULT_LAYOUT if item["i"] not in ids]
    if missing:
        items = items + missing
    ids = {item["i"] for item in items}
    if not WIDGET_IDS.issubset(ids):
        return [dict(item) for item in DEFAULT_LAYOUT]
    return items


def normalize_chart_types(raw: Any) -> dict[str, str]:
    result = dict(DEFAULT_CHART_TYPES)
    if not isinstance(raw, dict):
        return result
    for widget_id in WIDGET_IDS:
        value = raw.get(widget_id)
        if isinstance(value, str) and value in CHART_TYPES:
            result[widget_id] = value
    return result


def normalize_metrics_ui_preferences(raw: dict[str, Any] | None) -> dict[str, Any]:
    payload = raw if isinstance(raw, dict) else {}
    return {
        "layout": normalize_layout(payload.get("layout")),
        "chart_types": normalize_chart_types(payload.get("chart_types")),
    }
