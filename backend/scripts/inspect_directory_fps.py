import json
import re
from pathlib import Path

har_path = Path(r"c:\Users\avolc\Downloads\tfs.t2.ru.har")
har = json.loads(har_path.read_text(encoding="utf-8"))
entry = next(
    e
    for e in har["log"]["entries"]
    if "_boards/directory" in e["request"]["url"] and e["request"]["method"] == "GET"
)
text = entry["response"]["content"]["text"]
print("status", entry["response"]["status"])
print("mime", entry["response"]["content"].get("mimeType"))
print("starts", text[:80])
try:
    payload = json.loads(text)
    print("json keys", list(payload.keys())[:10])
except Exception as exc:
    print("not json", exc)

ids = re.findall(r'"artifactId":"([0-9a-fA-F-]{36})"', text)
names = re.findall(r'"artifactName":"([^"]+)"', text)
print("artifactId in text", len(ids), "unique", len(set(ids)))
print("artifactName in text", len(names))
if ids:
    print("sample", ids[0], names[0] if names else "")
