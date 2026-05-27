"""Decode LinkType numbers and relations for ZNI 847358 and error 938245 from HAR."""
import json
import re
from pathlib import Path

HAR = Path(r"c:\Users\avolc\Downloads\tfs.t2.ru.har")
TARGET_IDS = {847358, 938245, 894964}


def main() -> None:
    har = json.loads(HAR.read_text(encoding="utf-8", errors="replace"))
    for entry in har["log"]["entries"]:
        text = (entry.get("response", {}).get("content") or {}).get("text") or ""
        if not any(str(i) in text for i in TARGET_IDS):
            continue
        for wid in TARGET_IDS:
            if f'"id":{wid}' not in text and f'"work-item-id":{wid}' not in text:
                continue
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        dump_relations(data, entry.get("request", {}).get("url", "")[:120])


def dump_relations(node: object, url: str, path: str = "") -> None:
    if isinstance(node, dict):
        if node.get("id") in TARGET_IDS or node.get("work-item-id") in TARGET_IDS:
            print("\n===", url)
            print(json.dumps(node, ensure_ascii=False, indent=2)[:8000])
        for key, value in node.items():
            dump_relations(value, url, f"{path}.{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            dump_relations(value, url, f"{path}[{index}]")


if __name__ == "__main__":
    main()
