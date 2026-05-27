from app.release_fields import release_label_from_text, work_item_release_label


def test_release_label_from_text() -> None:
    assert release_label_from_text("2026.06.02.0-R") == "2026.06.02.0-R"
    assert release_label_from_text("ЗНИ 2026.06.11.0-R extra") == "2026.06.11.0-R"


def test_work_item_release_from_field_in_release() -> None:
    fields = {"FieldInRelease": "2026.06.02.0-R", "System.Title": "Сайт/Промо"}
    assert work_item_release_label(fields) == "2026.06.02.0-R"


def test_work_item_release_scans_fields() -> None:
    fields = {"10050": "2026.07.09.0-R", "System.Title": "Без релиза в названии"}
    assert work_item_release_label(fields) == "2026.07.09.0-R"


def test_work_item_release_from_logrocon_fields() -> None:
    fields = {"Logrocon.Release": "2026.05.21.0-R (1185188)"}
    assert work_item_release_label(fields) == "2026.05.21.0-R"
