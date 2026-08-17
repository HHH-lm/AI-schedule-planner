"""测试 conflict 模块 — 时间块冲突检测。"""

from __future__ import annotations

from app.schemas import ExistingBlock, ParsedSchedule
from app.services.conflict import (
    overlaps,
    overlaps_with_any,
    split_schedule_conflicts,
)


def test_overlaps_same_time() -> None:
    """完全相同的时间段应重叠。"""
    a = ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60)
    b = ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60)
    assert overlaps(a, b)


def test_overlaps_partial() -> None:
    """部分重叠应检测为重叠。"""
    a = ExistingBlock(date="2026-08-03", start=9 * 60, end=11 * 60)
    b = ExistingBlock(date="2026-08-03", start=10 * 60, end=12 * 60)
    assert overlaps(a, b)


def test_overlaps_adjacent_not_overlap() -> None:
    """相邻（9:00-10:00 和 10:00-11:00）不应重叠。"""
    a = ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60)
    b = ExistingBlock(date="2026-08-03", start=10 * 60, end=11 * 60)
    assert not overlaps(a, b)


def test_overlaps_different_dates() -> None:
    """不同日期不应重叠。"""
    a = ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60)
    b = ExistingBlock(date="2026-08-04", start=9 * 60, end=10 * 60)
    assert not overlaps(a, b)


def test_overlaps_cross_day_on_start_night() -> None:
    """跨天块与开始日深夜时段重叠。"""
    a = ExistingBlock(date="2026-08-03", start=22 * 60, end=1440 + 8 * 60)
    b = ExistingBlock(date="2026-08-03", start=23 * 60, end=24 * 60)
    assert overlaps(a, b)


def test_overlaps_cross_day_on_next_morning() -> None:
    """跨天块与次日凌晨时段重叠。"""
    a = ExistingBlock(date="2026-08-03", start=22 * 60, end=1440 + 8 * 60)
    b = ExistingBlock(date="2026-08-04", start=7 * 60, end=9 * 60)
    assert overlaps(a, b)


def test_cross_day_not_overlap_distant_day() -> None:
    """跨天块与结束日之后的时间不重叠。"""
    a = ExistingBlock(date="2026-08-03", start=22 * 60, end=1440 + 8 * 60)
    b = ExistingBlock(date="2026-08-04", start=9 * 60, end=10 * 60)
    assert not overlaps(a, b)


def test_overlaps_with_any_true() -> None:
    """列表中存在重叠应返回 True。"""
    block = ParsedSchedule(name="测试", date="2026-08-03", start=9 * 60, end=10 * 60)
    existing = [
        ExistingBlock(date="2026-08-03", start=8 * 60, end=9 * 60 + 30),  # 8:00-9:30
        ExistingBlock(date="2026-08-03", start=9 * 60 + 30, end=10 * 60 + 30),  # 9:30-10:30
    ]
    assert overlaps_with_any(block, existing)


def test_overlaps_with_any_false() -> None:
    """列表中无重叠应返回 False。"""
    block = ParsedSchedule(name="测试", date="2026-08-03", start=10 * 60, end=11 * 60)
    existing = [
        ExistingBlock(date="2026-08-03", start=8 * 60, end=10 * 60),
        ExistingBlock(date="2026-08-03", start=11 * 60, end=12 * 60),
    ]
    assert not overlaps_with_any(block, existing)


def test_split_schedule_conflicts() -> None:
    """应正确分离冲突和可接受的时间块。"""
    parsed = [
        ParsedSchedule(name="无冲突1", date="2026-08-03", start=8 * 60, end=9 * 60),
        ParsedSchedule(name="有冲突", date="2026-08-03", start=9 * 60, end=10 * 60),
        ParsedSchedule(name="无冲突2", date="2026-08-03", start=10 * 60, end=11 * 60),
    ]
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
    ]
    accepted, blocked = split_schedule_conflicts(parsed, existing)
    assert len(accepted) == 2
    assert len(blocked) == 1
    assert blocked[0].name == "有冲突"


def test_pending_blocks_do_not_block() -> None:
    """pending 状态的日程不应被视为冲突。"""
    parsed = [
        ParsedSchedule(name="测试", date="2026-08-03", start=9 * 60, end=10 * 60),
    ]
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="pending"),
    ]
    accepted, blocked = split_schedule_conflicts(parsed, existing)
    assert len(accepted) == 1
    assert len(blocked) == 0
