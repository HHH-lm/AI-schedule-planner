"""时间块冲突检测与共享时间块操作。

职责：
  - 提供通用的 overlaps() 函数，供 planner / planner_v2 / validator 复用
  - 解析时间块列表，分离出冲突的和可接受的块
  - 支持跨天时间块：end 为从 date 当天 0 点起的分钟偏移，可大于 1440

架构定位：
  Rule Engine 的基础组件，供 SchedulingEngine 和 Validator 调用。
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Protocol

from app.schemas import ExistingBlock, ParsedSchedule


MINUTES_PER_DAY = 1440


class HasTimeRange(Protocol):
    """具有时间范围的对象协议，任何包含 date/start/end 字段的对象均可。"""
    date: str
    start: int
    end: int


def iter_segments(block: HasTimeRange) -> list[tuple[str, int, int]]:
    """把时间块展开为按天切分的 (date, start, end) 分段。"""
    if block.end <= block.start:
        return []
    try:
        start_date = date.fromisoformat(block.date)
    except ValueError:
        return []
    day_offset = max(0, block.end) // MINUTES_PER_DAY
    end_date = start_date + timedelta(days=day_offset)
    segments: list[tuple[str, int, int]] = []
    current_date = start_date
    remaining_start = max(0, block.start)
    remaining_end = max(remaining_start, block.end)
    while remaining_start < remaining_end:
        current_day_end = (
            (max(0, block.end) % MINUTES_PER_DAY)
            if current_date == end_date
            else MINUTES_PER_DAY
        )
        segment_end = min(current_day_end, remaining_end)
        if segment_end > remaining_start:
            segments.append((current_date.isoformat(), remaining_start, segment_end))
        current_date += timedelta(days=1)
        remaining_start = 0
        remaining_end -= MINUTES_PER_DAY
    return segments


def overlaps(a: HasTimeRange, b: HasTimeRange) -> bool:
    """检查两个时间块是否重叠。

    重叠定义：按天展开后，存在同一日期且区间有交集。
    """
    b_segments = iter_segments(b)
    b_by_date: dict[str, list[tuple[int, int]]] = {}
    for day, start, end in b_segments:
        b_by_date.setdefault(day, []).append((start, end))
    for day, start, end in iter_segments(a):
        for b_start, b_end in b_by_date.get(day, []):
            if start < b_end and b_start < end:
                return True
    return False


def overlaps_with_any(block: HasTimeRange, existing: list[HasTimeRange]) -> bool:
    """检查时间块是否与已有列表中的任意块重叠。"""
    return any(overlaps(item, block) for item in existing)


def split_schedule_conflicts(
    parsed: list[ParsedSchedule],
    existing: list[ExistingBlock],
) -> tuple[list[ParsedSchedule], list[ParsedSchedule]]:
    """将解析后的时间块列表分为冲突和可接受两组。

    Args:
        parsed: 待检测的时间块列表
        existing: 已有日程

    Returns:
        (accepted, blocked) — 可接受列表和冲突列表
    """
    active = [block for block in existing if block.status != "pending"]
    accepted: list[ParsedSchedule] = []
    blocked: list[ParsedSchedule] = []
    for item in parsed:
        if overlaps_with_any(item, active):
            blocked.append(item)
        else:
            accepted.append(item)
    return accepted, blocked
