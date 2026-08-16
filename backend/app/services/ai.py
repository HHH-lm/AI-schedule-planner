"""OpenAI / DeepSeek 兼容协议的 AI 调用（从 src/lib/ai-parse.ts 移植）。"""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from typing import Any

import httpx

from app.config import Settings
from app.schemas import ParsedSchedule, RejectReason


CATEGORY_VALUES = ("work", "study", "fitness", "life", "rest")
REJECT_CODES = ("empty", "garbage", "invalid_weekday", "missing_action", "detached_location")

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
                "你是日程解析器，把中文安排解析成 JSON，只输出 JSON。",
                '格式:{"schedules":[{"name":"事项名","date":"YYYY-MM-DD","start":分钟,"end":分钟,'
                '"category":"work|study|fitness|life|rest","location":"地点"}],'
                '"rejected":{"code":"garbage|invalid_weekday|missing_action|detached_location",'
                '"message":"中文原因"}或null}',
                f"今天={today}（{weekday_label(today_date)}），明天={tomorrow_text}；"
                f"本周日期映射：{weekday_map_text}；"
                "“周X”必须按上面映射选择，绝不可选已经过去的日子，也不可把“周六”当成今天。",
                "start/end=当天0点起分钟数（14:30=870），end>start，至少15分钟。",
                "只有一个开始时间（如“下午3点健身”“晚上8点读书”）时，end=start+60，即默认1小时，禁止输出2小时。",
                '"在/去/地点:"后的地点放location，并从name中去掉；例如“去健身房跑步”→name="跑步"、location="健身房"。',
                "category:work=工作/写代码/开会/项目/客户，study=学习/阅读/写文章/AI，fitness=健身/跑步/瑜伽/篮球/游泳，life=生活/吃饭/家务/通勤，rest=休息/冥想。",
                "只有时间没有事项名（如“明天下午3点”）时，schedules=[]且rejected.code=\"missing_action\"，不要生成名称只是时间的schedule。",
                "同一时间段（date/start/end相同）的多个事项合并为一个schedule，name用\" + \"连接。",
                "多句拆成多个schedule；无有效安排时schedules=[]且rejected给原因。",
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
    safe_end = max(safe_start + 15, min(1439, end))
    category = raw.get("category") if raw.get("category") in CATEGORY_VALUES else "life"
    location = None
    if isinstance(raw.get("location"), str) and raw["location"].strip():
        location = raw["location"].strip()[:60]
    return ParsedSchedule(
        name=name[:80],
        date=item_date,
        start=safe_start,
        end=safe_end,
        category=category,  # type: ignore[arg-type]
        location=location,
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
) -> dict[str, Any]:
    config = PROVIDER_CONFIG[provider]
    base_url = (getattr(settings, config["base_url_attr"]) or config["default_base_url"]).rstrip("/")
    credential = getattr(settings, config["key_attr"])
    model = getattr(settings, config["model_attr"]) or config["default_model"]
    timeout = settings.ai_timeout_ms / 1000

    body = {
        "model": model,
        "temperature": temperature,
        "max_tokens": settings.max_output_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {credential}",
            },
            json=body,
        )
        if response.status_code >= 400:
            detail = response.text[:120]
            suffix = f"：{detail}" if detail else ""
            raise RuntimeError(f"AI 服务返回 {response.status_code}{suffix}")
        return response.json()


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
        data = await call_chat_completions(build_system_prompt(today), text, provider, settings)
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
