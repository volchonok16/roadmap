"""Inspect HAR for error (Ошибка) work items and link types."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

HAR = Path(r"c:\Users\avolc\Downloads\tfs.t2.ru.har")


def extract_json_blobs(text: str) -> list[object]:
    blobs: list[object] = []
    for match in re.finditer(r"\{[^{}]*\"relations\"", text):
        start = match.start()
        depth = 0
        for index in range(start, min(start + 500_000, len(text))):
            char = text[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    chunk = text[start : index + 1]
                    try:
                        blobs.append(json.loads(chunk))
                    except json.JSONDecodeError:
                        pass
                    break
    return blobs


def walk_items(node: object, out: list[dict]) -> None:
    if isinstance(node, dict):
        if "id" in node and ("fields" in node or "relations" in node):
            out.append(node)
        for value in node.values():
            walk_items(value, out)
    elif isinstance(node, list):
        for value in node:
            walk_items(value, out)


def relation_info(rel: dict) -> tuple[str, str, int | None]:
    rel_type = rel.get("rel") or rel.get("LinkType") or ""
    attrs = rel.get("attributes") or {}
    name = attrs.get("name") or attrs.get("Name") or ""
    target = rel.get("ID")
    if target is None and rel.get("url"):
        try:
            target = int(str(rel["url"]).rstrip("/").split("/")[-1])
        except ValueError:
            target = None
    return str(rel_type), str(name), int(target) if target is not None else None


def main() -> None:
    har = json.loads(HAR.read_text(encoding="utf-8", errors="replace"))
    all_items: list[dict] = []
    link_counter: Counter[str] = Counter()
    error_items: list[dict] = []
    error_outgoing: Counter[str] = Counter()
    error_incoming_samples: list[tuple[int, str, str, int | None]] = []

    for entry in har["log"]["entries"]:
        text = (entry.get("response", {}).get("content") or {}).get("text") or ""
        if not text or ("Ошибк" not in text and "relations" not in text and "WorkItemType" not in text):
            continue
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = None
        if payload is not None:
            walk_items(payload, all_items)
        else:
            for blob in extract_json_blobs(text):
                walk_items(blob, all_items)

    by_id: dict[int, dict] = {}
    for item in all_items:
        item_id = item.get("id")
        if isinstance(item_id, int):
            by_id[item_id] = item

    for item in by_id.values():
        fields = item.get("fields") or {}
        wi_type = fields.get("System.WorkItemType") or fields.get("25") or ""
        if "Ошибк" not in str(wi_type) and "Bug" not in str(wi_type):
            continue
        error_items.append(item)
        for rel in item.get("relations") or []:
            if not isinstance(rel, dict):
                continue
            rt, name, tid = relation_info(rel)
            error_outgoing[f"{rt}|{name}"] += 1

    # Relations pointing TO errors from parents in HAR
    parent_types: Counter[str] = Counter()
    for item in by_id.values():
        fields = item.get("fields") or {}
        parent_type = str(fields.get("System.WorkItemType") or fields.get("25") or "")
        for rel in item.get("relations") or []:
            if not isinstance(rel, dict):
                continue
            rt, name, tid = relation_info(rel)
            if tid is None or tid not in by_id:
                continue
            child = by_id[tid]
            child_fields = child.get("fields") or {}
            child_type = str(child_fields.get("System.WorkItemType") or child_fields.get("25") or "")
            if "Ошибк" not in child_type and "Bug" not in child_type.lower():
                continue
            link_counter[f"{parent_type} -> {child_type}: {rt} / {name}"] += 1
            if len(error_incoming_samples) < 25:
                error_incoming_samples.append((item["id"], parent_type, f"{rt} / {name}", tid))

    print(f"Work items in HAR (parsed): {len(by_id)}")
    print(f"Error items in HAR: {len(error_items)}")
    print("\n=== Links FROM parents TO errors (top) ===")
    for key, count in link_counter.most_common(20):
        print(f"  {count:4d}  {key}")
    print("\n=== Sample parent -> error ===")
    for parent_id, ptype, link, err_id in error_incoming_samples[:15]:
        err = by_id.get(err_id, {})
        title = (err.get("fields") or {}).get("System.Title", "")[:70]
        print(f"  #{parent_id} ({ptype}) --[{link}]--> #{err_id} {title!r}")
    print("\n=== Outgoing links FROM errors ===")
    for key, count in error_outgoing.most_common(15):
        print(f"  {count:4d}  {key}")

    # Compact API field keys for WorkItemType on errors
    if error_items:
        sample = error_items[0]
        print("\n=== Sample error fields keys (first item) ===")
        fields = sample.get("fields") or {}
        for k in sorted(fields.keys())[:25]:
            print(f"  {k}: {str(fields[k])[:60]}")


if __name__ == "__main__":
    main()
