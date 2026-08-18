"""AI 解析与规划 golden set：四类共 35 条，用于质量评测与 prompt/模型回归防退化。

分类：
- quickadd: 12 条自然语言 QuickAdd 解析（含跨天）
- planning: 10 条结构化时间规划
- boundary: 6 条边界与异常输入（含 24:00/1440 边界）
- constraint_memory: 7 条约束与记忆偏好影响排期
"""

from __future__ import annotations

from typing import Any


GOLDEN_ANCHOR_DATE = "2026-08-16"

GOLDEN_AI_CASES: list[dict[str, Any]] = [
    {
        "id": "qa01",
        "kind": "quickadd",
        "text": "周三下午3点到4点去世纪公园跑步",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {
                "name": "跑步",
                "date": "2026-08-19",
                "start": 900,
                "end": 960,
                "category": "fitness",
                "location": "世纪公园",
            }
        ],
    },
    {
        "id": "qa02",
        "kind": "quickadd",
        "text": "明天上午9点到11点写周报",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "写周报", "date": "2026-08-17", "start": 540, "end": 660, "category": "work", "location": None}
        ],
    },
    {
        "id": "qa03",
        "kind": "quickadd",
        "text": "周二晚上8点到9点学习英语",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "学习英语", "date": "2026-08-18", "start": 1200, "end": 1260, "category": "study", "location": None}
        ],
    },
    {
        "id": "qa04",
        "kind": "quickadd",
        "text": "周五下午2点半到3点半开会，地点会议室A",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "开会", "date": "2026-08-21", "start": 870, "end": 930, "category": "work", "location": "会议室A"}
        ],
    },
    {
        "id": "qa05",
        "kind": "quickadd",
        "text": "周六早上7点到8点晨跑",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "晨跑", "date": "2026-08-22", "start": 420, "end": 480, "category": "fitness", "location": None}
        ],
    },
    {
        "id": "qa06",
        "kind": "quickadd",
        "text": "今天下午4点到5点做晚餐",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "做晚餐", "date": "2026-08-16", "start": 960, "end": 1020, "category": "life", "location": None}
        ],
    },
    {
        "id": "qa07",
        "kind": "quickadd",
        "text": "周三中午12点到下午1点吃饭",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "吃饭", "date": "2026-08-19", "start": 720, "end": 780, "category": "life", "location": None}
        ],
    },
    {
        "id": "qa08",
        "kind": "quickadd",
        "text": "周四下午3点健身",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "健身", "date": "2026-08-20", "start": 900, "end": 960, "category": "fitness", "location": None}
        ],
    },
    {
        "id": "qa09",
        "kind": "quickadd",
        "text": "周五晚上10点到11点阅读",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "阅读", "date": "2026-08-21", "start": 1320, "end": 1380, "category": "study", "location": None}
        ],
    },
    {
        "id": "qa10",
        "kind": "quickadd",
        "text": "周二下午2点到4点写代码，周三上午9点到10点开会",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "写代码", "date": "2026-08-18", "start": 840, "end": 960, "category": "work", "location": None},
            {"name": "开会", "date": "2026-08-19", "start": 540, "end": 600, "category": "work", "location": None},
        ],
    },
    {
        "id": "qa11",
        "kind": "quickadd",
        "text": "今晚10点到明天早上8点值班",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "值班", "date": "2026-08-16", "start": 1320, "end": 1920, "category": "work", "location": None}
        ],
    },
    {
        "id": "qa12",
        "kind": "quickadd",
        "text": "周五晚10点到周六早上8点爬山",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "爬山", "date": "2026-08-21", "start": 1320, "end": 1920, "category": "fitness", "location": None}
        ],
    },
    {
        "id": "b01",
        "kind": "boundary",
        "text": "",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_reject": "empty",
    },
    {
        "id": "b02",
        "kind": "boundary",
        "text": "!!!###",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_reject": "garbage",
    },
    {
        "id": "b03",
        "kind": "boundary",
        "text": "周八开会",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_reject": "invalid_weekday",
    },
    {
        "id": "b04",
        "kind": "boundary",
        "text": "明天下午3点",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_reject": "missing_action",
    },
    {
        "id": "b05",
        "kind": "boundary",
        "text": "凌晨12点到1点写代码",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "写代码", "date": "2026-08-16", "start": 0, "end": 60, "category": "work", "location": None}
        ],
    },
    {
        "id": "b06",
        "kind": "boundary",
        "text": "晚上10点到12点写代码",
        "today": GOLDEN_ANCHOR_DATE,
        "expect_schedules": [
            {"name": "写代码", "date": "2026-08-16", "start": 1320, "end": 1440, "category": "work", "location": None}
        ],
    },
    {
        "id": "pl01",
        "kind": "planning",
        "text": "单任务基础规划",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写周报", "duration": 60, "priority": "auto"}],
            "memories": [],
            "constraints": [],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "within_range": True,
            "durations": True,
            "no_conflicts": True,
        },
    },
    {
        "id": "pl02",
        "kind": "planning",
        "text": "双任务优先级",
        "planning": {
            "goal": "",
            "tasks": [
                {"title": "低优先级任务", "duration": 60, "priority": "low"},
                {"title": "高优先级任务", "duration": 60, "priority": "high"},
            ],
            "memories": [],
            "constraints": [],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "no_conflicts": True,
            "durations": True,
            "priority_order": True,
        },
    },
    {
        "id": "pl03",
        "kind": "planning",
        "text": "截止日前完成",
        "planning": {
            "goal": "",
            "tasks": [{"title": "提交方案", "duration": 120, "priority": "high", "deadline": "2026-08-18"}],
            "memories": [],
            "constraints": [],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-21",
        },
        "checks": {
            "all_scheduled": True,
            "within_range": True,
            "deadline_before": "2026-08-18",
        },
    },
    {
        "id": "pl04",
        "kind": "planning",
        "text": "避开已有日程",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写代码", "duration": 120, "priority": "auto"}],
            "memories": [],
            "constraints": [],
            "existing": [{"date": "2026-08-17", "start": 540, "end": 600, "status": "scheduled"}],
            "range_start": "2026-08-17",
            "range_end": "2026-08-17",
        },
        "checks": {
            "all_scheduled": True,
            "no_conflicts": True,
        },
    },
    {
        "id": "pl05",
        "kind": "planning",
        "text": "类目映射",
        "planning": {
            "goal": "",
            "tasks": [{"title": "健身", "duration": 60, "priority": "auto"}],
            "memories": [],
            "constraints": [],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-17",
        },
        "checks": {
            "all_scheduled": True,
            "expected_categories": {"健身": "fitness"},
        },
    },
    {
        "id": "pl06",
        "kind": "planning",
        "text": "三个任务全部排期",
        "planning": {
            "goal": "",
            "tasks": [
                {"title": "写报告", "duration": 60, "priority": "medium"},
                {"title": "开会", "duration": 30, "priority": "high"},
                {"title": "运动", "duration": 90, "priority": "low"},
            ],
            "memories": [],
            "constraints": [],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "no_conflicts": True,
            "durations": True,
        },
    },
    {
        "id": "pl07",
        "kind": "planning",
        "text": "上午记忆",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写文章", "duration": 60, "priority": "auto"}],
            "memories": ["上午更适合深度工作，重要任务安排在上午"],
            "constraints": [],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-17",
        },
        "checks": {
            "all_scheduled": True,
            "morning": True,
        },
    },
    {
        "id": "pl08",
        "kind": "planning",
        "text": "晚上记忆",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写文章", "duration": 60, "priority": "auto"}],
            "memories": ["晚上比较安静，适合写文章，请安排在晚上"],
            "constraints": [],
            "existing": [
                {"date": "2026-08-17", "start": 360, "end": 780, "status": "scheduled"},
                {"date": "2026-08-17", "start": 840, "end": 900, "status": "scheduled"},
            ],
            "range_start": "2026-08-17",
            "range_end": "2026-08-17",
        },
        "checks": {
            "all_scheduled": True,
            "evening": True,
        },
    },
    {
        "id": "pl09",
        "kind": "planning",
        "text": "排除周三",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写周报", "duration": 60, "priority": "auto"}],
            "memories": [],
            "constraints": ["不要安排在周三"],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-21",
        },
        "checks": {
            "all_scheduled": True,
            "no_weekday": 2,
        },
    },
    {
        "id": "pl10",
        "kind": "planning",
        "text": "从14点开始",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写周报", "duration": 60, "priority": "auto"}],
            "memories": [],
            "constraints": ["从14:00开始安排工作"],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "start_after": 840,
        },
    },
    {
        "id": "cm01",
        "kind": "constraint_memory",
        "text": "不要安排在晚上",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写报告", "duration": 60, "priority": "auto"}],
            "memories": [],
            "constraints": ["不要安排在晚上"],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "no_evening": True,
        },
    },
    {
        "id": "cm02",
        "kind": "constraint_memory",
        "text": "下午三点前",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写周报", "duration": 60, "priority": "auto"}],
            "memories": [],
            "constraints": ["下午三点前"],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "start_before": 900,
        },
    },
    {
        "id": "cm03",
        "kind": "constraint_memory",
        "text": "上午记忆 + 不要晚上",
        "planning": {
            "goal": "",
            "tasks": [
                {"title": "写文章", "duration": 60, "priority": "high"},
                {"title": "整理文档", "duration": 60, "priority": "medium"},
            ],
            "memories": ["上午头脑最清醒，请把工作都安排在上午"],
            "constraints": ["不要安排在晚上"],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "morning": True,
            "no_evening": True,
        },
    },
    {
        "id": "cm04",
        "kind": "constraint_memory",
        "text": "周三晚上不能学习",
        "planning": {
            "goal": "",
            "tasks": [{"title": "学习AI", "duration": 60, "priority": "auto"}],
            "memories": [],
            "constraints": ["周三晚上不能学习"],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-21",
        },
        "checks": {
            "all_scheduled": True,
            "no_weekday_evening": 2,
        },
    },
    {
        "id": "cm05",
        "kind": "constraint_memory",
        "text": "上午工作偏好",
        "planning": {
            "goal": "",
            "tasks": [
                {"title": "写代码", "duration": 60, "priority": "high"},
                {"title": "写周报", "duration": 60, "priority": "medium"},
            ],
            "memories": ["我习惯上午处理工作"],
            "constraints": [],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "morning": True,
        },
    },
    {
        "id": "cm06",
        "kind": "constraint_memory",
        "text": "早上9点之前不安排任何任务（记忆驱动硬约束）",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写代码", "duration": 60, "priority": "auto"}],
            "memories": ["早上9点之前不安排任何任务"],
            "constraints": [],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "start_after": 540,
        },
    },
    {
        "id": "cm07",
        "kind": "constraint_memory",
        "text": "以25分钟时间块安排，中间需要间隔至少5分钟（分块工作方式）",
        "planning": {
            "goal": "",
            "tasks": [{"title": "写代码", "duration": 120, "priority": "auto"}],
            "memories": ["以25分钟时间块安排，中间需要间隔至少5分钟"],
            "constraints": [],
            "existing": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-18",
        },
        "checks": {
            "all_scheduled": True,
            "work_chunk_minutes": 25,
            "min_chunk_gap": 5,
        },
    },
]
