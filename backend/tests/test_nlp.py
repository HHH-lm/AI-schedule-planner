from __future__ import annotations

from datetime import date

from app.services.nlp import (
    detect_reject_reason,
    extract_link_directive,
    parse_schedule_text,
    parse_schedule_with_feedback,
    split_sentences,
)


ANCHOR = date(2026, 8, 3)  # 2026-08-03 周一


def test_split_sentences() -> None:
    assert split_sentences("写代码，看书；健身。") == ["写代码", "看书", "健身"]


def test_parse_full_sentence_with_location() -> None:
    parsed = parse_schedule_text("周二下午2点到5点写代码在深圳湾", ANCHOR)
    assert parsed[0].name == "写代码"
    assert parsed[0].date == "2026-08-04"
    assert parsed[0].start == 14 * 60
    assert parsed[0].end == 17 * 60
    assert parsed[0].category == "work"
    assert parsed[0].location == "深圳湾"


def test_parse_with_detached_location() -> None:
    parsed = parse_schedule_text("周二下午2点到4点健身，地点健身房", ANCHOR)
    assert parsed[0].name == "健身"
    assert parsed[0].date == "2026-08-04"
    assert parsed[0].start == 14 * 60
    assert parsed[0].end == 16 * 60
    assert parsed[0].category == "fitness"
    assert parsed[0].location == "健身房"


def test_parse_with_spaced_time() -> None:
    parsed = parse_schedule_text("周二下午2点到 4 点健身，地点健身房", ANCHOR)
    assert parsed[0].name == "健身"
    assert parsed[0].start == 14 * 60
    assert parsed[0].end == 16 * 60


def test_parse_job_hunting_category_work() -> None:
    parsed = parse_schedule_text("周五上午10点到11点投简历", ANCHOR)
    assert parsed[0].name == "投简历"
    assert parsed[0].category == "work"

    parsed = parse_schedule_text("周三下午2点到3点面试", ANCHOR)
    assert parsed[0].name == "面试"
    assert parsed[0].category == "work"


def test_parse_tomorrow_evening() -> None:
    parsed = parse_schedule_text("明天晚上8点吃饭", ANCHOR)
    assert parsed[0].name == "吃饭"
    assert parsed[0].date == "2026-08-04"
    assert parsed[0].start == 20 * 60
    assert parsed[0].end == 21 * 60
    assert parsed[0].category == "life"


def test_parse_midnight_boundary() -> None:
    parsed = parse_schedule_text("凌晨12点到1点整理资料", ANCHOR)
    assert parsed[0].start == 0
    assert parsed[0].end == 60


def test_parse_evening_to_midnight_uses_1440_boundary() -> None:
    parsed = parse_schedule_text("晚上10点到12点写代码", ANCHOR)
    assert parsed[0].start == 22 * 60
    assert parsed[0].end == 1440
    assert parsed[0].name == "写代码"


def test_parse_evening_midnight_as_start() -> None:
    parsed = parse_schedule_text("晚上12点到1点整理资料", ANCHOR)
    assert parsed[0].start == 0
    assert parsed[0].end == 60


def test_parse_overnight_with_next_day_marker() -> None:
    parsed = parse_schedule_text("今晚10点到明天早上8点值班", ANCHOR)
    assert parsed[0].name == "值班"
    assert parsed[0].date == "2026-08-03"
    assert parsed[0].start == 22 * 60
    assert parsed[0].end == 1440 + 8 * 60


def test_parse_overnight_with_mingzao() -> None:
    parsed = parse_schedule_text("周五晚10点到明早8点爬山", ANCHOR)
    assert parsed[0].name == "爬山"
    assert parsed[0].date == "2026-08-07"
    assert parsed[0].start == 22 * 60
    assert parsed[0].end == 1440 + 8 * 60


def test_parse_weekday_range_cross_day() -> None:
    parsed = parse_schedule_text("周五晚10点到周六早上8点徒步", ANCHOR)
    assert parsed[0].name == "徒步"
    assert parsed[0].date == "2026-08-07"
    assert parsed[0].end == 1440 + 8 * 60


def test_parse_overnight_without_end_date_marker() -> None:
    parsed = parse_schedule_text("晚上10点到8点写代码", ANCHOR)
    assert parsed[0].start == 22 * 60
    assert parsed[0].end == 1440 + 8 * 60
    assert parsed[0].name == "写代码"


def test_evening_range_with_inherited_modifier_stays_same_day() -> None:
    parsed = parse_schedule_text("晚上10点到11点阅读", ANCHOR)
    assert parsed[0].start == 22 * 60
    assert parsed[0].end == 23 * 60


