"""时间块冲突检测与共享时间块操作。

职责：
  - 提供通用的 overlaps() 函数，供 planner / planner_v2 / validator 复用
  - 解析时间块列表，分离出冲突的和可接受的块

架构定位：
  Rule Engine 的基础组件，供 SchedulingEngine 和 Validator 调用。
"""

from __future__ import annotations

from typing import Any, Protocol

from app.schemas import ExistingBlock, ParsedSchedule


class HasTimeRange(Protocol):
    """具有时间范围的对象协议，任何包含 date/start/end 字段的对象均可。"""
    date: str
    start: int
    end: int


def overlaps(a: HasTimeRange, b: HasTimeRange) -> bool:
    """检查两个时间块是否重叠。

    重叠定义：同一日期，a 的区间与 b 的区间有交集。
    """
    return a.date == b.date and a.start < b.end and b.start < a.end


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
