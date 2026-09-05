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
MINUTES_PER_DAY = 1440

CATEGORY_KEYWORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"写代码|编程|开发|代码|工作|开会|会议|客户|需求|办公|文案|项目|周报|代码评审|投简历|投递简历|求职|面试|招聘|找工作", re.I), "work"),
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
    text = re.sub(r"今晚", "今天晚上", text)
    text = re.sub(r"明早", "明天早上", text)
    text = re.sub(r"明晚", "明天晚上", text)
    text = re.sub(r"明凌晨", "明天凌晨", text)
    text = re.sub(r"明上午", "明天上午", text)
    text = re.sub(r"明下午", "明天下午", text)
    text = re.sub(r"明中午", "明天中午", text)
    text = re.sub(r"明傍晚", "明天傍晚", text)
    text = re.sub(r"明晚上", "明天晚上", text)
    text = re.sub(r"(周[一二三四五六日天]|今天|明天|后天)晚(?!上)", r"\1晚上", text)
    text = re.sub(r"(\d{1,2})\s*点", r"\1点", text)
    text = re.sub(r"(\d{1,2})点半", r"\1:30", text)
    text = re.sub(r"(\d{1,2})点(\d{1,2})分", r"\1:\2", text)
    text = re.sub(r"(\d{1,2})点(\d{1,2})", r"\1:\2", text)
    return text


def parse_clock(hour_text: str, minute_text: str | None, modifier: str) -> int:
    hour = int(hour_text)
    if modifier in ("晚上", "傍晚") and hour == 12:
        hour = 0
    elif modifier in ("下午", "晚上", "傍晚") and hour < 12:
        hour += 12
    if modifier == "凌晨" and hour == 12:
        hour = 0
    minute = int(minute_text) if minute_text else 0
    return max(0, min(1439, hour * 60 + minute))


_DAY_MARKER = (
    r"今天|明天|明日|后天|次日|第二天|明早|明晚|明凌晨|明上午|明下午|"
    r"明中午|明傍晚|明晚上|(?:周|星期)(?P<day_weekday>[一二三四五六日天])"
)

_TIME_RANGE_RE = re.compile(
    r"(?P<start_modifier>凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)?\s*"
    r"(?P<start_h>\d{1,2})(?:[:：点](?:(?P<start_m>\d{1,2}))?)?\s*"
    r"[到至~\-—–]\s*"
    r"(?P<day_marker>" + _DAY_MARKER + r")?"
    r"\s*(?P<end_modifier>凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)?\s*"
    r"(?P<end_h>\d{1,2})(?:[:：点](?:(?P<end_m>\d{1,2}))?)?"
)


def _parse_date_key(key: str) -> date:
    return date.fromisoformat(key)


def _day_offset_from_marker(
    marker: str | None, weekday_char: str | None, anchor: date
) -> date | None:
    if not marker:
        return None
    if marker == "今天":
        return anchor
    if marker in (
        "明天",
        "明日",
        "次日",
        "第二天",
        "明早",
        "明晚",
        "明凌晨",
        "明上午",
        "明下午",
        "明中午",
        "明傍晚",
        "明晚上",
    ):
        return add_days(anchor, 1)
    if marker == "后天":
        return add_days(anchor, 2)
    if weekday_char:
        target = WEEKDAY_INDEX[weekday_char]
        offset = (target - anchor.weekday()) % 7
        return add_days(anchor, offset)
    return None


def _modifier_from_marker(marker: str | None) -> str:
    return {
        "明早": "早上",
        "明晚": "晚上",
        "明凌晨": "凌晨",
        "明上午": "上午",
        "明下午": "下午",
        "明中午": "中午",
        "明傍晚": "傍晚",
        "明晚上": "晚上",
    }.get(marker or "", "")


