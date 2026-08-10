"""中文自然语言解析（从 src/lib/nlp.ts 与 categories.ts 移植）。"""

from __future__ import annotations

import re
from datetime import date, timedelta

from app.schemas import ParsedSchedule, RejectReason


WEEKDAY_INDEX: dict[str, int] = {
    "一": 0,
    "二": 1,
    "三": 2,
    "四": 3,
    "五": 4,
    "六": 5,
    "日": 6,
    "天": 6,
}

TIME_MODIFIERS = ("凌晨", "早上", "早晨", "上午", "中午", "下午", "傍晚", "晚上")

CATEGORY_KEYWORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"写代码|编程|开发|代码|工作|开会|会议|客户|需求|办公|文案|项目|周报|代码评审", re.I), "work"),
    (re.compile(r"学习|阅读|读书|课程|上课|考试|背单词|研究|论文|写作|写文章|AI|教程", re.I), "study"),
    (re.compile(r"健身|跑步|运动|游泳|瑜伽|篮球|羽毛球|力量|拉伸|锻炼|骑行", re.I), "fitness"),
    (re.compile(r"睡觉|休息|午休|冥想|放松|散步", re.I), "rest"),
    (re.compile(r"吃饭|午餐|晚餐|早餐|买菜|做饭|家务|通勤|生活", re.I), "life"),
]


def to_date_key(d: date) -> str:
    return d.isoformat()


def add_days(d: date, n: int) -> date:
    return d + timedelta(days=n)


def guess_category(text: str) -> str:
    for pattern, category in CATEGORY_KEYWORDS:
        if pattern.search(text):
            return category
    return "life"


def normalize_time_notation(text: str) -> str:
    text = re.sub(r"(\d{1,2})\s*点", r"\1点", text)
    text = re.sub(r"(\d{1,2})点半", r"\1:30", text)
    text = re.sub(r"(\d{1,2})点(\d{1,2})分", r"\1:\2", text)
    text = re.sub(r"(\d{1,2})点(\d{1,2})", r"\1:\2", text)
    return text


def parse_clock(hour_text: str, minute_text: str | None, modifier: str) -> int:
    hour = int(hour_text)
    if modifier in ("下午", "晚上", "傍晚") and hour < 12:
        hour += 12
    if modifier == "凌晨" and hour == 12:
        hour = 0
    minute = int(minute_text) if minute_text else 0
    return max(0, min(1439, hour * 60 + minute))


_TIME_RANGE_RE = re.compile(
    r"(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})(?:[:：点](?:(\d{1,2}))?)?\s*"
    r"[到至~\-—–]\s*"
    r"(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})(?:[:：点](?:(\d{1,2}))?)?"
)


def match_time_range(segment: str) -> dict[str, object] | None:
    match = _TIME_RANGE_RE.search(segment)
    if not match:
        return None
    start = parse_clock(match.group(2), match.group(3), match.group(1) or "")
    end_modifier = match.group(4) or match.group(1) or ""
    end = parse_clock(match.group(5), match.group(6), end_modifier)
    return {"start": start, "end": max(start + 15, end), "raw": match.group(0)}


_SINGLE_TIME_RE = re.compile(
    r"(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)\s*(\d{1,2})(?:[:：点](?:(\d{1,2}))?)?"
)


def match_single_time(segment: str) -> dict[str, object] | None:
    match = _SINGLE_TIME_RE.search(segment)
    if not match:
        return None
    start = parse_clock(match.group(2), match.group(3), match.group(1))
    return {"start": start, "end": start + 60, "raw": match.group(0)}


def next_weekday_date(weekday_index: int, anchor: date) -> date:
    today_index = anchor.weekday()
    offset = (weekday_index - today_index) % 7
    return add_days(anchor, offset)


def find_date(segment: str, anchor: date) -> dict[str, str] | None:
    weekday_match = re.search(r"(?:周|星期)([一二三四五六日天])", segment)
    if weekday_match:
        index = WEEKDAY_INDEX[weekday_match.group(1)]
        return {"key": to_date_key(next_weekday_date(index, anchor)), "raw": weekday_match.group(0)}
    if "今天" in segment:
        return {"key": to_date_key(anchor), "raw": "今天"}
    if "明天" in segment:
        return {"key": to_date_key(add_days(anchor, 1)), "raw": "明天"}
    return None


_LOCATION_RE = re.compile(r"(?:地点[:：]?|在|去)([\u4e00-\u9fa5A-Za-z0-9]{1,10})$")


