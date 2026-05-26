import json
import re
from pathlib import Path

har_path = Path(r"c:\Users\avolc\Downloads\1tfs.t2.ru.har")
har = json.loads(har_path.read_text(encoding="utf-8"))

for entry in har["log"]["entries"]:
    req_url = entry["request"]["url"]
    if "Contribution/dataProviders/query" not in req_url or entry["response"]["status"] != 200:
        continue
    text = entry["response"]["content"]["text"] or ""
    if "Digital Inbox" not in text:
        continue
    data = json.loads(text)
    print("===", req_url)
    print("request:", (entry["request"].get("postData") or {}).get("text", "")[:300])
    for key, value in data.get("data", {}).items():
        print("provider:", key)
        if isinstance(value, dict):
            for sub_key, sub_val in value.items():
                if isinstance(sub_val, list):
                    print(f"  {sub_key}: list[{len(sub_val)}]")
                    if sub_val and isinstance(sub_val[0], dict):
                        print("    sample keys:", list(sub_val[0].keys()))
                        print("    sample:", sub_val[0])

# teams API - board teams
for entry in har["log"]["entries"]:
    if "/teams" in entry["request"]["url"] and "c56fb5fe" in entry["request"]["url"] and entry["response"]["status"] == 200:
        text = entry["response"]["content"]["text"] or ""
        if "Digital" in text and len(text) < 50000:
            data = json.loads(text)
            teams = data.get("value", data if isinstance(data, list) else [])
            print("=== teams API", entry["request"]["url"][:80], "count", len(teams))
            for team in teams:
                if "digital" in team.get("name", "").lower() or "inbox" in team.get("name", "").lower():
                    print(" ", team.get("id"), team.get("name"))
