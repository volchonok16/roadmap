from app.linked_errors import (
    is_child_or_related_link,
    is_error_work_item_type,
    linked_item_parent_map,
    parent_ids_from_error_relations,
)


def test_is_error_work_item_type():
    assert is_error_work_item_type("Ошибка")
    assert not is_error_work_item_type("Требование")


def test_linked_item_parent_map_from_zni_style_relation():
    payloads = [
        {
            "id": 847358,
            "relations": [
                {
                    "rel": "System.LinkTypes.Hierarchy-Forward",
                    "attributes": {"name": "Child"},
                    "url": "https://tfs.t2.ru/tfs/Main/_apis/wit/workItems/938245",
                },
            ],
        },
    ]
    assert linked_item_parent_map(payloads) == {938245: 847358}


def test_parent_ids_from_error_reverse_link():
    payloads = [
        {
            "id": 938245,
            "relations": [
                {
                    "rel": "System.LinkTypes.Hierarchy-Reverse",
                    "attributes": {"name": "Parent"},
                    "url": "https://tfs.t2.ru/tfs/Main/_apis/wit/workItems/847358",
                },
            ],
        },
    ]
    assert parent_ids_from_error_relations(payloads, zni_ids={847358}, requirement_ids=set()) == {
        938245: 847358
    }


def test_child_link_compact_linktype():
    assert is_child_or_related_link({"LinkType": 2, "ID": 894964})