def test_parse_no_time_defaults_to_morning() -> None:
    parsed = parse_schedule_text("写代码", ANCHOR)
    assert parsed[0].date == "2026-08-03"
    assert parsed[0].start == 9 * 60
    assert parsed[0].end == 10 * 60


def test_reject_garbage() -> None:
    parsed, rejected = parse_schedule_with_feedback("!!!###", ANCHOR)
    assert parsed == []
    assert rejected is not None
    assert rejected.code == "garbage"


def test_reject_invalid_weekday() -> None:
    parsed, rejected = parse_schedule_with_feedback("周八开会", ANCHOR)
    assert parsed == []
    assert rejected is not None
    assert rejected.code == "invalid_weekday"


def test_reject_missing_action() -> None:
    parsed, rejected = parse_schedule_with_feedback("明天", ANCHOR)
    assert parsed == []
    assert rejected is not None
    assert rejected.code == "garbage" or rejected.code == "missing_action"


def test_detached_location_without_previous_block() -> None:
    parsed, rejected = parse_schedule_with_feedback("地点深圳湾", ANCHOR)
    assert parsed == []
    assert rejected is not None
    assert rejected.code == "detached_location"


def test_weekday_from_current_time_forward() -> None:
    sunday = date(2026, 8, 9)
    parsed = parse_schedule_text("周二下午2点到4点健身", sunday)
    assert parsed[0].date == "2026-08-11"

    tuesday = date(2026, 8, 4)
    parsed = parse_schedule_text("周二晚上8点吃饭", tuesday)
    assert parsed[0].date == "2026-08-04"


def test_detect_reject_reason_returns_none_for_valid_input() -> None:
    assert detect_reject_reason("周二下午2点到5点写代码", ANCHOR) is None


def test_extract_link_directive_variants() -> None:
    assert extract_link_directive("关联 AI schedule") == "AI schedule"
    assert extract_link_directive("关联到AI日程") == "AI日程"
    assert extract_link_directive("关联任务：AI schedule") == "AI schedule"
    assert extract_link_directive("关联项目 AI schedule") == "AI schedule"
    assert extract_link_directive("挂到 AI schedule 下") == "AI schedule"
    assert extract_link_directive("关联") is None
    assert extract_link_directive("关联。。。") is None
    assert extract_link_directive("做关联分析") is None
    assert extract_link_directive("读书") is None


def test_parse_link_directive_segment_attaches_to_schedule() -> None:
    parsed = parse_schedule_text("凌晨12:00到12:25健身，关联 AI schedule", ANCHOR)
    assert len(parsed) == 1
    assert parsed[0].name == "健身"
    assert parsed[0].start == 0
    assert parsed[0].end == 25
    assert parsed[0].linkTask == "AI schedule"


def test_parse_link_directive_not_added_as_block() -> None:
    parsed, rejected = parse_schedule_with_feedback(
        "凌晨12:00到12:25健身，关联 AI schedule", ANCHOR
    )
    assert rejected is None
    assert len(parsed) == 1
    assert parsed[0].name == "健身"
    assert all(schedule.start != 9 * 60 for schedule in parsed)


def test_parse_link_directive_before_activity() -> None:
    parsed = parse_schedule_text("关联 AI schedule，明天下午3点到4点做审查", ANCHOR)
    assert len(parsed) == 1
    assert parsed[0].name == "做审查"
    assert parsed[0].date == "2026-08-04"
    assert parsed[0].linkTask == "AI schedule"


def test_parse_inline_correlation_analysis_not_directive() -> None:
    parsed = parse_schedule_text("明天下午3点到4点做关联分析", ANCHOR)
    assert len(parsed) == 1
    assert parsed[0].name == "做关联分析"
    assert parsed[0].linkTask is None


def test_parse_link_directive_only_input_yields_no_schedule() -> None:
    parsed, rejected = parse_schedule_with_feedback("关联 AI schedule", ANCHOR)
    assert parsed == []
    assert rejected is None


def test_parse_user_report_input_no_polluted_block() -> None:
    parsed, _ = parse_schedule_with_feedback(
        "帮我记录一下：刚刚凌晨 12:00 到 12:25，截止日期修改，关联 AI schedule。",
        ANCHOR,
    )
    linked = [s for s in parsed if s.linkTask]
    assert len(linked) == 1
    assert linked[0].linkTask == "AI schedule"
    assert all("+ 关联" not in s.name for s in parsed)
    assert all(s.name != "关联 AI schedule" for s in parsed)
