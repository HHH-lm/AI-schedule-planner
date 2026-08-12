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


class FreeSlot(NamedTuple):
    """空闲时段。"""
    date: str      # YYYY-MM-DD
    start: int     # 当天 0 点起分钟数
    end: int       # 当天 0 点起分钟数


# 默认可排时间范围
DEFAULT_DAY_START = 6 * 60    # 06:00
DEFAULT_DAY_END = 23 * 60     # 23:00


def _get_occupied_minutes(
    existing: list[ExistingBlock],
    target_date: date,
) -> list[tuple[int, int]]:
    """获取指定日期的已占用时段列表（按开始时间排序）。"""
    date_str = target_date.isoformat()
    occupied: list[tuple[int, int]] = []
    for block in existing:
        if block.date == date_str and block.status != "pending":
            occupied.append((block.start, block.end))
    occupied.sort(key=lambda x: x[0])
    return occupied


def find_free_slots(
    existing: list[ExistingBlock],
    start: date,
    end: date,
    day_start: int = DEFAULT_DAY_START,
    day_end: int = DEFAULT_DAY_END,
    min_gap: int = 15,
) -> list[FreeSlot]:
    """生成指定日期范围内的所有空闲时段。

    Args:
        existing: 已有时间块列表
        start: 起始日期（含）
        end: 结束日期（含）
        day_start: 每天可安排起始分钟数（默认 06:00）
        day_end: 每天可安排结束分钟数（默认 23:00）
        min_gap: 最短空闲间隔（分钟，默认 15）

    Returns:
        按日期排序的空闲时段列表
    """
    slots: list[FreeSlot] = []
    current = start
    while current <= end:
        occupied = _get_occupied_minutes(existing, current)
        date_str = current.isoformat()

        cursor = day_start
        for occ_start, occ_end in occupied:
            if occ_end <= cursor:
                continue
            if occ_start > cursor:
                free_end = min(occ_start, day_end)
                gap = free_end - cursor
                if gap >= min_gap:
                    slots.append(FreeSlot(date_str, cursor, free_end))
            cursor = max(cursor, occ_end)
            if cursor >= day_end:
                break

        if cursor < day_end:
            gap = day_end - cursor
            if gap >= min_gap:
                slots.append(FreeSlot(date_str, cursor, day_end))

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
