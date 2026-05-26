import json
from pathlib import Path

from app.tfs_client import TfsClient
from app.tfs_auth import TfsAuth


def _client_stub() -> TfsClient:
    auth = TfsAuth(
        base_url="https://tfs.t2.ru/tfs/Main",
        project="Tele2",
        project_id="c56fb5fe-9752-462a-82ae-0b9e10364510",
        pat="test",
    )
    return TfsClient(auth, use_ntlm=False)


def test_boards_from_directory_fps_favorites() -> None:
    har_path = Path(r"c:\Users\avolc\Downloads\1tfs.t2.ru.har")
    if not har_path.exists():
        return
    har = json.loads(har_path.read_text(encoding="utf-8"))
    entry = next(
        e
        for e in har["log"]["entries"]
        if e["request"]["method"] == "GET" and "_boards/directory" in e["request"]["url"]
    )
    payload = json.loads(entry["response"]["content"]["text"])
    client = _client_stub()
    boards = client._boards_from_directory_fps(payload)
    names = {board["name"] for board in boards}
    assert "Digital Inbox" in names
    assert "Digital Streams B2b" in names
    assert len(boards) >= 4
