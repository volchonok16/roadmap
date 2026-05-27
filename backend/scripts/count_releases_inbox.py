"""Count releases visible to frontend logic for Digital Inbox Q2 2024."""
from datetime import date

from app.db import SessionLocal
from app.models import WorkItem
from app.release_fields import work_item_release_label
from app.sync_service import parse_tfs_calendar_date

# Mirror frontend collectUpcomingReleases
from datetime import datetime


def start_of_day(d: date) -> date:
    return d


def parse_release_date(label: str):
    import re

    m = re.match(r"^(\d{4})\.(\d{2})\.(\d{2})\.\d+-R$", label)
    if not m:
        return None
    y, mo, da = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return date(y, mo, da)


today = date(2024, 5, 27)
period_start = date(2024, 4, 1)
period_end = date(2024, 7, 1)

db = SessionLocal()
rows = (
    db.query(WorkItem)
    .filter(
        WorkItem.work_item_type == "Запрос на изменение",
        WorkItem.area_path.ilike("%Inbox%"),
        WorkItem.start_date.isnot(None),
        WorkItem.target_date.isnot(None),
    )
    .all()
)
by_label: dict[str, date] = {}
for row in rows:
    label = work_item_release_label(row.fields)
    if not label:
        continue
    d = parse_release_date(label)
    if not d:
        continue
    if d < today or d < period_start or d > period_end:
        continue
    by_label.setdefault(label, d)

print(f"ZNI inbox rows: {len(rows)}")
print(f"With release in period (>= today): {len(by_label)}")
for label in sorted(by_label, key=lambda k: by_label[k]):
    print(f"  {label} -> {by_label[label]}")
db.close()
