"""记忆分析确定性 golden 用例：纯统计引擎（无 LLM），固定输入断言输出。

覆盖三个分析器触发条件、最小样本量边界（<5 / 5-9 / 10+）、置信度曲线、
提示文案三态与窗口过滤对样本量的影响。与 test_memory_analysis.py 的
窗口过滤/时段评判用例互补，不重复。
"""

from __future__ import annotations

from app.schemas import TimeBlockInput
from app.services.memory_analysis import (
    _confidence_from_samples,
    build_analysis_message,
    run_analysis,
)

TODAY = "2026-08-21"  # 周五；14 天窗口 = [2026-08-08, 2026-08-21]


def _block(
    i: int,
    block_date: str,
    *,
    category: str = "life",
    start: int = 9 * 60,
    end: int = 10 * 60,
    done: bool = True,
) -> TimeBlockInput:
    return TimeBlockInput(
        id=f"b{i}",
        name="事项",
        date=block_date,
        start=start,
        end=end,
        category=category,
        done=done,
    )


def _time_preference_blocks() -> list[TimeBlockInput]:
    """上午 10 块全完成 vs 下午 6 块完成 5 块：上午应胜出。"""
    return (
        [_block(i, "2026-08-11", start=9 * 60, end=10 * 60, done=True) for i in range(10)]
        + [_block(10 + i, "2026-08-12", start=14 * 60, end=15 * 60, done=i < 5) for i in range(6)]
    )


def test_time_preference_suggestion_via_run_analysis() -> None:
    suggestions, stats = run_analysis(_time_preference_blocks(), today=TODAY)
    assert stats["suggestions_generated"] == 1
    suggestion = suggestions[0]
    assert suggestion.category == "time-preference"
    assert "上午" in suggestion.conclusion
    assert suggestion.confidence == 0.70  # 10 块 = 正常置信度起点


def test_habit_weekday_concentration() -> None:
    # 两个周一各 3 块运动（7:00-8:00）：全部集中周一且 ≥5 条
    blocks = [
        _block(i, "2026-08-10" if i < 3 else "2026-08-17", category="fitness", start=7 * 60, end=8 * 60)
        for i in range(6)
    ]
    suggestions, stats = run_analysis(blocks, today=TODAY)
    assert stats["suggestions_generated"] == 1
    assert suggestions[0].category == "habit"
    assert "周一" in suggestions[0].content
    assert suggestions[0].confidence == 0.54  # 6 条样本 = 低置信度区间


def test_below_min_samples_generates_nothing() -> None:
    blocks = [
        _block(i, "2026-08-10", category="fitness", start=7 * 60, end=8 * 60) for i in range(4)
    ]
    suggestions, stats = run_analysis(blocks, today=TODAY)
    assert suggestions == []
    message = build_analysis_message(suggestions, stats)
    assert "时间块数据不足" in message
    assert "4 条" in message


def test_work_heavy_balance_suggestions() -> None:
    blocks = [
        _block(i, f"2026-08-1{1 + i}", category="work", start=9 * 60, end=10 * 60)
        for i in range(6)
    ]
    suggestions, stats = run_analysis(blocks, today=TODAY)
    assert stats["suggestions_generated"] == 2
    assert all(s.category == "life-preference" for s in suggestions)
    joined = "\n".join(s.content for s in suggestions)
    assert "工作占比偏高" in joined
    assert "学习时间占比较低" in joined
    assert all(s.confidence == 0.54 for s in suggestions)  # 6 条样本


def test_balance_skipped_below_total_duration() -> None:
    # 5 块 × 50 分钟 = 250 分钟 < 300 分钟下限：不触发工作/学习平衡分析
    blocks = [
        _block(i, "2026-08-11", category="work", start=9 * 60, end=9 * 60 + 50)
        for i in range(5)
    ]
    suggestions, stats = run_analysis(blocks, today=TODAY)
    assert suggestions == []
    message = build_analysis_message(suggestions, stats)
    assert "未发现明显规律" in message


def test_no_clear_period_lead_no_suggestion() -> None:
    # 上午/下午各 6 块全完成：领先不足 25%，不生成时段建议
    blocks = (
        [_block(i, "2026-08-11", start=9 * 60, end=10 * 60) for i in range(6)]
        + [_block(6 + i, "2026-08-12", start=14 * 60, end=15 * 60) for i in range(6)]
    )
    suggestions, stats = run_analysis(blocks, today=TODAY)
    assert suggestions == []
    message = build_analysis_message(suggestions, stats)
    assert "12 条时间块" in message
    assert "未发现明显规律" in message


def test_message_no_data() -> None:
    suggestions, stats = run_analysis([], today=TODAY)
    assert stats["total_blocks"] == 0
    assert build_analysis_message(suggestions, stats).startswith("还没有时间块数据")


def test_message_none_when_suggestions_generated() -> None:
    suggestions, stats = run_analysis(_time_preference_blocks(), today=TODAY)
    assert suggestions
    assert build_analysis_message(suggestions, stats) is None


def test_confidence_curve_boundaries() -> None:
    assert _confidence_from_samples(0) == 0.0
    assert _confidence_from_samples(4) == 0.0
    assert _confidence_from_samples(5) == 0.50
    assert _confidence_from_samples(7) == 0.58
    assert _confidence_from_samples(9) == 0.66
    assert _confidence_from_samples(10) == 0.70
    assert _confidence_from_samples(16) == 0.85
    assert _confidence_from_samples(20) == 0.95
    assert _confidence_from_samples(30) == 0.95  # 封顶


def test_window_exclusion_does_not_count_toward_samples() -> None:
    # 窗口外 6 块 + 窗口内 4 块：样本量按窗口内 4 条计，不生成习惯建议
    blocks = [
        _block(i, "2026-06-01", category="fitness", start=7 * 60, end=8 * 60)
        for i in range(6)
    ] + [
        _block(6 + i, "2026-08-15", category="fitness", start=7 * 60, end=8 * 60)
        for i in range(4)
    ]
    suggestions, stats = run_analysis(blocks, today=TODAY)
    assert stats["total_blocks"] == 4
    assert suggestions == []


def test_stats_shape_and_window_fields() -> None:
    _, stats = run_analysis(_time_preference_blocks(), today=TODAY)
    assert stats["analysis_horizon_days"] == 14  # 默认回溯窗口
    assert stats["window_start"] == "2026-08-08"
    assert stats["window_end"] == "2026-08-21"
    assert stats["periods"] == {"上午": 10, "下午": 6}
    assert stats["categories"] == {"life": 16}
    assert stats["completion_rate"] == round(15 / 16, 2)
