from unittest.mock import MagicMock

from app.json_utils import as_dict, as_list, as_relation_list, as_work_item_list
from app.sync_service import item_payload, relation_type
from app.tfs_auth import TfsAuth


def test_as_dict_handles_null_json_object() -> None:
    assert as_dict(None) == {}
    assert as_dict({"a": 1}) == {"a": 1}


def test_as_list_handles_null_json_array() -> None:
    assert as_list(None) == []
    assert as_list([1]) == [1]


def test_relation_type_with_null_attributes() -> None:
    assert relation_type({"attributes": None, "rel": "System.LinkTypes.Hierarchy-Forward"}) == "System.LinkTypes.Hierarchy-Forward"


def test_as_relation_list_skips_null_entries() -> None:
    assert as_relation_list([None, {"rel": "Related"}, None]) == [{"rel": "Related"}]


def test_as_work_item_list_skips_null_entries() -> None:
    items = as_work_item_list([None, {"id": 1, "fields": {}}, {"fields": {}}])
    assert len(items) == 1
    assert items[0]["id"] == 1


def test_item_payload_ignores_null_relations() -> None:
    auth = TfsAuth(base_url="https://tfs.example/tfs/Main", project="Tele2", pat="test")

    class BoardStub:
        id = "board-1"
        name = "Board"
        area_path = None

    item = {
        "id": 42,
        "fields": {
            "System.Title": "ZNИ",
            "System.WorkItemType": "Запрос на изменение",
            "System.State": "New",
        },
        "relations": [None, {"rel": "System.LinkTypes.Hierarchy-Forward", "url": "https://tfs/1/2"}],
    }
    payload = item_payload(item, [BoardStub()], auth)
    assert len(payload["relations"]) == 1
