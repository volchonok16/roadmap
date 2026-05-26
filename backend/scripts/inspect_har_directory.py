import json
from pathlib import Path

har_path = Path(r"c:\Users\avolc\Downloads\1tfs.t2.ru.har")
har = json.loads(har_path.read_text(encoding="utf-8"))
entry = next(
    e
    for e in har["log"]["entries"]
    if e["request"]["method"] == "GET" and "_boards/directory" in e["request"]["url"]
)
payload = json.loads(entry["response"]["content"]["text"])
provider = (
    payload["fps"]["dataProviders"]["data"]["ms.vss-work-web.boards-hub-directory-data-provider"]
)
artifacts = provider["artifacts"]
print("top-level artifacts:", len(artifacts))
for art in artifacts[:5]:
    print("\n---", art.get("name"), "---")
    print("keys:", list(art.keys()))
    children = art.get("artifacts") or art.get("children") or art.get("boardSets")
    if children:
        print("children:", len(children), "first child keys:", list(children[0].keys())[:10])
        for child in children[:4]:
            print(
                " ",
                child.get("artifactName") or child.get("name"),
                child.get("artifactId") or child.get("id"),
                child.get("artifactType"),
            )

# Count all nested TeamBoardSets
count = 0
names: list[str] = []


def walk(node):
    global count
    if isinstance(node, dict):
        if node.get("artifactType") == "Microsoft.TeamFoundation.Work.TeamBoardSets":
            count += 1
            names.append(node.get("artifactName") or "?")
        for v in node.values():
            walk(v)
    elif isinstance(node, list):
        for item in node:
            walk(item)


walk(artifacts)
print("\nnested TeamBoardSets:", count)
print("sample names:", names[:25])
