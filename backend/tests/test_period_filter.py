from datetime import date

from app.sync_service import overlaps_period


def test_overlaps_period_contains_range() -> None:
    assert overlaps_period(date(2026, 1, 1), date(2026, 12, 31), date(2026, 4, 1), date(2026, 6, 30))


def test_overlaps_period_outside() -> None:
    assert not overlaps_period(date(2026, 1, 1), date(2026, 2, 1), date(2026, 4, 1), date(2026, 6, 30))


def test_overlaps_period_missing_dates() -> None:
    assert not overlaps_period(None, date(2026, 6, 1), date(2026, 4, 1), date(2026, 6, 30))