def match_time_range(segment: str, start_date: date) -> dict[str, object] | None:
    match = _TIME_RANGE_RE.search(segment)
    if not match:
        return None
    groups = match.groupdict()
    start = parse_clock(
        groups["start_h"], groups["start_m"], groups["start_modifier"] or ""
    )
    raw_end_hour = int(groups["end_h"])
    raw_end_minute = int(groups["end_m"]) if groups["end_m"] else 0
    end_modifier = groups["end_modifier"] or ""
    marker = groups["day_marker"]
    marker_modifier = _modifier_from_marker(marker)
    if end_modifier:
        end = parse_clock(groups["end_h"], groups["end_m"], end_modifier)
    elif marker_modifier:
        end = parse_clock(groups["end_h"], groups["end_m"], marker_modifier)
    elif marker:
        # 显式日期但没写时段词（如“明天8点”）按 24 小时制处理
        end = raw_end_hour * 60 + raw_end_minute
    else:
        if (
            groups["start_modifier"] in ("晚上", "傍晚")
            and int(groups["start_h"]) == 12
        ):
            end = raw_end_hour * 60 + raw_end_minute
        else:
            end = parse_clock(
                groups["end_h"], groups["end_m"], groups["start_modifier"] or ""
            )
            if end <= start:
                if int(groups["end_h"]) == 12 and groups["start_modifier"] in (
                    "晚上",
                    "傍晚",
                ):
                    end = MINUTES_PER_DAY
                else:
                    end = raw_end_hour * 60 + raw_end_minute + MINUTES_PER_DAY

    end_date = _day_offset_from_marker(marker, groups["day_weekday"], start_date)
    if end_date is None:
        end_date = start_date
    elif end_date < start_date:
        end_date = add_days(end_date, 7)
    elif end_date == start_date and end <= start:
        end_date = add_days(end_date, 1)
    elif end <= start and not marker:
        end_date = add_days(end_date, 1)

    day_offset = (end_date - start_date).days
    end_offset = max(start + 15, day_offset * MINUTES_PER_DAY + end)
    return {
        "start": start,
        "end": end_offset,
        "raw": match.group(0),
        "match_start": match.start(),
    }


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
    month_day = re.search(
        r"(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]", segment
    )
    if month_day:
        year = int(month_day.group(1)) if month_day.group(1) else None
        month = int(month_day.group(2))
        day = int(month_day.group(3))
        candidates: list[date] = []
        years = (year,) if year is not None else (anchor.year, anchor.year + 1)
        for candidate_year in years:
            try:
                candidates.append(date(candidate_year, month, day))
            except ValueError:
                continue
        if not candidates:
            return None
        # 无年份时取不早于今天的最近候选（已过则顺延下一年）；显式年份按字面使用
        future = [value for value in candidates if value >= anchor]
        target = min(future) if future else max(candidates)
        return {"key": to_date_key(target), "raw": month_day.group(0)}
    if "今晚" in segment:
        return {"key": to_date_key(anchor), "raw": "今晚"}
    if "今天" in segment:
        return {"key": to_date_key(anchor), "raw": "今天"}
    for marker in ("明早", "明晚", "明凌晨", "明上午", "明下午", "明中午", "明傍晚", "明晚上"):
        if marker in segment:
            return {"key": to_date_key(add_days(anchor, 1)), "raw": marker}
    if "明天" in segment or "明日" in segment:
        return {"key": to_date_key(add_days(anchor, 1)), "raw": "明天"}
    if "后天" in segment:
        return {"key": to_date_key(add_days(anchor, 2)), "raw": "后天"}
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
    # 仅当 周/星期 后跟越界的中文数字（如周八、周十一）才算无效星期；
    # 「周报」「周期」等周字词语不是星期引用，不得误判拒答。
    if re.search(r"(?:周|星期)\s*[七八九十〇零两]", segment):
        return RejectReason(
            code="invalid_weekday", message="星期格式不正确，请使用“周一”到“周日”"
        )

    normalized_segment = normalize_time_notation(segment)
    range_match = match_time_range(normalized_segment, anchor)
    if range_match:
        date_info = find_date(normalized_segment[: int(range_match["match_start"])], anchor)
    else:
        range_match = match_single_time(normalized_segment)
        date_info = find_date(normalized_segment, anchor)

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


# 纯引导语段：「帮我记录一下」「帮我安排」「记录一下」等——整段只有指令词、
# 无时间无事项，不生成时间块（段内冒号后跟内容的写法不受影响，fullmatch 不命中）
_LEADIN_RE = re.compile(
    r"^(?:请\s*)?(?:帮\s*(?:我)?|麻烦|帮忙)?(?:记录|记|备注|添加|新增|录入|安排|建)(?:一?\s*下|个|上)?$"
)


