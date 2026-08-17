"""测试 validator 模块 — 规划校验器。"""

from __future__ import annotations

from app.schemas import ExistingBlock, PlanV2Block, PlanV2Task
from app.services.validator import (
    validate_daily_workload,
    validate_deadlines,
    validate_plan_v2,
    validate_time_reasonableness,
)


def test_validate_daily_workload_under_limit() -> None:
    """工作量在限制内不应报错。"""
    blocks = [
        PlanV2Block(title="工作", date="2026-08-03", start=9 * 60, end=12 * 60),
        PlanV2Block(title="学习", date="2026-08-03", start=14 * 60, end=17 * 60),
    ]
    issues = validate_daily_workload(blocks, max_minutes=480)
    assert len(issues) == 0


def test_validate_daily_workload_exceeded() -> None:
    """工作量超过限制应报错。"""
    blocks = [
        PlanV2Block(title="全天工作", date="2026-08-03", start=6 * 60, end=18 * 60),
    ]
    issues = validate_daily_workload(blocks, max_minutes=480)
    assert len(issues) == 1
    assert issues[0].code == "daily_workload_exceeded"


def test_validate_daily_workload_splits_cross_day() -> None:
    """跨天块的工作量按日分段统计。"""
    blocks = [
        PlanV2Block(
            title="跨天值班",
            date="2026-08-03",
            start=22 * 60,
            end=1440 + 8 * 60,
        ),
    ]
    issues = validate_daily_workload(blocks, max_minutes=60)
    assert len(issues) == 2
    assert {issue.block_date for issue in issues} == {"2026-08-03", "2026-08-04"}


def test_validate_deadlines_ok() -> None:
    """任务在截止日期前安排不应报错。"""
    blocks = [
        PlanV2Block(title="写报告", date="2026-08-05", start=9 * 60, end=12 * 60),
    ]
    tasks = [
        PlanV2Task(title="写报告", duration=60, deadline="2026-08-10"),
    ]
    issues = validate_deadlines(blocks, tasks)
    assert len(issues) == 0


def test_validate_deadlines_exceeded() -> None:
    """任务超过截止日期应报错。"""
    blocks = [
        PlanV2Block(title="写报告", date="2026-08-12", start=9 * 60, end=12 * 60),
    ]
    tasks = [
        PlanV2Task(title="写报告", duration=60, deadline="2026-08-10"),
    ]
    issues = validate_deadlines(blocks, tasks)
    assert len(issues) == 1
    assert issues[0].code == "deadline_exceeded"


def test_validate_time_reasonableness_normal() -> None:
    """正常时间块不应报错。"""
    blocks = [
        PlanV2Block(title="工作", date="2026-08-03", start=9 * 60, end=10 * 60),
    ]
    issues = validate_time_reasonableness(blocks)
    assert len(issues) == 0


def test_validate_time_reasonableness_too_early() -> None:
    """开始时间过早应报错。"""
    blocks = [
        PlanV2Block(title="晨跑", date="2026-08-03", start=4 * 60, end=5 * 60),
    ]
    issues = validate_time_reasonableness(blocks)
    assert len(issues) == 1
    assert issues[0].code == "time_too_early"


def test_validate_time_reasonableness_too_short() -> None:
    """时长过短应报错。"""
    blocks = [
        PlanV2Block(title="快速任务", date="2026-08-03", start=9 * 60, end=9 * 60 + 5),
    ]
    issues = validate_time_reasonableness(blocks)
    assert len(issues) == 1
    assert issues[0].code == "block_too_short"


def test_validate_time_reasonableness_cross_day_end_not_too_late() -> None:
    """跨天块按结束日当天时间判断，不再误报过晚。"""
    blocks = [
        PlanV2Block(
            title="跨天值班",
            date="2026-08-03",
            start=22 * 60,
            end=1440 + 8 * 60,
        ),
    ]
    issues = validate_time_reasonableness(blocks)
    assert "time_too_late" not in [issue.code for issue in issues]


def test_validate_plan_v2_all_ok() -> None:
    """完整校验通过。"""
    blocks = [
        PlanV2Block(title="工作", date="2026-08-03", start=9 * 60, end=12 * 60),
    ]
    tasks = [
        PlanV2Task(title="工作", duration=60),
    ]
    result = validate_plan_v2(blocks, tasks, [])
    assert result.passed is True
    assert len(result.issues) == 0


def test_validate_plan_v2_conflict_with_existing() -> None:
    """与已有日程冲突应报错。"""
    blocks = [
        PlanV2Block(title="写代码", date="2026-08-03", start=9 * 60, end=11 * 60),
    ]
    tasks = [
        PlanV2Task(title="写代码", duration=60),
    ]
    existing = [
        ExistingBlock(date="2026-08-03", start=10 * 60, end=12 * 60, status="scheduled"),
    ]
    result = validate_plan_v2(blocks, tasks, existing)
    assert result.passed is False
    codes = [i.code for i in result.issues]
    assert "conflict_with_existing" in codes
