"""AI Memory Analysis 服务测试：回溯窗口过滤。"""

from app.schemas import TimeBlockInput
from app.services.memory_analysis import run_analysis


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
