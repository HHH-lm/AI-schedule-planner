"""候选空闲时段生成器 — Rule Engine 的一部分。

职责：
  - 根据已有日程和日期范围，生成所有可用的空闲时段
  - 按最短时长过滤空闲时段
  - 合并相邻的空闲时段

架构定位：
  LLM 理解层输出任务理解后，Python 用本模块生成候选槽位，供 SchedulingEngine 分配。
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import NamedTuple

from app.schemas import ExistingBlock
from app.services.conflict import iter_segments


class FreeSlot(NamedTuple):
    """空闲时段。"""
    date: str      # YYYY-MM-DD
    start: int     # 当天 0 点起分钟数
    end: int       # 当天 0 点起分钟数


# 默认可排时间范围（全天可排）
DEFAULT_DAY_START = 0            # 00:00
DEFAULT_DAY_END = 24 * 60       # 24:00


def _get_occupied_minutes(
    existing: list[ExistingBlock],
    target_date: date,
) -> list[tuple[int, int]]:
    """获取指定日期的已占用时段列表（按开始时间排序）。"""
    date_str = target_date.isoformat()
    occupied: list[tuple[int, int]] = []
    for block in existing:
        if block.status == "pending":
            continue
        for segment_date, segment_start, segment_end in iter_segments(block):
            if segment_date == date_str:
                occupied.append((segment_start, segment_end))
    occupied.sort(key=lambda x: x[0])
    return occupied


def _head_free_end(occupied: list[tuple[int, int]], day_end: int) -> int:
    """次日从 0 点起的连续空闲分钟数（遇到占用即止）。"""
    for occ_start, occ_end in occupied:
        if occ_end <= 0:
            continue
        if occ_start <= 0:
            return 0
        return min(occ_start, day_end)
    return day_end


def find_free_slots(
    existing: list[ExistingBlock],
    start: date,
    end: date,
    day_start: int = DEFAULT_DAY_START,
    day_end: int = DEFAULT_DAY_END,
    min_gap: int = 15,
    now_minutes: int | None = None,
) -> list[FreeSlot]:
    """生成指定日期范围内的所有空闲时段。

    Args:
        existing: 已有时间块列表
        start: 起始日期（含）
        end: 结束日期（含）
        day_start: 每天可安排起始分钟数（默认 00:00）
        day_end: 每天可安排结束分钟数（默认 24:00，全天可排）
        min_gap: 最短空闲间隔（分钟，默认 15）
        now_minutes: 当前本地时间（当天 0 点起分钟）；规划范围首日不得早于该时刻

    Returns:
        按日期排序的空闲时段列表；跨午夜时段 end > 1440，
        表示延伸到次日（仅在窗口包含午夜且次日仍在范围内时生成，
        次日头段照常生成独立空闲槽，由引擎占用检查防止重复安排）
    """
    slots: list[FreeSlot] = []
    current = start
    while current <= end:
        occupied = _get_occupied_minutes(existing, current)
        date_str = current.isoformat()

        effective_day_start = day_start
        if now_minutes is not None and current == start:
            effective_day_start = max(day_start, now_minutes)
        cursor = effective_day_start
        day_slots: list[FreeSlot] = []
        for occ_start, occ_end in occupied:
            if occ_end <= cursor:
                continue
            if occ_start > cursor:
                free_end = min(occ_start, day_end)
                gap = free_end - cursor
                if gap >= min_gap:
                    day_slots.append(FreeSlot(date_str, cursor, free_end))
            cursor = max(cursor, occ_end)
            if cursor >= day_end:
                break

        if cursor < day_end:
            gap = day_end - cursor
            if gap >= min_gap:
                day_slots.append(FreeSlot(date_str, cursor, day_end))

        # 跨午夜延伸：日尾空闲槽与次日 0 点起的连续空闲段合并，
        # 使任务结束时间可越过 24:00（块起点仍留在当天，date=开始日）
        if current < end and day_start == 0 and day_slots and day_slots[-1].end == day_end:
            next_occupied = _get_occupied_minutes(existing, current + timedelta(days=1))
            head_end = _head_free_end(next_occupied, day_end)
            if head_end > 0:
                tail = day_slots[-1]
                day_slots[-1] = FreeSlot(tail.date, tail.start, day_end + head_end)

        slots.extend(day_slots)
        current += timedelta(days=1)

    return slots


def filter_slots_by_duration(
    slots: list[FreeSlot],
    min_duration: int,
) -> list[FreeSlot]:
    """过滤出能容纳指定时长的空闲时段。"""
    return [s for s in slots if s.end - s.start >= min_duration]


def merge_adjacent_slots(slots: list[FreeSlot]) -> list[FreeSlot]:
    """合并同一日期内相邻的空闲时段（跨日期不合并）。"""
    if not slots:
        return []
    sorted_slots = sorted(slots, key=lambda s: (s.date, s.start))
    merged: list[FreeSlot] = [sorted_slots[0]]
    for slot in sorted_slots[1:]:
        last = merged[-1]
        if last.date == slot.date and last.end >= slot.start:
            merged[-1] = FreeSlot(last.date, last.start, max(last.end, slot.end))
        else:
            merged.append(slot)
    return merged