def _is_time_only_segment(raw_segment: str, anchor: date) -> bool:
    """段是否为纯时间/日期表述（抽出时间与日期后无有效名称）。"""
    segment = raw_segment.strip()
    normalized = normalize_time_notation(segment)
    range_match = match_time_range(normalized, anchor) or match_single_time(normalized)
    remaining = normalized
    if range_match:
        remaining = remaining.replace(str(range_match["raw"]), "", 1)
    date_info = find_date(remaining, anchor)
    if date_info:
        remaining = remaining.replace(str(date_info["raw"]), "", 1)
    location = find_location(remaining)
    if location:
        remaining = re.sub(
            r"(?:地点[:：]?|在|去)" + re.escape(location) + r"$", "", remaining
        )
    name = clean_name(remaining)
    has_time_or_date = range_match is not None or date_info is not None
    return has_time_or_date and (name == "未命名事项" or not has_meaningful_name(name))


def _is_directive_segment(segment: str) -> bool:
    return (
        _LEADIN_RE.match(segment) is not None
        or extract_link_directive(segment) is not None
        or extract_detached_location(segment) is not None
    )


def _merge_segments(segments: list[str], anchor: date) -> list[str]:
    """段预处理：剥离纯引导语段，并把纯时间表述段与相邻事项段结合。

    「帮我记录一下,9月5号晚上6点半到9点,任务架构体检问题修复」经此处理成为
    单段「9月5号晚上6点半到9点任务架构体检问题修复」，最终产出单个时间块，
    避免引导语与事项段各自回填默认时段造成同一时段双写。
    """
    merged: list[str] = []
    for segment in segments:
        if _LEADIN_RE.match(segment):
            continue
        if merged:
            previous = merged[-1]
            previous_time_only = _is_time_only_segment(previous, anchor)
            current_time_only = _is_time_only_segment(segment, anchor)
            if (
                previous_time_only
                and not current_time_only
                and not _is_directive_segment(segment)
            ) or (
                current_time_only
                and not previous_time_only
                and not _is_directive_segment(previous)
            ):
                merged[-1] = previous + segment
                continue
        merged.append(segment)
    return merged


_LINK_DIRECTIVE_RE = re.compile(
    r"^关联(?:到|至|给)?(?:任务|项目)?\s*[:：]?\s*(.+)$"
)
_LINK_HANG_RE = re.compile(r"^挂到\s*[:：]?\s*(.+?)下$")


def extract_link_directive(segment: str) -> str | None:
    """识别「关联 X」指令段：返回关联目标名；非指令段返回 None。"""
    stripped = segment.strip()
    match = _LINK_DIRECTIVE_RE.match(stripped) or _LINK_HANG_RE.match(stripped)
    if not match:
        return None
    target = match.group(1).strip()
    if not target or not has_meaningful_name(target):
        return None
    return target


def parse_segment(raw_segment: str, anchor: date) -> ParsedSchedule:
    segment = raw_segment.strip()
    normalized_segment = normalize_time_notation(segment)
    range_match = match_time_range(normalized_segment, anchor)
    if range_match:
        date_info = find_date(normalized_segment[: int(range_match["match_start"])], anchor)
    else:
        range_match = match_single_time(normalized_segment)
        date_info = find_date(normalized_segment, anchor)
    item_date = date_info["key"] if date_info else to_date_key(anchor)

    if range_match and "match_start" in range_match:
        range_match = match_time_range(
            normalized_segment, _parse_date_key(item_date)
        )
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

    pending_link: str | None = None
    for raw_segment in _merge_segments(split_sentences(text), anchor):
        link_target = extract_link_directive(raw_segment)
        if link_target:
            if schedules:
                if not schedules[-1].linkTask:
                    schedules[-1].linkTask = link_target
            elif not pending_link:
                pending_link = link_target
            continue

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

    if pending_link and schedules and not schedules[0].linkTask:
        schedules[0].linkTask = pending_link
    rejected = rejections[0] if not schedules and rejections else None
    return schedules, rejected


def parse_schedule_text(text: str, anchor: date | None = None) -> list[ParsedSchedule]:
    schedules, _ = parse_schedule_with_feedback(text, anchor)
    return schedules
