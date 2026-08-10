"""时间块冲突检测（从 src/lib/schedule-conflict.ts 移植）。"""

from __future__ import annotations

from app.schemas import ExistingBlock, ParsedSchedule


def split_schedule_conflicts(
    parsed: list[ParsedSchedule],
    existing: list[ExistingBlock],
) -> tuple[list[ParsedSchedule], list[ParsedSchedule]]:
    active = [block for block in existing if block.status != "pending"]
    accepted: list[ParsedSchedule] = []
    blocked: list[ParsedSchedule] = []
    for item in parsed:
        conflict = any(
            block.date == item.date and block.start < item.end and item.start < block.end
            for block in active
        )
        if conflict:
            blocked.append(item)
        else:
            accepted.append(item)
    return accepted, blocked
