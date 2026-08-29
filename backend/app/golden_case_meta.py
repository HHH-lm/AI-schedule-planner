"""Golden set 元数据层：版本、来源、预期语义与输入语义。

`golden_ai_cases.py` 保留原始结构化期望；本模块在加载时为每条用例附加
name/description/input/source/added_in/rationale，并把 legacy `text` 迁移为
`input`。quickadd/boundary 的 input 继承原用户输入；其余 kind 使用本层的
自然语言场景，避免同一个字段既当用户输入又当用例描述。
"""

from __future__ import annotations

from typing import Any


GOLDEN_SET_VERSION = "0.5.0"


GOLDEN_CASE_META: dict[str, dict[str, str]] = {
    "qa01": {
        "name": "周三世纪公园跑步",
        "description": "解析周三 15:00-16:00 的 fitness 块，地点提取为世纪公园。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "覆盖周几映射、地点提取、fitness 类目与精确时间段的组合回归。",
    },
    "qa02": {
        "name": "明天上午写周报",
        "description": "解析明天 09:00-11:00 的 work 块，无地点。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "覆盖“明天”的日期锚定与 work 类目。",
    },
    "qa03": {
        "name": "周二晚上学习英语",
        "description": "解析周二晚上 20:00-21:00 的 study 块。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "覆盖晚间时间换算（20 点 = 1200 分钟）与 study 类目。",
    },
    "qa04": {
        "name": "周五下午开会带地点",
        "description": "解析周五 14:30-15:30 的 work 块，地点为会议室A。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "覆盖半小时起点/终点分钟换算与逗号后地点提取。",
    },
    "qa05": {
        "name": "周六早上晨跑",
        "description": "解析周六早上 07:00-08:00 的 fitness 块。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "覆盖周末日期映射与早晨时段。",
    },
    "qa06": {
        "name": "今天下午做晚餐",
        "description": "解析今天 16:00-17:00 的 life 块。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "覆盖“今天”锚定与 life 类目。",
    },
    "qa07": {
        "name": "周三中午吃饭",
        "description": "解析周三中午 12:00-13:00 的 life 块。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "覆盖午间 12 点分钟换算。",
    },
    "qa08": {
        "name": "周四下午单时间健身",
        "description": "只有开始时间“下午3点健身”时按默认 1 小时生成 15:00-16:00。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "锁定默认时长规则，防止模型输出 2 小时默认块。",
    },
    "qa09": {
        "name": "周五晚上单时间阅读",
        "description": "只有开始时间“晚上10点阅读”时按默认 1 小时生成 22:00-23:00。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "锁定晚间默认时长与 study 类目。",
    },
    "qa10": {
        "name": "多句多时间块",
        "description": "同一输入包含两项安排时拆分为两个独立 schedule。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "覆盖多句拆分与同日/隔日周几映射。",
    },
    "qa11": {
        "name": "今晚跨到明早值班",
        "description": "“今晚10点到明天早上8点”解析为 22:00 到次日 08:00 的跨天块（end=1920）。",
        "source": "synthetic",
        "added_in": "0.2.0",
        "rationale": "来自用户跨天需求的合成回归样本，防止跨天 end 分钟计算退化。",
    },
    "qa12": {
        "name": "周五晚跨到周六早爬山",
        "description": "跨周末的“晚上10点到次日早上8点”解析为 22:00 到次日 08:00。",
        "source": "synthetic",
        "added_in": "0.2.0",
        "rationale": "覆盖跨天块落在周末边界场景。",
    },
    "qa13": {
        "name": "周五上午投简历",
        "description": "解析周五 10:00-11:00 的 work 块，求职类目必须归入工作。",
        "source": "fault_sample",
        "added_in": "0.4.0",
        "rationale": "回归保护“投简历/求职”不再被误判为 life；来自用户反馈的类目漂移样本。",
    },
    "qa14": {
        "name": "周三下午面试",
        "description": "解析周三 14:00-15:00 的 work 块，面试归入求职工作类目。",
        "source": "fault_sample",
        "added_in": "0.4.0",
        "rationale": "与 qa13 组成求职类目多措辞回归，防止类目判定在措辞间漂移。",
    },
    "qa15": {
        "name": "凌晨记录并关联任务",
        "description": "「截止日期修改，关联 AI schedule」中「关联」子句是关联指令："
        "生成 name=截止日期修改、linkTask=AI schedule 的单个 00:00-00:25 块，"
        "严禁把指令子句拼入 name 或当作独立事项。",
        "source": "fault_sample",
        "added_in": "0.5.0",
        "rationale": "用户真实缺陷回归：关联指令曾被当作独立事项经同时段合并污染名字"
        "（「截止日期修改 + 关联 AI schedule」）；锁定 linkTask 字段契约与凌晨 0 点边界。",
    },
    "b01": {
        "name": "空输入拒答",
        "description": "空输入必须返回 empty 拒答且不生成 schedule。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "空输入不能回退成默认时间块。",
    },
    "b02": {
        "name": "纯符号拒答",
        "description": "纯符号输入必须返回 garbage 拒答。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "无有效安排不得生成默认时间块。",
    },
    "b03": {
        "name": "无效星期拒答",
        "description": "“周八开会”必须返回 invalid_weekday 拒答。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "非法星期不能回退成默认时间块。",
    },
    "b04": {
        "name": "缺事项名拒答",
        "description": "“明天下午3点”有时间但没有事项名，必须返回 missing_action。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "只给时间不给事项时不得自造名称。",
    },
    "b05": {
        "name": "凌晨0点边界",
        "description": "凌晨12点=当天 0 点，写代码 00:00-01:00。",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "0 分钟起点不应被当作非法时间。",
    },
    "b06": {
        "name": "晚上到午夜1440边界",
        "description": "晚上10点到12点写代码=1320-1440，end 必须为 1440。",
        "source": "synthetic",
        "added_in": "0.2.0",
        "rationale": "24:00 必须落在 1440 而不是 0 或 24 小时制错误。",
    },
    "pl01": {
        "name": "单任务基础规划",
        "description": "单个 60 分钟任务必须在排期内排完，时长一致且无冲突。",
        "input": "请帮我把写周报安排 1 小时",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "基础排期基线，任何调度回归都应先在这里暴露。",
    },
    "pl02": {
        "name": "双任务优先级",
        "description": "高优先级任务必须完整排在高优先级任务之前，并按标题对应。",
        "input": "今天把低优先级任务和高优先级任务各安排 1 小时，高优先级优先",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "防住“块序即优先级”的假阳性，检查必须核对标题。",
    },
    "pl03": {
        "name": "截止日前完成",
        "description": "带 deadline 的任务必须安排在 2026-08-18 当天或之前。",
        "input": "提交方案需要 2 小时，请安排在 8 月 18 日前完成",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "deadline 是硬语义，不能只满足排期范围。",
    },
    "pl04": {
        "name": "避开已有日程",
        "description": "新增任务不得与已有日程 09:00-10:00 冲突。",
        "input": "帮我安排 2 小时写代码，避开已有会议日程",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "回归保护 existing_schedule 被 Pydantic 丢弃的问题。",
    },
    "pl05": {
        "name": "类目映射",
        "description": "任务标题“健身”的排期块 category 必须为 fitness。",
        "input": "请安排 1 小时健身",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "类目影响统计周报与颜色展示。",
    },
    "pl06": {
        "name": "三个任务全部排期",
        "description": "三个不同优先级/时长的任务都要排完且互不冲突。",
        "input": "帮我把写报告 1 小时、开会 30 分钟、运动 90 分钟都安排上",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "覆盖批量任务不漏排与冲突检测。",
    },
    "pl07": {
        "name": "上午记忆软偏好",
        "description": "记忆“上午更适合深度工作”时任务应完整落在上午。",
        "input": "安排 1 小时写文章，我上午更适合深度工作",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "记忆不能只进 prompt 不落地到时段检查。",
    },
    "pl08": {
        "name": "晚上记忆软偏好",
        "description": "记忆“晚上适合写文章”且白天已有日程时，任务应完整落在晚间。",
        "input": "安排 1 小时写文章，晚上比较安静",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "修复晚上偏好按时段中点误判的回归。",
    },
    "pl09": {
        "name": "排除周三",
        "description": "约束“不要安排在周三”时任务不得落在周三。",
        "input": "安排 1 小时写周报，不要安排在周三",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "排除式约束必须按天生效。",
    },
    "pl10": {
        "name": "从14点开始",
        "description": "约束“从14:00开始安排工作”时所有块起点不得早于 14:00。",
        "input": "安排 1 小时写周报，从14:00开始安排工作",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "时点下限约束。",
    },
    "cm01": {
        "name": "不要安排在晚上",
        "description": "硬约束“不要安排在晚上”：任何块不得与 18:00-24:00 重叠。",
        "input": "安排 1 小时写报告，不要安排在晚上",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "晚上是默认高频时段，防止硬约束失效。",
    },
    "cm02": {
        "name": "下午三点前完成",
        "description": "“下午三点前”语义为块必须完整结束于 15:00 前（end_before=900）。",
        "input": "安排 1 小时写周报，下午三点前",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "修复 start_before 只看起点导致 14:30-15:30 误判通过。",
    },
    "cm03": {
        "name": "上午记忆+不要晚上",
        "description": "上午软记忆与“不要晚上”硬约束同时生效。",
        "input": "安排写文章和整理文档各 1 小时，我上午头脑最清醒，不要安排在晚上",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "软硬约束组合。",
    },
    "cm04": {
        "name": "周三晚上不能学习",
        "description": "周三晚上的学习任务必须避开周三晚间时段。",
        "input": "安排 1 小时学习AI，周三晚上不能学习",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "日期+时段复合排除。",
    },
    "cm05": {
        "name": "上午工作偏好",
        "description": "记忆“习惯上午处理工作”时所有工作任务应完整落在上午。",
        "input": "安排写代码和写周报各 1 小时，我习惯上午处理工作",
        "source": "synthetic",
        "added_in": "0.1.0",
        "rationale": "偏好应应用到全部任务。",
    },
    "cm06": {
        "name": "9点前不安排（记忆硬约束）",
        "description": "排除式记忆“早上9点之前不安排任何任务”必须解析为 start_after=540 硬约束。",
        "input": "安排 1 小时写代码，早上9点之前不安排任何任务",
        "source": "fault_sample",
        "added_in": "0.3.0",
        "rationale": "修复排除式记忆只进 prompt 不落地为硬约束的缺陷。",
    },
    "cm07": {
        "name": "25分钟分块工作",
        "description": "120 分钟任务按 25 分钟块排，块间至少 5 分钟间隔。",
        "input": "安排 2 小时写代码，以25分钟时间块安排，中间需要间隔至少5分钟",
        "source": "fault_sample",
        "added_in": "0.3.0",
        "rationale": "分块排期契约回归：时长聚合、块长与间隔检查。",
    },
}


def attach_golden_meta(case: dict[str, Any]) -> dict[str, Any]:
    """加载时为用例附加元数据，并把 legacy `text` 迁移为语义明确的 `input`。"""
    meta = GOLDEN_CASE_META[case["id"]]
    case["name"] = meta["name"]
    case["description"] = meta["description"]
    case["input"] = meta.get("input", case.get("text", ""))
    case["source"] = meta["source"]
    case["added_in"] = meta["added_in"]
    case["rationale"] = meta["rationale"]
    case.pop("text", None)
    return case
