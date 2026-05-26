import json
import re
from pathlib import Path

har_path = Path(r"c:\Users\avolc\Downloads\tfs.t2.ru.har")
if not har_path.exists():
    har_path = Path(r"c:\Users\avolc\Downloads\1tfs.t2.ru.har")
if not har_path.exists():
    raise SystemExit("no har")

har = json.loads(har_path.read_text(encoding="utf-8"))
names: set[str] = set()
for entry in har["log"]["entries"]:
    text = entry["response"].get("content", {}).get("text") or ""
    for m in re.finditer(r'"artifactName":"((?:\\.|[^"\\])*)"', text):
        names.add(json.loads(f'"{m.group(1)}"'))
print("boards:", len(names))
for name in sorted(names):
    print(name)
