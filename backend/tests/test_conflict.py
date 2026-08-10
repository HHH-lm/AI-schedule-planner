from __future__ import annotations

from app.schemas import ExistingBlock, ParsedSchedule
from app.services.conflict import split_schedule_conflicts


def test_split_schedule_conflicts() -> None:
    parsed = [
        ParsedSchedule(name="写代码", date="2026-08-04", start=14 * 60, end=17 * 60),
        ParsedSchedule(name="健身", date="2026-08-04", start=18 * 60, end=19 * 60),
    ]
    existing = [
        ExistingBlock(date="2026-08-04", start=15 * 60, end=16 * 60, status="scheduled")
    ]
    accepted, blocked = split_schedule_conflicts(parsed, existing)
    assert len(accepted) == 1
    assert accepted[0].name == "健身"
    assert len(blocked) == 1
    assert blocked[0].name == "写代码"


def test_pending_blocks_do_not_block() -> None:
    parsed = [ParsedSchedule(name="写代码", date="2026-08-04", start=14 * 60, end=17 * 60)]
    existing = [
        ExistingBlock(date="2026-08-04", start=15 * 60, end=16 * 60, status="pending")
    ]
    accepted, blocked = split_schedule_conflicts(parsed, existing)
    assert len(accepted) == 1
    assert blocked == []
