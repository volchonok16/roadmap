from app.sync_service import compact_payload_for_raw


def test_compact_payload_strips_large_items() -> None:
    payload = {
        "ids": list(range(1000)),
        "items": [{"id": i, "fields": {"System.Title": "x" * 1000}} for i in range(500)],
    }
    compact = compact_payload_for_raw(payload)
    assert "items" not in compact
    assert "ids" not in compact
    assert compact["ids_count"] == 1000
    assert compact["items_count"] == 500
    assert len(compact["items_sample"]) == 15
