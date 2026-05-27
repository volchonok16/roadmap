from datetime import date

from app.scheduling_push import build_scheduling_patch_ops


def test_build_scheduling_patch_ops_requirement_uses_system_start() -> None:
    ops = build_scheduling_patch_ops(date(2026, 4, 1), date(2026, 6, 28), use_user_start_date=False)
    paths = [op["path"] for op in ops]
    assert not any("User" in path or "Custom" in path for path in paths)
    assert any("TargetDate" in path for path in paths)
