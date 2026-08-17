from __future__ import annotations

from app.services.ai import sanitize_schedule


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
