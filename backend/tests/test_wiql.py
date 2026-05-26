from datetime import date

from app.tfs_client import wiql_date, wiql_escape, wiql_quote


def test_wiql_escape_quotes() -> None:
    assert wiql_quote("O'Brien") == "'O''Brien'"


def test_wiql_date_uses_date_precision_only() -> None:
    assert wiql_date(date(2026, 6, 25)) == "'2026-06-25'"
    assert "T" not in wiql_date(date(2026, 6, 25))
