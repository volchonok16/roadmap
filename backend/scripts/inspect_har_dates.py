import json
import re
from pathlib import Path

har = json.loads(Path(r"c:\Users\avolc\Downloads\tfs.t2.ru.har").read_text(encoding="utf-8"))

for entry in har["log"]["entries"]:
    text = entry["response"].get("content", {}).get("text") or ""
    if "Запрос на изменение" not in text or "workItemTypes" not in entry["request"]["url"]:
        continue
    for label in ("start date", "target date", "целевая", "Целевая"):
        for m in re.finditer(
            rf'FieldName=\\"([^\\"]+)\\"[^>]*Label=\\"{label}\\"',
            text,
            re.I,
        ):
            print(f"FieldName for '{label}':", m.group(1))
        for m in re.finditer(
            rf'Label=\\"([^\\"]*{label}[^\\"]*)\\"[^>]*FieldName=\\"([^\\"]+)\\"',
            text,
            re.I,
        ):
            print(f"Label '{m.group(1)}' ->", m.group(2))

print("\n--- work-item-data StartDate samples ---")
for entry in har["log"]["entries"]:
    text = entry["response"].get("content", {}).get("text") or ""
    if "work-item-data" not in text and "workItemData" not in text:
        continue
    if "StartDate" not in text and "start date" not in text.lower():
        continue
    idx = text.find("StartDate")
    if idx >= 0:
        print(text[max(0, idx - 40) : idx + 120].replace("\n", " ")[:200])
