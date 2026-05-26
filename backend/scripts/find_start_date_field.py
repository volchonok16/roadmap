import json
import re
from pathlib import Path

har = json.loads(Path(r"c:\Users\avolc\Downloads\tfs.t2.ru.har").read_text(encoding="utf-8"))
for entry in har["log"]["entries"]:
    text = entry["response"].get("content", {}).get("text") or ""
    if "Запрос на изменение" not in text or "start date" not in text.lower():
        continue
    if "workItemTypes" not in entry["request"]["url"]:
        continue
    # find FieldName near start date label
    for m in re.finditer(
        r'FieldName=\\"([^\\"]+)\\"[^>]*Label=\\"start date\\"',
        text,
        re.I,
    ):
        print("FieldName for label 'start date':", m.group(1))
    for m in re.finditer(
        r'Label=\\"start date\\"[^>]*FieldName=\\"([^\\"]+)\\"',
        text,
        re.I,
    ):
        print("reverse:", m.group(1))
    for m in re.finditer(r'FieldName=\\"([^\\"]+)\\"[^>]{0,120}start date', text, re.I):
        print("near:", m.group(1))
