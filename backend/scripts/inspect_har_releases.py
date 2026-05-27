"""Inspect tfs.t2.ru.har for release-related fields and title patterns."""
import json
import re
from pathlib import Path

HAR = Path(r"c:\Users\avolc\Downloads\tfs.t2.ru.har")


def main() -> None:
    har = json.loads(HAR.read_text(encoding="utf-8", errors="replace"))
    release_urls = []
    title_dates = set()
    field_names: set[str] = set()

    for entry in har["log"]["entries"]:
        url = entry["request"]["url"]
        text = (entry.get("response", {}).get("content") or {}).get("text") or ""
        if re.search(r"release|Release|релиз|ReleaseManagement", url, re.I):
            release_urls.append((len(text), entry["request"]["method"], url[:160]))
        if not text:
            continue
        for name in re.findall(r'"([A-Za-z0-9_.]*[Rr]elease[A-Za-z0-9_.]*)"', text):
            if len(name) < 120:
                field_names.add(name)
        for match in re.finditer(r"20\d{2}\.\d{2}\.\d{2}\.\d+-R", text):
            title_dates.add(match.group(0))

    print("Release URLs:", len(release_urls))
    for row in sorted(release_urls, reverse=True)[:15]:
        print(f"  {row[0]:>8}  {row[1]}  {row[2]}")

    print("\nRelease-like field names:", len(field_names))
    for name in sorted(field_names)[:40]:
        print(" ", name)

    print("\nTitle date patterns in HAR:", len(title_dates))
    for item in sorted(title_dates)[:20]:
        print(" ", item)


if __name__ == "__main__":
    main()
