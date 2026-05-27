"""Parse tfs.t2.ru.har for Kanban board column definitions."""
import json
import re
from pathlib import Path

HAR = Path(r"c:\Users\avolc\Downloads\tfs.t2.ru.har")


def main() -> None:
    har = json.loads(HAR.read_text(encoding="utf-8", errors="replace"))
    print("entries:", len(har["log"]["entries"]))
    board_urls = []
    for entry in har["log"]["entries"]:
        url = entry["request"]["url"]
        if any(x in url.lower() for x in ("board", "backlog", "kanban", "column")):
            size = len((entry.get("response", {}).get("content") or {}).get("text") or "")
            board_urls.append((size, entry["request"]["method"], url))
    board_urls.sort(reverse=True)
    print("\nTop board-related responses:")
    for size, method, url in board_urls[:25]:
        print(f"  {size:>8}  {method}  {url[:140]}")

    needles = [
        "Design Backlog",
        "Pre-analysis",
        "Briefing",
        "columnSettings",
        "boardColumns",
        "KanbanBoard",
        "backlog-board",
        "team-board",
        "ms.vss-work-web.kanban",
        "board-page",
    ]
    for entry in har["log"]["entries"]:
        url = entry["request"]["url"]
        text = (entry.get("response", {}).get("content") or {}).get("text") or ""
        if not text:
            continue
        hits = [n for n in needles if n in text or n in url]
        if not hits:
            continue
        req = (entry["request"].get("postData") or {}).get("text") or ""
        print("=" * 80)
        print(entry["request"]["method"], url[:160])
        print("hits:", hits, "resp_bytes:", len(text))
        if req:
            print("req:", req[:600])
        for name in ("columnSettings", "boardColumns", "columns", "backlogLevel"):
            if name in text:
                pos = text.find(name)
                print(f"  snippet[{name}]:", text[pos : pos + 400].replace("\n", " ")[:400])


def dump_favorites() -> None:
    har = json.loads(HAR.read_text(encoding="utf-8", errors="replace"))
    for entry in har["log"]["entries"]:
        if "TeamBoardSets" not in entry["request"]["url"]:
            continue
        text = (entry.get("response", {}).get("content") or {}).get("text") or ""
        print("Favorites response:", text[:3000])


if __name__ == "__main__":
    main()
    print()
    dump_favorites()
