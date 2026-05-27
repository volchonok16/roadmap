"""Linked TFS bugs (Ошибка) under change requests and requirements."""

from __future__ import annotations

from typing import Any

from app.config import settings
from app.json_utils import as_dict, as_relation_list

REQUIREMENT_LINK_NAMES = {
    "child",
    "hierarchy-forward",
    "system.linktypes.hierarchy-forward",
    "related",
    "system.linktypes.related",
}


def relation_target_id(relation: dict[str, Any]) -> int | None:
    if relation.get("ID") is not None:
        try:
            return int(relation["ID"])
        except (TypeError, ValueError):
            return None
    url = relation.get("url", "")
    try:
        return int(str(url).rstrip("/").split("/")[-1])
    except ValueError:
        return None


def relation_type(relation: dict[str, Any]) -> str:
    if relation.get("rel"):
        return str(relation["rel"])
    if relation.get("LinkType") is not None:
        return str(relation["LinkType"])
    return str(as_dict(relation.get("attributes")).get("name") or "unknown")


def is_child_or_related_link(relation: dict[str, Any]) -> bool:
    link = relation_type(relation).lower()
    name = str(as_dict(relation.get("attributes")).get("name") or "").lower()
    if link in REQUIREMENT_LINK_NAMES or name in REQUIREMENT_LINK_NAMES:
        return True
    # Compact TFS UI: LinkType 2 = Child (Hierarchy-Forward), 1 = Related
    if relation.get("LinkType") in (1, 2) or link in {"1", "2"}:
        return True
    return False


def is_error_work_item_type(work_item_type: str | None) -> bool:
    if not work_item_type:
        return False
    normalized = work_item_type.strip().lower()
    return normalized in {value.lower() for value in settings.error_type_list}


def is_parent_link(relation: dict[str, Any]) -> bool:
    link = relation_type(relation).lower()
    name = str((relation.get("attributes") or {}).get("name") or "").lower()
    return link in {
        "parent",
        "system.linktypes.hierarchy-reverse",
        "hierarchy-reverse",
    } or name in {"parent"}


def linked_item_parent_map(payloads: list[dict[str, Any]]) -> dict[int, int]:
    """Map linked child id -> source work item id (ЗНИ or Требование)."""
    result: dict[int, int] = {}
    for payload in payloads:
        source_id = payload["id"]
        for relation in as_relation_list(payload.get("relations")):
            if not is_child_or_related_link(relation):
                continue
            child_id = relation_target_id(relation)
            if child_id is not None:
                result[child_id] = source_id
    return result


def parent_ids_from_error_relations(
    error_payloads: list[dict[str, Any]],
    *,
    zni_ids: set[int],
    requirement_ids: set[int],
) -> dict[int, int]:
    """When the error card lists Parent -> ZNI/Требование (Hierarchy-Reverse)."""
    result: dict[int, int] = {}
    allowed_parents = zni_ids | requirement_ids
    for payload in error_payloads:
        error_id = payload["id"]
        for relation in as_relation_list(payload.get("relations")):
            if not is_parent_link(relation):
                continue
            parent_id = relation_target_id(relation)
            if parent_id is not None and parent_id in allowed_parents:
                result[error_id] = parent_id
    return result
