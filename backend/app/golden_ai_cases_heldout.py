"""Held-out golden set：预留回归集，不参与 prompt 调参。

默认评测只跑 `GOLDEN_AI_CASES`（open 集）；`--split heldout` 或 `--split all`
才执行本组。字段语义与 open 集一致：input 为用户输入，description/rationale
记录预期语义与来源。
"""

from __future__ import annotations

from app.golden_ai_cases import GOLDEN_ANCHOR_DATE


HELDOUT_GOLDEN_SET_VERSION = "0.1.0"

HELDOUT_AI_CASES: list[dict[str, object]] = [
    {
        "id": "hqa01",
        "kind": "quickadd",
        "name": "下周四客户沟通",
        "description": "解析下周四 09:30-11:00 的 work 块。",
        "input": "下周四上午9点半到11点和客户沟通需求",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "与公开集不同的星期/半时起点组合，防止过拟合固定日期与整点。",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {
                "name": "和客户沟通需求",
                "date": "2026-08-20",
                "start": 570,
                "end": 660,
                "category": "work",
                "location": None,
            }
        ],
    },
    {
        "id": "hqa02",
        "kind": "quickadd",
        "name": "下周日晨间慢跑",
        "description": "解析下周日 08:00-09:00 的 fitness 块。",
        "input": "下周日早上8点到9点慢跑",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "覆盖隔周日期的周日映射与晨间时段。",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {
                "name": "慢跑",
                "date": "2026-08-23",
                "start": 480,
                "end": 540,
                "category": "fitness",
                "location": None,
            }
        ],
    },
    {
        "id": "hb01",
        "kind": "boundary",
        "name": "明晚缺事项名",
        "description": "“明晚10点”有时间但没有事项名，必须返回 missing_action。",
        "input": "明晚10点",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "held-out 边界：只有时间没有事项名不得自造日程。",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_reject": "missing_action",
    },
    {
        "id": "hpl01",
        "kind": "planning",
        "name": "答辩优先于整理资料",
        "description": "高优先级任务必须完整排在任何低优先级任务之前，并按标题对应。",
        "input": "准备答辩 1 小时、整理资料 90 分钟，答辩优先",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "held-out 优先级回归：检查标题对应，不只看块顺序。",
        "planning": {
            "goal": "",
            "tasks": [
                {"title": "准备答辩", "duration": 60, "priority": "high"},
                {"title": "整理资料", "duration": 90, "priority": "low"},
            ],
            "memories": [],
            "constraints": [],
            "existing_schedule": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "durations": True,
            "no_conflicts": True,
            "priority_order": True,
        },
    },
    {
        "id": "hpl02",
        "kind": "planning",
        "name": "截止日前且14点后开始",
        "description": "带 deadline 的任务必须截止日前排完，且所有块起点不早于 14:00。",
        "input": "写项目总结需要 90 分钟，8 月 18 日前完成，从14:00开始安排工作",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "held-out 组合：deadline 与起始时段下限同时生效。",
        "planning": {
            "goal": "",
            "tasks": [
                {"title": "写项目总结", "duration": 90, "priority": "high", "deadline": "2026-08-18"}
            ],
            "memories": [],
            "constraints": ["从14:00开始安排工作"],
            "existing_schedule": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "start_after": 840,
            "deadline_before": "2026-08-18",
        },
    },
    {
        "id": "hcm01",
        "kind": "constraint_memory",
        "name": "下午三点前完成（记忆驱动）",
        "description": "记忆偏好“重要任务安排在下午三点前完成”时任务必须完整结束于 15:00 前。",
        "input": "安排 1 小时写代码，我习惯把重要任务安排在下午三点前完成",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "held-out 语义：end_before 用记忆驱动，要求完整落在三点前。",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写代码", "duration": 60, "priority": "high"}],
            "memories": ["我习惯把重要任务安排在下午三点前完成"],
            "constraints": [],
            "existing_schedule": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "end_before": 900,
        },
    },
]
