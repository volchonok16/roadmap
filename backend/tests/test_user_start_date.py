from datetime import date

from app.sync_service import user_start_date_from_fields


def test_user_start_date_from_scheduling_field() -> None:
    fields = {
        "Microsoft.VSTS.Scheduling.StartDate": "2026-05-17T21:00:00Z",
        "Custom.StartDate": "2023-01-01T00:00:00Z",
    }
    parsed = user_start_date_from_fields(fields)
    # 18.05.2026 0:00 MSK, как в форме TFS
    assert parsed == date(2026, 5, 18)


def test_user_start_date_may_11_msk() -> None:
    fields = {"Microsoft.VSTS.Scheduling.StartDate": "2026-05-10T21:00:00Z"}
    assert user_start_date_from_fields(fields) == date(2026, 5, 11)


def test_user_start_date_empty() -> None:
    assert user_start_date_from_fields({}) is None
    assert user_start_date_from_fields({"Microsoft.VSTS.Scheduling.StartDate": ""}) is None
