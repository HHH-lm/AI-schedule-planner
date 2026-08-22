"""AI Memory Analysis 服务测试：回溯窗口过滤。"""

from app.schemas import TimeBlockInput
from app.services.memory_analysis import analyze_completion_by_period, run_analysis


def _block(i: int, block_date: str, category: str = "fitness") -> TimeBlockInput:
    return TimeBlockInput(
        id=f"b{i}",
        name="运动",
        date=block_date,
        start=7 * 60,
        end=8 * 60,
        category=category,
        done=True,
    )


def _work_block(
    i: int,
    block_date: str,
    start: int,
    end: int,
    done: bool,
) -> TimeBlockInput:
    return TimeBlockInput(
        id=f"w{i}",
        name="写代码",
        date=block_date,
        start=start,
        end=end,
        category="work",
        done=done,
    )


def test_run_analysis_filters_blocks_outside_window() -> None:
    """窗口外的旧时间块不参与统计。"""
    blocks = [_block(i, "2026-08-10") for i in range(6)] + [
        _block(i, "2026-06-01") for i in range(6, 12)
    ]
    _, stats = run_analysis(blocks, analysis_horizon_days=14, today="2026-08-10")
    assert stats["total_blocks"] == 6
    assert stats["analysis_horizon_days"] == 14
    assert stats["window_start"] == "2026-07-28"
    assert stats["window_end"] == "2026-08-10"


def test_run_analysis_window_boundary() -> None:
    """窗口首尾日期包含在内，窗口外与未来时间块被排除。"""
    blocks = [
        _block(0, "2026-07-28"),
        _block(1, "2026-07-27"),
        _block(2, "2026-08-10"),
        _block(3, "2026-08-11"),
    ]
    _, stats = run_analysis(blocks, analysis_horizon_days=14, today="2026-08-10")
    assert stats["total_blocks"] == 2


def test_run_analysis_default_horizon() -> None:
    """未传回溯天数时默认使用 14 天窗口。"""
    blocks = [_block(i, "2026-08-10") for i in range(6)] + [
        _block(i, "2026-07-01") for i in range(6, 12)
    ]
    _, stats = run_analysis(blocks, today="2026-08-10")
    assert stats["total_blocks"] == 6
    assert stats["analysis_horizon_days"] == 14


def test_focus_period_combines_volume_and_completion() -> None:
    """数量多且完成率高的时段胜出，即使完成率不是最高（用户场景）。"""
    blocks = (
        [_work_block(i, "2026-08-20", 9 * 60, 10 * 60, True) for i in range(4)]
        + [_work_block(i, "2026-08-20", 14 * 60, 15 * 60, True) for i in range(7)]
        + [_work_block(i, "2026-08-20", 20 * 60, 21 * 60, True) for i in range(29)]
        + [_work_block(i, "2026-08-21", 20 * 60, 21 * 60, False) for i in range(2)]
    )
    suggestions = analyze_completion_by_period(blocks)
    assert len(suggestions) == 1
    assert "晚上" in suggestions[0].content
    assert "31个时间块" in suggestions[0].content


def test_focus_period_excludes_low_completion_volume() -> None:
    """数量虽多但完成率过低（<60%）的时段不生成建议。"""
    blocks = (
        [_work_block(i, "2026-08-20", 9 * 60, 10 * 60, True) for i in range(6)]
        + [_work_block(i, "2026-08-20", 20 * 60, 21 * 60, True) for i in range(10)]
        + [_work_block(i, "2026-08-21", 20 * 60, 21 * 60, False) for i in range(10)]
    )
    suggestions = analyze_completion_by_period(blocks)
    assert suggestions == []


def test_focus_period_requires_clear_lead() -> None:
    """综合得分未明显领先（<25%）时不生成建议。"""
    blocks = (
        [_work_block(i, "2026-08-20", 9 * 60, 10 * 60, True) for i in range(10)]
        + [_work_block(i, "2026-08-20", 14 * 60, 15 * 60, True) for i in range(9)]
    )
    suggestions = analyze_completion_by_period(blocks)
    assert suggestions == []


def test_focus_period_lead_boundary() -> None:
    """综合得分领先恰好 25% 时生成建议。"""
    blocks = (
        [_work_block(i, "2026-08-20", 9 * 60, 10 * 60, True) for i in range(20)]
        + [_work_block(i, "2026-08-20", 14 * 60, 15 * 60, True) for i in range(16)]
    )
    suggestions = analyze_completion_by_period(blocks)
    assert len(suggestions) == 1
    assert "上午" in suggestions[0].content
