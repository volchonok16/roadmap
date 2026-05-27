"""Extract relations for error 938245 and ZNI 847358 from HAR compact provider."""
import json
import re
from pathlib import Path

HAR = Path(r"c:\Users\avolc\Downloads\tfs.t2.ru.har")

LINK_TYPE_NAMES = {
    -2: "Parent (Hierarchy-Reverse)",
    2: "Child (Hierarchy-Forward)",
    1: "Related",
    3: "Related (alt?)",
}


def main() -> None:
    har = json.loads(HAR.read_text(encoding="utf-8", errors="replace"))
    for entry in har["log"]["entries"]:
        text = (entry.get("response", {}).get("content") or {}).get("text") or ""
        if "938245" not in text and "847358" not in text:
            continue
        url = entry.get("request", {}).get("url", "")

        # Compact provider: relations with LinkType int
        if '"LinkType"' in text and ("938245" in text or "847358" in text):
            for match in re.finditer(
                r'"work-item-id":(\d+).*?"relations":\[(.*?)\],"work-item-type"',
                text,
                re.DOTALL,
            ):
                wid = int(match.group(1))
                if wid not in (938245, 847358):
                    continue
                rels_raw = "[" + match.group(2) + "]"
                try:
                    rels = json.loads(rels_raw)
                except json.JSONDecodeError:
                    continue
                print(f"\n=== compact work-item-id={wid} ===")
                print(f"URL: {url[:100]}")
                for rel in rels:
                    lt = rel.get("LinkType")
                    print(f"  -> ID {rel.get('ID')}  LinkType={lt} ({LINK_TYPE_NAMES.get(lt, '?')})")

        # REST batch/expand relations
        if '"System.WorkItemType":"Ошибка"' in text or '"System.WorkItemType":"Запрос на изменение"' in text:
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                continue
            items = payload.get("value") or ([payload] if payload.get("id") else [])
            for item in items:
                if not isinstance(item, dict):
                    continue
                iid = item.get("id")
                if iid not in (938245, 847358, 894964):
                    continue
                fields = item.get("fields") or {}
                print(f"\n=== REST id={iid} type={fields.get('System.WorkItemType')} ===")
                print(f"title: {(fields.get('System.Title') or '')[:80]}")
                for rel in item.get("relations") or []:
                    print(
                        f"  rel={rel.get('rel')}  name={((rel.get('attributes') or {}).get('name'))}  "
                        f"url={rel.get('url', '')[-20:]}"
                    )


if __name__ == "__main__":
    main()
