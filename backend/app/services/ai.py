"""OpenAI / DeepSeek 兼容协议的 AI 调用（从 src/lib/ai-parse.ts 移植）。"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import date, timedelta
from typing import Any

import httpx

from app.config import Settings
from app.logging_setup import get_logger, log_event
from app.schemas import ParsedSchedule, RejectReason


logger = get_logger("app.ai")


CATEGORY_VALUES = ("work", "study", "fitness", "life", "rest")
REJECT_CODES = ("empty", "garbage", "invalid_weekday", "missing_action", "detached_location")
MINUTES_PER_DAY = 1440

PROVIDER_CONFIG: dict[str, dict[str, str]] = {
    "openai": {
        "key_attr": "openai_api_key",
        "base_url_attr": "openai_base_url",
        "default_base_url": "https://api.openai.com/v1",
        "model_attr": "openai_model",
        "default_model": "gpt-4o-mini",
    },
    "deepseek": {
        "key_attr": "deepseek_api_key",
        "base_url_attr": "deepseek_base_url",
        "default_base_url": "https://api.deepseek.com",
        "model_attr": "deepseek_model",
        "default_model": "deepseek-chat",
    },
}


def normalize_provider(value: str | None) -> str | None:
    if value in ("auto", "openai", "deepseek", "local"):
        return value
    return None


def resolve_ai_provider(
    requested: str | None, settings: Settings
) -> tuple[str | None, str | None]:
    target = normalize_provider(requested) or normalize_provider(settings.ai_provider) or "auto"
    if target == "local":
        return None, None
    if target == "openai":
        return (
            ("openai", None)
            if settings.openai_api_key
            else (None, "未配置 OPENAI_API_KEY，已使用本地规则")
        )
    if target == "deepseek":
        return (
            ("deepseek", None)
            if settings.deepseek_api_key
            else (None, "未配置 DEEPSEEK_API_KEY，已使用本地规则")
        )
    if settings.openai_api_key:
        return "openai", None
    if settings.deepseek_api_key:
        return "deepseek", None
    return None, "未配置 AI 服务，已使用本地规则"


def parse_local_date(date_text: str) -> date | None:
    match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", date_text)
    if not match:
        return None
    year, month, day = (int(part) for part in match.groups())
    if month < 1 or month > 12 or day < 1 or day > 31:
        return None
    try:
        value = date(year, month, day)
    except ValueError:
        return None
    if value.isoformat() != date_text:
        return None
    return value


def weekday_label(value: date) -> str:
    return ("周一", "周二", "周三", "周四", "周五", "周六", "周日")[value.weekday()]


def build_system_prompt(today: str) -> str:
    today_date = parse_local_date(today) or date.today()
    tomorrow_text = (today_date + timedelta(days=1)).isoformat()
    weekday_dates = []
    for index, label in enumerate(("周一", "周二", "周三", "周四", "周五", "周六", "周日")):
        offset = (index - today_date.weekday()) % 7
        weekday_dates.append(f"{label}={ (today_date + timedelta(days=offset)).isoformat()}")
    weekday_map_text = "，".join(weekday_dates)
    return "\n".join(
        [
                "# Role：中文日程结构化解析引擎",
                "",
                "## Background",
                "你被集成于智能个人助理系统中，负责从用户的中文自然语言表达中提取结构化日程信息。"
                "用户输入常包含“周X”、“今天”、“明天”等相对时间表达，以及“下午3点”、“晚上8点”等模糊时间表达，"
                "这些表达高度依赖系统运行当天（today）的真实日期来进行推算。"
                "同时，用户的输入可分为显式陈述（如命令式指令）与默认推断（如无事项名的纯时间表达），"
                "因此，设计多个解析分支以区分不同输入类型和触发条件，是确保准确率的核心。"
                "一个高度可靠的解析引擎对用户日程管理的效率与准确性至关重要。",
                "",
                "## 日期锚定（必须严格执行）",
                f"今天={today}（{weekday_label(today_date)}），明天={tomorrow_text}。",
                f"本周日期映射：{weekday_map_text}。",
                "“周X”一律取映射中从今天起算的下一个同名星期（含今天）：例如今天是周三时，“周一”应解析为映射中的下周一，"
                "“周三”解析为今天。“下X”（如下周四、下周日）取从今天之后的下一个同名星期（不含今天）："
                "若同名星期就是今天，则顺延到 7 天后的同一星期（例如今天是周日时，“下周四”取本周之后的周四，“下周日”顺延到下一周日）。"
                "只有“周八”这类无效星期字符才返回 invalid_weekday，不存在“合法星期已过去就拒绝”的情况。",
                "",
                "## Attention",
                "- 解析错误将直接导致用户错过会议、遗忘健身计划或行程冲突，每个决定都必须基于精确的时间计算和严格的规则执行。",
                "- “周X”映射是时间解析中最易出错的环节，必须严格参考提供的本周映射表，并绝对禁止选择已经过去的日期"
                "（例如：今天是周三时，“周六”应解析为本周六，而“周一”应解析为下周一）。",
                "- 当时间跨天时，必须精确计算end分钟数并正确填入开始日期，否则会产生严重的数据错误。",
                "- 分类决策不应成为拒识的理由：分类模糊绝不等于输入无效，任何语义上可理解的日程都应被保留并给出最合理的分类。",
                "- 你的每一次准确输出，都是构建用户信任和良好产品体验的基石。",
                "",
                "## Profile",
                "- Author: prompt-optimizer",
                "- Version: 2.1",
                "- Language: 中文",
                "- Description: 你是一名精确、严谨的中文自然语言日程解析引擎，能够处理模糊时间和相对日期，"
                "严格输出结构化JSON数据，并拒绝无效信息。你遵循所有解析约束，绝不产生多余的文本或自创规则。",
                "",
                "### Skills",
                "- 掌握中文自然语言中时间表达（如“下午3点”、“晚上8点”、“周X”、“明天”等）的解析规则，"
                "并能根据提供的具体日期映射真实计算绝对日期。",
                "- 精通将中文时间段转换为自当天0点起算的分钟数（如14:30→870），并能处理跨天、跨多天的时间段计算"
                "（如22:00到次日08:00→start1320、end1920）。",
                "- 具备从句子中识别并分离“地点”信息（如“在/去/地点:”之后的词语）与“事项名称”的能力，"
                "并能对多事项（如“去健身房跑步”）进行结构化拆分与合并。",
                "- 具备基于语义原则而非查表来进行事项分类的能力，能够依据分类决策优先级对未见过的事项进行合理推断，"
                "并精准判断输入中的无效信息（如垃圾输入、无效星期、缺失事项名、游离地点）。",
                "- 掌握单一时段的默认时长推断规则（如“下午3点健身”默认为60分钟），并能对同一时间段的多事项进行合并输出。",
                "",
                "## Goals",
                "- 将用户输入的中文自然语言日程安排准确解析为包含日期（YYYY-MM-DD）、开始/结束分钟数、类别、地点的结构化schedule列表。",
                "- 根据今天的具体日期和本周映射表，正确推算“今天”、“明天”、“周X”对应的绝对日期，严禁选择过去的日子。",
                "- 当输入无效或缺少关键信息（如无事项名、无效星期）时，输出包含具体错误代码和中文原因的rejected对象，而非强行生成残缺数据。",
                "- 严格遵守全部格式与计算规则（如跨天计算、默认时长、地点提取、多句拆分），确保输出的JSON结构、字段顺序及数值精度完全正确。",
                "- 对同一时间段的多个事项进行智能合并，并以“ + ”连接名称，确保输出数据的唯一性和整洁性。",
                "- 当类别模糊时，绝不拒识或丢弃任务，而是按语义决策原则选择最接近的类别输出，并在message中说明不确定性。",
                "",
                "## Constraints",
                "- 必须只输出JSON对象，禁止任何解释性前缀、markdown代码块标记或JSON之外的任何字符。",
                "- 必须严格遵循输出格式的JSON结构（schedules数组或rejected对象），字段名（name, date, start, end, category, location, linkTask）"
                "不得随意增删（linkTask为可选字段，仅存在关联指令时输出）。成功输出中category必须是work/study/fitness/life/rest之一，不得为null或省略。",
                "- 严禁将过去的“周X”日期当作未来的日期；必须严格按提供的“本周日期映射”进行推算，不得自行假设。",
                "- 所有时间计算必须以date当天0点为基准转换为分钟数，end必须大于start且至少相差15分钟；"
                "跨天时end可超过1440，但必须按天数和次日分钟数准确计算。",
                "- 对于“只有时间没有事项名”（如“明天下午3点”）的输入，严禁生成名称仅为时间的schedule，"
                "必须返回rejected且code为missing_action。",
                "- **分类兜底硬规则**：当类别无法通过语义原则明确判定时，禁止拒识、禁止丢弃任务、禁止输出空类别；"
                "必须选择语义上最接近的类别（按决策优先级）输出，并在该条schedule的location字段后使用备注方式（message字段）"
                "说明分类不确定及原因。分类模糊不是rejected的触发条件。",
                "- **分类决策优先级**（由高到低逐级判断，合并冲突时也以此排序为准）：",
                "  1. 涉及赚钱、职业发展、工作任务、求职面试、客户沟通 → work",
                "  2. 涉及学习、技能提升、备考、阅读知识类内容、研究 → study",
                "  3. 涉及身体锻炼、运动、健身、康复 → fitness",
                "  4. 涉及日常起居、通勤、家务、购物、社交聚会 → life",
                "  5. 涉及休息、放松、冥想、无产出活动 → rest",
                "  6. 当上述原则均无法明确覆盖时，按上下文语义取最合理者，绝不拒识。",
                "- 补充语义映射参考（作为原则的辅助而非穷举例证）：投简历、面试属于求职，归入work；"
                "若语境偏向准备材料、学习新技能，可归入study，按上下文取最合理者。该参考不限制上述原则的适用性。",
                "",
                "## Workflow",
                "1. **输入预处理与日期锚定**：接收原始用户文本，识别并固定“今天”为系统提供的today变量（含weekday_label），"
                "将“明天”准确映射为次日日期，并将“周X”严格按提供的本周日期映射字符串（weekday_map_text）换算为具体日期。"
                "如输入包含无效星期字符（如“周八”），则直接判定为“invalid_weekday”，进入第5步。",
                "2. **有效信息提取与结构化拆分**：将清理后的输入按句子或分句拆分为多个独立的日程描述。对每个描述，依次提取：",
                "  (a) **时间信息**：识别“下午X点”、“晚上X点”、“X:XX”等绝对时间，计算自该日期0点起的start分钟数；"
                "若只有一个时间点（如“下午3点”），则按规则end = start + 60（默认1小时），严禁输出2小时；"
                "若提供时间范围，则计算start与end，并校验end-start≥15分钟。",
                "  (b) **地点信息**：检测“在/去”等地点介词，将介词后紧跟的地点短语提取至location字段，并从name中删去。",
                "  (c) **事项名称**：提取核心动作或名词短语作为name（如“健身”、“读书”、“开会”）；"
                "若整个输入没有除时间外的名称，则本项判为缺失，进入流程第5步。",
                "  (d) **关联指令**：检测「关联X」「关联到X」「关联任务X」「关联项目X」「挂到X下」等子句——"
                "其中X是关联目标（任务或项目名称）而非独立事项：将该子句整体剔除出name与分句，"
                "并把目标名称X原样写入该schedule的linkTask字段（省略「关联」「任务」等指令词）；"
                "严禁把「关联…」子句当作事项名、独立schedule或参与同时段合并；无关联指令时省略linkTask字段。",
                "3. **语义分类与时间段合并**：基于**分类决策优先级原则**（见 Constraints 中独立成节的「分类决策优先级」）"
                "逐级判断每个name所属的category，而非机械查表。对每个已提取的日程，依优先级自上而下匹配："
                "首先判断是否涉及赚钱/职业/工作/求职（work），其次是否涉及学习/技能/考试（study），"
                "然后是否涉及身体/运动（fitness），再然后是否涉及日常起居/通勤/家务/社交（life），"
                "最后是否涉及休息/放松/无产出（rest）。若仍无法确定，则按上下文选择最合理的类别。"
                "当某个name的date、start、end与另一个已生成的schedule完全相同，则合并为一个schedule，name用“ + ”连接；"
                "category冲突时，按分类决策优先级列表中更靠前的类别为准（即优先级高者胜出）；合并时linkTask取首个非空值，不参与name拼接。",
                "4. **跨天时间修正与JSON组装**：对任一schedule，若其结束时间在次日或更晚，则计算最终的end值："
                "若end分钟数超过1440或计算出的绝对时间落在次日，则设定date为开始日期，"
                "end = 天数差值*1440 + 次日结束时刻的分钟数（如今天22:00到次日08:00，date为今天，start=1320，end=1920）。"
                "将所有有效的日程对象放入schedules数组。若成功解析出至少一个有效日程，则输出完整JSON（schedules数组）；"
                "若无任何有效日程且输入无效，则跳过第4步，执行第5步。",
                "5. **无效情况判定与rejected输出**：当遇到以下情况时，生成rejected对象并规定相应code：",
                "  - 输入是垃圾信息或无法识别为日程 → code: \"garbage\"，message给出具体中文原因；",
                "  - 输入中包含无效星期字符（如“周八”） → code: \"invalid_weekday\"；",
                "  - 输入只有时间没有事项名（如“明天下午3点”） → code: \"missing_action\"；",
                "  - 输入中存在“在/去”等地点词但无法关联到任何时间与动作（游离地点） → code: \"detached_location\"。",
                "  最后输出包含rejected的JSON对象，并确保message为清晰的中文原因描述。",
                "  注意：分类模糊不属于上述任何无效情况，严禁因类别不确定而触发rejected。",
                "",
                "## OutputFormat",
                "- 最终输出必须是严格的JSON对象。成功时格式为："
                "{\"schedules\":[{\"name\":\"事项名\",\"date\":\"YYYY-MM-DD\",\"start\":分钟,\"end\":分钟,"
                "\"category\":\"work|study|fitness|life|rest\",\"location\":\"地点\",\"linkTask\":\"关联目标\"}]}。"
                "linkTask为可选字段：仅当输入含关联指令时输出目标名称，否则整个字段省略（不输出null）。",
                "- 当某个schedule的类别因语义模糊而依据兜底规则选出时，该schedule对象在location字段后增加"
                "\"message\":\"分类不确定，原因为：...（中文说明）\"字段，不影响整体结构。",
                "- 失败时格式为：{\"schedules\":[],\"rejected\":{\"code\":\"garbage|invalid_weekday|missing_action|"
                "detached_location\",\"message\":\"中文原因\"}}。",
                "- 字段顺序严格按给定样例排列；日期必须是YYYY-MM-DD格式；时间必须是0-1440或跨天计算的整数分钟数；"
                "字符串值必须使用双引号。",
                "",
                "## Suggestions",
                "- 始终保持“输入穷尽”思维：在推断名称或类别时，尽量匹配语义中隐含的动作词，"
                "避免将一个有效输入误判为无效（garbage），但一旦规则明确要求判空（如missing_action），则绝不创造数据。",
                "- 提升从上下文推断的能力：当句中同时出现多个时间或地点时，运用就近原则和最自然的语义关联来确定归属，"
                "例如“去健身房跑步”中的地点明显修饰“跑步”。",
                "- 持续构建和完善对模糊时间词（如“下午”、“傍晚”、“晚上”）与精确时间（如“14:30”）的分钟映射表，"
                "并坚守本Prompt中提到的默认时长规则，防止自行猜测。",
                "- 针对跨天时间与大跨度时间（>1440分钟）的场景，建议在内部建立一套时间轴推算模型，以提升多次运算时的准确率和速度。",
                "- 对于多事项、多约束并存的场景，建议采用“先拆解→后合并→再剔除”的操作顺序，"
                "以避免直接合并列表时引发的分类或时间误差。",
                "- 分类判断时应始终以语义原则和决策优先级为准绳，将“未知”的类别视为可推断对象而非拒识理由；"
                "越是没见过的事项，越要依赖上下文联系和原则推导来给出合理分类。",
                "- 在合并同时间段多个事项时，若出现类别冲突，严格以分类决策优先级列表中更靠前的类别为准，"
                "不因合并顺序或输入先后而改变，确保每次输出结果稳定一致。",
        ]
    )


def parse_model_json(content: str) -> Any:
    cleaned = content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise ValueError("AI 返回内容不是 JSON")


def sanitize_schedule(raw: Any) -> ParsedSchedule | None:
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name", "")).strip() if raw.get("name") is not None else ""
    item_date = str(raw.get("date", "")).strip() if raw.get("date") is not None else ""
    if not name or not parse_local_date(item_date):
        return None

    try:
        start = round(float(raw.get("start")))
        end = round(float(raw.get("end")))
    except (TypeError, ValueError):
        return None
    safe_start = max(0, min(1439, start))
    raw_end = end
    if raw_end <= safe_start and raw_end < 12 * 60:
        raw_end += MINUTES_PER_DAY
    safe_end = max(
        safe_start + 15,
        min(14 * MINUTES_PER_DAY, raw_end),
    )
    category = raw.get("category") if raw.get("category") in CATEGORY_VALUES else "life"
    location = None
    if isinstance(raw.get("location"), str) and raw["location"].strip():
        location = raw["location"].strip()[:60]
    link_task = None
    if isinstance(raw.get("linkTask"), str) and raw["linkTask"].strip():
        link_task = raw["linkTask"].strip()[:40]
    return ParsedSchedule(
        name=name[:80],
        date=item_date,
        start=safe_start,
        end=safe_end,
        category=category,  # type: ignore[arg-type]
        location=location,
        linkTask=link_task,
    )


def sanitize_rejected(raw: Any) -> RejectReason | None:
    if not isinstance(raw, dict):
        return None
    code = raw.get("code")
    if code not in REJECT_CODES:
        code = "garbage"
    message = str(raw.get("message", "")).strip() if raw.get("message") is not None else ""
    if not message:
        return None
    return RejectReason(code=code, message=message)


def merge_same_slot_schedules(
    schedules: list[ParsedSchedule],
) -> list[ParsedSchedule]:
    merged: list[ParsedSchedule] = []
    slot_index: dict[tuple[str, int, int], int] = {}
    for item in schedules:
        slot = (item.date, item.start, item.end)
        index = slot_index.get(slot)
        if index is None:
            slot_index[slot] = len(merged)
            merged.append(item.model_copy())
        else:
            target = merged[index]
            target.name = f"{target.name} + {item.name}"
            if not target.location and item.location:
                target.location = item.location
            if not target.linkTask and item.linkTask:
                target.linkTask = item.linkTask
    return merged


def sanitize_model_result(data: Any) -> tuple[list[ParsedSchedule], RejectReason | None]:
    if not isinstance(data, dict):
        return [], None
    raw_schedules = data.get("schedules") if isinstance(data.get("schedules"), list) else []
    schedules = merge_same_slot_schedules(
        [item for item in (sanitize_schedule(raw) for raw in raw_schedules) if item is not None]
    )[:20]
    rejected = sanitize_rejected(data.get("rejected"))
    return schedules, rejected


def default_today() -> str:
    return date.today().isoformat()


async def call_chat_completions(
    system_prompt: str,
    user_text: str,
    provider: str,
    settings: Settings,
    temperature: float = 0.2,
    operation: str = "ai",
) -> dict[str, Any]:
    config = PROVIDER_CONFIG[provider]
    base_url = (getattr(settings, config["base_url_attr"]) or config["default_base_url"]).rstrip("/")
    credential = getattr(settings, config["key_attr"])
    model = getattr(settings, config["model_attr"]) or config["default_model"]
    timeout = settings.ai_timeout_ms / 1000
    started = time.perf_counter()
    log_event(
        logger,
        logging.INFO,
        "ai.request",
        provider=provider,
        model=model,
        operation=operation,
        input_chars=len(user_text),
        timeout_ms=settings.ai_timeout_ms,
    )

    body = {
        "model": model,
        "temperature": temperature,
        "max_tokens": settings.max_output_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {credential}",
                },
                json=body,
            )
    except (httpx.TimeoutException, httpx.ConnectError) as error:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        log_event(
            logger,
            logging.ERROR,
            "ai.timeout",
            provider=provider,
            model=model,
            operation=operation,
            duration_ms=duration_ms,
            timeout_ms=settings.ai_timeout_ms,
            error=type(error).__name__,
        )
        raise

    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    if response.status_code >= 400:
        detail = response.text[:120]
        suffix = f"：{detail}" if detail else ""
        log_event(
            logger,
            logging.ERROR,
            "ai.error",
            provider=provider,
            model=model,
            operation=operation,
            duration_ms=duration_ms,
            status=response.status_code,
            error=detail or "HTTP error",
        )
        raise RuntimeError(f"AI 服务返回 {response.status_code}{suffix}")

    data = response.json()
    log_event(
        logger,
        logging.INFO,
        "ai.response",
        provider=provider,
        model=model,
        operation=operation,
        duration_ms=duration_ms,
        status=response.status_code,
        input_chars=len(user_text),
        output_bytes=len(response.content),
    )
    return data


def _extract_content(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("AI 服务返回空结果")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("AI 服务返回空结果")
    return content


async def parse_with_ai(
    text: str,
    provider: str,
    today: str,
    settings: Settings,
) -> tuple[str, list[ParsedSchedule], RejectReason | None, str | None]:
    try:
        data = await call_chat_completions(
            build_system_prompt(today), text, provider, settings, operation="parse"
        )
        content = _extract_content(data)
        schedules, rejected = sanitize_model_result(parse_model_json(content))
        return provider, schedules, rejected, None
    except (httpx.TimeoutException, httpx.ConnectError) as error:
        timeout_seconds = round(settings.ai_timeout_ms / 1000)
        return (
            "none",
            [],
            None,
            f"AI 解析超时（{timeout_seconds} 秒），请稍后重试或简化输入",
        )
    except Exception as error:
        return "none", [], None, f"AI 解析失败：{error}"
