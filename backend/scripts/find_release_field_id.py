import json
import re
from pathlib import Path

HAR = Path(r"c:\Users\avolc\Downloads\tfs.t2.ru.har")
RELEASE_VALUE_RE = re.compile(r'"(?P<key>\d+)":"(?P<value>20\d{2}\.\d{2}\.\d{2}\.\d+-R)"')


def main() -> None:
    har = json.loads(HAR.read_text(encoding="utf-8", errors="replace"))
    for entry in har["log"]["entries"]:
        if "1185189" not in entry["request"]["url"]:
            continue
        text = (entry.get("response", {}).get("content") or {}).get("text") or ""
        for match in RELEASE_VALUE_RE.finditer(text):
            print(f"compact key {match.group('key')} -> {match.group('value')}")
        idx = text.find("2026.06.02.0-R")
        if idx >= 0:
            print("context:", text[idx - 60 : idx + 60].replace("\n", " "))
        break


if __name__ == "__main__":
    main()
