"""规划校验器 — 对最终规划结果进行多维度校验。

职责：
  - 检查每日工作量是否超过上限
  - 检查是否有任务超过截止日期
  - 检查时间块是否在合理范围内
  - 检查与已有日程的冲突

架构定位：
  SchedulingEngine 输出 Final Plan 后，Validator 进行最终校验，
  确保规划结果符合所有约束条件。
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.schemas import ExistingBlock, PlanV2Block, PlanV2Task
from app.services.ai import parse_local_date
from app.services.conflict import iter_segments, overlaps_with_any


# 默认每日最大工作量（分钟）
DEFAULT_MAX_DAILY_WORKLOAD = 480  # 8 小时

# 合理时间范围（全天可排：0点至24点）
MIN_SCHEDULE_TIME = 0             # 00:00
MAX_SCHEDULE_TIME = 24 * 60      # 24:00


@dataclass
class ValidationIssue:
    """校验问题。"""
    code: str                     # 问题代码
    message: str                  # 问题描述
    block_title: str | None = None   # 相关时间块
    block_date: str | None = None    # 相关日期
    severity: str = "warning"     # error | warning


@dataclass
class ValidationResult:
    """校验结果。"""
    passed: bool
    issues: list[ValidationIssue] = field(default_factory=list)


def validate_daily_workload(
    blocks: list[PlanV2Block],
    max_minutes: int = DEFAULT_MAX_DAILY_WORKLOAD,
) -> list[ValidationIssue]:
    """检查每日工作量是否超过上限。"""
    issues: list[ValidationIssue] = []
    daily_total: dict[str, int] = {}
    for block in blocks:
        for day, start, end in iter_segments(block):
            daily_total[day] = daily_total.get(day, 0) + (end - start)

    for date_str, total in daily_total.items():
        if total > max_minutes:
            issues.append(ValidationIssue(
                code="daily_workload_exceeded",
                message=f"{date_str} 工作量 {total//60}h{total%60}min 超过上限 {max_minutes//60}h",
                block_date=date_str,
                severity="warning",
            ))
    return issues


def validate_deadlines(
    blocks: list[PlanV2Block],
    tasks: list[PlanV2Task],
) -> list[ValidationIssue]:
    """检查是否有任务超过截止日期。"""
    issues: list[ValidationIssue] = []

    # 建立 title -> deadline 映射
    deadline_map: dict[str, str | None] = {}
    for task in tasks:
        deadline_map[task.title] = task.deadline

    for block in blocks:
        deadline_str = deadline_map.get(block.title)
        if not deadline_str:
            continue
        deadline = parse_local_date(deadline_str)
        block_date = parse_local_date(block.date)
        if deadline and block_date and block_date > deadline:
            issues.append(ValidationIssue(
                code="deadline_exceeded",
                message=f"「{block.title}」安排在 {block.date}，已超过截止日期 {deadline_str}",
                block_title=block.title,
                block_date=block.date,
                severity="error",
            ))
    return issues


def validate_time_reasonableness(
    blocks: list[PlanV2Block],
    min_time: int = MIN_SCHEDULE_TIME,
    max_time: int = MAX_SCHEDULE_TIME,
) -> list[ValidationIssue]:
    """检查时间块是否在合理范围内。"""
    issues: list[ValidationIssue] = []
    for block in blocks:
        end_day_minutes = block.end % 1440
        if block.start < min_time:
            issues.append(ValidationIssue(
                code="time_too_early",
                message=f"「{block.title}」开始时间 {block.start//60:02d}:{block.start%60:02d} 过早",
                block_title=block.title,
                block_date=block.date,
                severity="warning",
            ))
        if end_day_minutes > max_time:
            issues.append(ValidationIssue(
                code="time_too_late",
                message=f"「{block.title}」结束时间 {end_day_minutes//60:02d}:{end_day_minutes%60:02d} 过晚",
                block_title=block.title,
                block_date=block.date,
                severity="warning",
            ))
        if block.end - block.start < 15:
            issues.append(ValidationIssue(
                code="block_too_short",
                message=f"「{block.title}」时长 {block.end - block.start} 分钟，至少应有 15 分钟",
                block_title=block.title,
                block_date=block.date,
                severity="error",
            ))
        if block.end - block.start > 480:
            issues.append(ValidationIssue(
                code="block_too_long",
                message=f"「{block.title}」时长 {block.end - block.start} 分钟，建议不超过 480 分钟",
                block_title=block.title,
                block_date=block.date,
                severity="warning",
            ))
    return issues


def validate_plan_v2(
    blocks: list[PlanV2Block],
    tasks: list[PlanV2Task],
    existing: list[ExistingBlock],
    max_daily_workload: int = DEFAULT_MAX_DAILY_WORKLOAD,
) -> ValidationResult:
    """对 PlanV2 规划结果进行完整校验。

    校验维度：
      1. 每日工作量不超过上限
      2. 所有任务在截止日期前安排
      3. 时间块在合理时间范围内
      4. 不与已有日程冲突

    Returns:
        ValidationResult，passed=False 表示存在 error 级别的问题
    """
    all_issues: list[ValidationIssue] = []

    # 1. 每日工作量检查
    all_issues.extend(validate_daily_workload(blocks, max_daily_workload))

    # 2. 截止日期检查
    all_issues.extend(validate_deadlines(blocks, tasks))

    # 3. 时间合理性检查
    all_issues.extend(validate_time_reasonableness(blocks))

    # 4. 与已有日程冲突检查（仅对非 pending 的块）
    active_existing = [b for b in existing if b.status != "pending"]
    for block in blocks:
        block_as_existing = ExistingBlock(
            date=block.date,
            start=block.start,
            end=block.end,
        )
        if overlaps_with_any(block_as_existing, active_existing):
            all_issues.append(ValidationIssue(
                code="conflict_with_existing",
                message=f"「{block.title}」与已有日程冲突",
                block_title=block.title,
                block_date=block.date,
                severity="error",
            ))

    passed = all(
        issue.severity != "error" for issue in all_issues
    )
    return ValidationResult(passed=passed, issues=all_issues)
