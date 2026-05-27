from datetime import date

from app.metrics_service import (
    assign_shipment_release,
    collect_release_schedule,
    release_window_for_closed_date,
)
from app.requirement_status import is_requirement_closed


def test_is_requirement_closed_aliases():
    assert is_requirement_closed("Done", None)
    assert is_requirement_closed("Development", "Closed")


def test_release_window_between_dates():
    schedule = collect_release_schedule(["2026.06.02.0-R", "2026.06.16.0-R"])
    period_start = date(2026, 1, 1)
    assert release_window_for_closed_date(date(2026, 6, 10), schedule, period_start) == "2026.06.16.0-R"
    assert release_window_for_closed_date(date(2026, 6, 2), schedule, period_start) == "2026.06.02.0-R"


def test_assign_shipment_release_prefers_tfs_release_field():
    schedule = collect_release_schedule(["2026.06.02.0-R", "2026.06.16.0-R"])
    assigned = assign_shipment_release(
        {"FieldInRelease": "2026.06.02.0-R"},
        "Req",
        {},
        "",
        date(2026, 6, 10),
        schedule,
        date(2026, 1, 1),
    )
    assert assigned == "2026.06.02.0-R"