def find_location(segment: str) -> str | None:
    match = _LOCATION_RE.search(segment)
    if not match:
        return None
    candidate = match.group(1)
    if re.fullmatch(r"(今天|明天|上午|下午|晚上|中午|早上)", candidate):
        return None
    return candidate


def extract_detached_location(segment: str) -> str | None:
    trimmed = segment.strip()
    location = find_location(trimmed)
    if not location:
        return None
    rest = re.sub(r"(?:地点[:：]?|在|去)" + re.escape(location) + r"$", "", trimmed).strip()
    return None if rest else location


def clean_name(segment: str) -> str:
    cleaned = re.sub(r"[，。；;,.]$", "", segment)
    cleaned = re.sub(r"^[\s,，。；;]+|[\s,，。；;]+$", "", cleaned)
    return cleaned or "未命名事项"


def has_meaningful_name(name: str) -> bool:
    return re.search(r"[^\W\d_]", name) is not None


def detect_reject_reason(raw_segment: str, anchor: date) -> RejectReason | None:
    segment = raw_segment.strip()
    if not segment:
        return RejectReason(code="empty", message="输入为空，请输入包含时间和事项的句子")
    if re.search(r"(?:周|星期)[^一二三四五六日天\d]", segment):
        return RejectReason(
            code="invalid_weekday", message="星期格式不正确，请使用“周一”到“周日”"
        )

    normalized_segment = normalize_time_notation(segment)
    range_match = match_time_range(normalized_segment) or match_single_time(normalized_segment)
    date_info = find_date(segment, anchor)

    remaining = normalized_segment
    if range_match:
        remaining = remaining.replace(str(range_match["raw"]), "", 1)
    if date_info:
        remaining = remaining.replace(str(date_info["raw"]), "", 1)

    location = find_location(remaining)
    if location:
        remaining = re.sub(r"(?:地点[:：]?|在|去)" + re.escape(location) + r"$", "", remaining)

    name = clean_name(remaining)
    if name == "未命名事项" or not has_meaningful_name(name):
        if range_match:
            return RejectReason(
                code="missing_action",
                message="识别到了时间，但缺少事项名称，例如：下午2点到4点健身",
            )
        return RejectReason(
            code="garbage", message="没有识别到有效的时间安排，请输入包含时间和事项的句子"
        )
    return None


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"[，,。；;\n]+", text) if s.strip()]


def parse_segment(raw_segment: str, anchor: date) -> ParsedSchedule:
    segment = raw_segment.strip()
    date_info = find_date(segment, anchor)
    item_date = date_info["key"] if date_info else to_date_key(anchor)

    normalized_segment = normalize_time_notation(segment)
    range_match = match_time_range(normalized_segment) or match_single_time(normalized_segment)
    start = int(range_match["start"]) if range_match else 9 * 60
    end = int(range_match["end"]) if range_match else start + 60

    remaining = normalized_segment
    if range_match:
        remaining = remaining.replace(str(range_match["raw"]), "", 1)
    if date_info:
        remaining = remaining.replace(str(date_info["raw"]), "", 1)

    location = find_location(remaining)
    if location:
        remaining = re.sub(r"(?:地点[:：]?|在|去)" + re.escape(location) + r"$", "", remaining)

    name = clean_name(remaining)
    category = guess_category(f"{raw_segment} {name}")
    return ParsedSchedule(
        name=name,
        date=item_date,
        start=start,
        end=end,
        category=category,  # type: ignore[arg-type]
        location=location,
    )


def parse_schedule_with_feedback(
    text: str, anchor: date | None = None
) -> tuple[list[ParsedSchedule], RejectReason | None]:
    anchor = anchor or date.today()
    schedules: list[ParsedSchedule] = []
    rejections: list[RejectReason] = []
    if not text.strip():
        return [], RejectReason(code="empty", message="输入为空，请输入包含时间和事项的句子")

    for raw_segment in split_sentences(text):
        location = extract_detached_location(raw_segment)
        if location:
            if schedules:
                if not schedules[-1].location:
                    schedules[-1].location = location
            else:
                rejections.append(
                    RejectReason(
                        code="detached_location",
                        message="地点前面缺少活动，请把地点跟在活动后面，例如：周二下午2点在深圳湾写代码",
                    )
                )
            continue

        rejected = detect_reject_reason(raw_segment, anchor)
        if rejected:
            rejections.append(rejected)
            continue
        schedules.append(parse_segment(raw_segment, anchor))

    rejected = rejections[0] if not schedules and rejections else None
    return schedules, rejected


def parse_schedule_text(text: str, anchor: date | None = None) -> list[ParsedSchedule]:
    schedules, _ = parse_schedule_with_feedback(text, anchor)
    return schedules
