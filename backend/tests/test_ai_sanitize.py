from __future__ import annotations

from app.services.ai import merge_same_slot_schedules, sanitize_schedule
from app.schemas import ParsedSchedule


def test_sanitize_schedule_keeps_cross_day_end() -> None:
    schedule = sanitize_schedule(
        {
            "name": "值班",
            "date": "2026-08-03",
            "start": 22 * 60,
            "end": 1440 + 8 * 60,
            "category": "work",
        }
    )
    assert schedule is not None
    assert schedule.start == 22 * 60
    assert schedule.end == 1440 + 8 * 60


def test_sanitize_schedule_treats_small_end_as_next_morning() -> None:
    schedule = sanitize_schedule(
        {
            "name": "值班",
            "date": "2026-08-03",
            "start": 22 * 60,
            "end": 8 * 60,
            "category": "work",
        }
    )
    assert schedule is not None
    assert schedule.end == 1440 + 8 * 60


def test_sanitize_schedule_keeps_midnight_end() -> None:
    schedule = sanitize_schedule(
        {
            "name": "写代码",
            "date": "2026-08-16",
            "start": 22 * 60,
            "end": 1440,
            "category": "work",
        }
    )
    assert schedule is not None
    assert schedule.end == 1440


def test_sanitize_schedule_caps_absurd_duration() -> None:
    schedule = sanitize_schedule(
        {
            "name": "长途任务",
            "date": "2026-08-03",
            "start": 0,
            "end": 99 * 1440,
            "category": "work",
        }
    )
    assert schedule is not None
    assert schedule.end <= 14 * 1440


def test_sanitize_schedule_keeps_link_task() -> None:
    schedule = sanitize_schedule(
        {
            "name": "截止日期修改",
            "date": "2026-08-30",
            "start": 0,
            "end": 25,
            "category": "work",
            "linkTask": " AI schedule ",
        }
    )
    assert schedule is not None
    assert schedule.linkTask == "AI schedule"


def test_sanitize_schedule_caps_link_task_length() -> None:
    schedule = sanitize_schedule(
        {
            "name": "写周报",
            "date": "2026-08-30",
            "start": 60,
            "end": 120,
            "category": "work",
            "linkTask": "A" * 60,
        }
    )
    assert schedule is not None
    assert schedule.linkTask == "A" * 40


def test_sanitize_schedule_drops_invalid_link_task() -> None:
    for raw_link in (None, 123, "   "):
        schedule = sanitize_schedule(
            {
                "name": "写周报",
                "date": "2026-08-30",
                "start": 60,
                "end": 120,
                "category": "work",
                "linkTask": raw_link,
            }
        )
        assert schedule is not None
        assert schedule.linkTask is None


def test_sanitize_schedule_defaults_link_task_to_none() -> None:
    schedule = sanitize_schedule(
        {
            "name": "健身",
            "date": "2026-08-30",
            "start": 60,
            "end": 120,
            "category": "fitness",
        }
    )
    assert schedule is not None
    assert schedule.linkTask is None


def test_merge_same_slot_schedules_carries_link_task() -> None:
    merged = merge_same_slot_schedules(
        [
            ParsedSchedule(
                name="截止日期修改",
                date="2026-08-30",
                start=0,
                end=25,
                category="work",
            ),
            ParsedSchedule(
                name="写周报",
                date="2026-08-30",
                start=0,
                end=25,
                category="work",
                linkTask="AI schedule",
            ),
        ]
    )
    assert len(merged) == 1
    assert merged[0].name == "截止日期修改 + 写周报"
    assert merged[0].linkTask == "AI schedule"


def test_merge_same_slot_schedules_keeps_first_link_task() -> None:
    merged = merge_same_slot_schedules(
        [
            ParsedSchedule(
                name="截止日期修改",
                date="2026-08-30",
                start=0,
                end=25,
                category="work",
                linkTask="AI schedule",
            ),
            ParsedSchedule(
                name="写周报",
                date="2026-08-30",
                start=0,
                end=25,
                category="work",
                linkTask="另一个任务",
            ),
        ]
    )
    assert len(merged) == 1
    assert merged[0].linkTask == "AI schedule"


def test_sanitize_schedule_accepts_done_true() -> None:
    schedule = sanitize_schedule(
        {
            "name": "跑步",
            "date": "2026-08-19",
            "start": 900,
            "end": 960,
            "category": "fitness",
            "done": True,
        }
    )
    assert schedule is not None
    assert schedule.done is True


def test_sanitize_schedule_accepts_done_string_true() -> None:
    schedule = sanitize_schedule(
        {
            "name": "跑步",
            "date": "2026-08-19",
            "start": 900,
            "end": 960,
            "category": "fitness",
            "done": "true",
        }
    )
    assert schedule is not None
    assert schedule.done is True


def test_sanitize_schedule_defaults_done_false() -> None:
    """仅 JSON true 与大小写不敏感的 "true" 字符串算完成，其余一律 False。"""
    for raw_done in (None, False, "false", "yes", 1):
        schedule = sanitize_schedule(
            {
                "name": "跑步",
                "date": "2026-08-19",
                "start": 900,
                "end": 960,
                "category": "fitness",
                "done": raw_done,
            }
        )
        assert schedule is not None
        assert schedule.done is False, raw_done


def test_sanitize_schedule_accepts_done_string_case_insensitive() -> None:
    for raw_done in ("TRUE", "True"):
        schedule = sanitize_schedule(
            {
                "name": "跑步",
                "date": "2026-08-19",
                "start": 900,
                "end": 960,
                "category": "fitness",
                "done": raw_done,
            }
        )
        assert schedule is not None
        assert schedule.done is True, raw_done


def test_sanitize_schedule_done_missing_defaults_false() -> None:
    schedule = sanitize_schedule(
        {
            "name": "跑步",
            "date": "2026-08-19",
            "start": 900,
            "end": 960,
            "category": "fitness",
        }
    )
    assert schedule is not None
    assert schedule.done is False


def test_merge_same_slot_done_takes_logical_and() -> None:
    """合并块代表全部子项：任一未完成则整体不算完成。"""

    def make(name: str, done: bool) -> ParsedSchedule:
        return ParsedSchedule(
            name=name, date="2026-08-19", start=900, end=960, category="fitness", done=done
        )

    merged = merge_same_slot_schedules([make("跑步", True), make("健身", True)])
    assert len(merged) == 1
    assert merged[0].name == "跑步 + 健身"
    assert merged[0].done is True

    merged = merge_same_slot_schedules([make("跑步", True), make("健身", False)])
    assert len(merged) == 1
    assert merged[0].done is False

    merged = merge_same_slot_schedules([make("跑步", False), make("健身", False)])
    assert len(merged) == 1
    assert merged[0].done is False
