"""测试 slot_finder 模块 — 候选空闲时段生成器。"""

from __future__ import annotations

from datetime import date

from app.schemas import ExistingBlock
from app.services.slot_finder import (
    DEFAULT_DAY_END,
    DEFAULT_DAY_START,
    FreeSlot,
    filter_slots_by_duration,
    find_free_slots,
    merge_adjacent_slots,
)


def test_find_free_slots_empty_existing() -> None:
    """无已有日程时，整天都是空闲时段。"""
    slots = find_free_slots([], date(2026, 8, 3), date(2026, 8, 3))
    assert len(slots) == 1
    assert slots[0] == FreeSlot("2026-08-03", DEFAULT_DAY_START, DEFAULT_DAY_END)


def test_find_free_slots_multi_day() -> None:
    """多天范围应每天生成空闲时段。"""
    slots = find_free_slots([], date(2026, 8, 3), date(2026, 8, 5))
    assert len(slots) == 3
    assert slots[0].date == "2026-08-03"
    assert slots[1].date == "2026-08-04"
    assert slots[2].date == "2026-08-05"


def test_find_free_slots_with_existing_block() -> None:
    """已有日程占用中间时段，应生成两段空闲。"""
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=12 * 60, status="scheduled"),
    ]
    slots = find_free_slots(existing, date(2026, 8, 3), date(2026, 8, 3))
    assert len(slots) == 2
    assert slots[0] == FreeSlot("2026-08-03", DEFAULT_DAY_START, 9 * 60)
    assert slots[1] == FreeSlot("2026-08-03", 12 * 60, DEFAULT_DAY_END)


def test_find_free_slots_multiple_blocks() -> None:
    """多个已有日程应生成多段空闲。"""
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-03", start=14 * 60, end=15 * 60, status="scheduled"),
    ]
    slots = find_free_slots(existing, date(2026, 8, 3), date(2026, 8, 3))
    assert len(slots) == 3
    assert slots[0] == FreeSlot("2026-08-03", DEFAULT_DAY_START, 9 * 60)
    assert slots[1] == FreeSlot("2026-08-03", 10 * 60, 14 * 60)
    assert slots[2] == FreeSlot("2026-08-03", 15 * 60, DEFAULT_DAY_END)


def test_find_free_slots_ignores_pending() -> None:
    """pending 状态的日程不应占用空闲时段。"""
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=12 * 60, status="pending"),
    ]
    slots = find_free_slots(existing, date(2026, 8, 3), date(2026, 8, 3))
    assert len(slots) == 1
    assert slots[0] == FreeSlot("2026-08-03", DEFAULT_DAY_START, DEFAULT_DAY_END)


def test_find_free_slots_full_day_occupied() -> None:
    """整天被占满时应无空闲时段。"""
    existing = [
        ExistingBlock(date="2026-08-03", start=DEFAULT_DAY_START, end=DEFAULT_DAY_END, status="scheduled"),
    ]
    slots = find_free_slots(existing, date(2026, 8, 3), date(2026, 8, 3))
    assert len(slots) == 0


def test_find_free_slots_before_day_start() -> None:
    """活动在 day_start 之前开始，应被忽略。"""
    existing = [
        ExistingBlock(date="2026-08-03", start=0, end=4 * 60, status="scheduled"),
    ]
    slots = find_free_slots(existing, date(2026, 8, 3), date(2026, 8, 3))
    assert len(slots) == 1
    assert slots[0] == FreeSlot("2026-08-03", DEFAULT_DAY_START, DEFAULT_DAY_END)


def test_filter_slots_by_duration() -> None:
    """过滤能容纳 60 分钟的空闲时段。"""
    slots = [
        FreeSlot("2026-08-03", 6 * 60, 9 * 60),    # 180 min
        FreeSlot("2026-08-03", 10 * 60, 10 * 30),   # 30 min
        FreeSlot("2026-08-03", 14 * 60, 16 * 60),   # 120 min
    ]
    result = filter_slots_by_duration(slots, 60)
    assert len(result) == 2
    assert result[0] == slots[0]
    assert result[1] == slots[2]


def test_merge_adjacent_slots() -> None:
    """合并同一日期相邻的空闲时段。"""
    slots = [
        FreeSlot("2026-08-03", 6 * 60, 9 * 60),
        FreeSlot("2026-08-03", 9 * 60, 12 * 60),
        FreeSlot("2026-08-03", 13 * 60, 14 * 60),
    ]
    result = merge_adjacent_slots(slots)
    assert len(result) == 2
    assert result[0] == FreeSlot("2026-08-03", 6 * 60, 12 * 60)
    assert result[1] == FreeSlot("2026-08-03", 13 * 60, 14 * 60)


def test_merge_adjacent_slots_no_merge_when_not_adjacent() -> None:
    """不相邻的空闲时段不应合并。"""
    slots = [
        FreeSlot("2026-08-03", 6 * 60, 9 * 60),
        FreeSlot("2026-08-03", 10 * 60, 12 * 60),
    ]
    result = merge_adjacent_slots(slots)
    assert len(result) == 2
    assert result[0] == slots[0]
    assert result[1] == slots[1]


def test_merge_adjacent_slots_empty() -> None:
    """空列表应返回空列表。"""
    assert merge_adjacent_slots([]) == []


def test_find_free_slots_min_gap() -> None:
    """15 分钟以下的小间隙不应生成为空闲时段。"""
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=9 * 60 + 10, status="scheduled"),
    ]
    slots = find_free_slots(existing, date(2026, 8, 3), date(2026, 8, 3), min_gap=15)
    # 10 分钟的间隙应被忽略，所以只有两段：day_start-9:00 和 9:10-day_end
    # 但 9:00-9:10 只有 10 分钟，不足 15 分钟，所以不生成
    # 6:00-9:00: 180 min → 生成
    # 9:10-23:00: 830 min → 生成
    assert len(slots) == 2
    assert slots[0].end == 9 * 60
    assert slots[1].start == 9 * 60 + 10
