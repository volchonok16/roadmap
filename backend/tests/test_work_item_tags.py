from app.sync_service import work_item_tags


def test_work_item_tags_splits_semicolon_list() -> None:
    fields = {"System.Tags": "APP; CBM; Design Review; на удержании; нужен дизайн"}
    assert work_item_tags(fields) == [
        "APP",
        "CBM",
        "Design Review",
        "на удержании",
        "нужен дизайн",
    ]


def test_work_item_tags_empty() -> None:
    assert work_item_tags(None) == []
    assert work_item_tags({}) == []
    assert work_item_tags({"System.Tags": ""}) == []
