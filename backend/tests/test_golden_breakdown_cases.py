"""Breakdown golden set 结构不变式与 record-only 评分逻辑测试（不触网）。"""

from __future__ import annotations

from argparse import Namespace

from app.eval_ai_golden import (
    _breakdown_prompt_fingerprint,
    build_parser,
    compute_breakdown_metrics,
    score_breakdown_case,
)
from app.golden_breakdown_cases import BREAKDOWN_GOLDEN_CASES, BREAKDOWN_GOLDEN_VERSION
from app.schemas import BreakdownResponse, BreakdownTask


def test_breakdown_set_has_10_cases_with_valid_structure() -> None:
    assert len(BREAKDOWN_GOLDEN_CASES) == 10
    assert BREAKDOWN_GOLDEN_VERSION == "0.1.0"
    ids = [case["id"] for case in BREAKDOWN_GOLDEN_CASES]
    assert len(set(ids)) == 10
    for case in BREAKDOWN_GOLDEN_CASES:
        assert case["id"].startswith("bd")
        assert case["kind"] == "breakdown"
        assert case["name"]
        assert case["description"]
        assert case["source"] in ("real_user", "fault_sample", "synthetic")
        assert case["added_in"] == "0.1.0"
        assert case["rationale"]
        assert case["input"] == case["plan"]
        assert isinstance(case["plan"], str)
        assert len(case["plan"]) <= 4000  # BreakdownRequest.plan max_length
        from datetime import date

        date.fromisoformat(case["today"])


def test_breakdown_case_distribution() -> None:
    error_cases = [case for case in BREAKDOWN_GOLDEN_CASES if case.get("expect_error")]
    normal_cases = [case for case in BREAKDOWN_GOLDEN_CASES if not case.get("expect_error")]
    assert len(error_cases) == 3  # 空输入 + 闲聊 + 纯数字
    assert len(normal_cases) == 7
    empty_plan = next(case for case in error_cases if case["id"] == "bd06")
    assert empty_plan["plan"] == ""


def _normal_case() -> dict:
    return next(case for case in BREAKDOWN_GOLDEN_CASES if case["id"] == "bd01")


def test_score_breakdown_case_perfect() -> None:
    response = BreakdownResponse(
        source="deepseek",
        tasks=[
            BreakdownTask(name="完成毕业论文", subtasks=["文献调研", "撰写开题报告"]),
            BreakdownTask(name="与导师沟通", subtasks=[]),
        ],
    )
    result = score_breakdown_case(_normal_case(), response)
    assert result["full_exact"] is True
    assert result["ai_error"] is False
    assert result["check_total"] == 4
    assert result["kind"] == "breakdown"
    assert result["actual"][0]["name"] == "完成毕业论文"


def test_score_breakdown_case_violates_task_count_and_subtask_count() -> None:
    too_many_tasks = BreakdownResponse(
        source="deepseek",
        tasks=[BreakdownTask(name=f"任务{i}") for i in range(4)],
    )
    result = score_breakdown_case(_normal_case(), too_many_tasks)
    assert result["check_results"]["task_count_1_3"] is False
    assert result["check_results"]["subtasks_0_5"] is True
    assert result["full_exact"] is False

    too_many_subtasks = BreakdownResponse(
        source="deepseek",
        tasks=[BreakdownTask(name="准备产品发布", subtasks=[f"步骤{i}" for i in range(6)])],
    )
    result = score_breakdown_case(_normal_case(), too_many_subtasks)
    assert result["check_results"]["task_count_1_3"] is True
    assert result["check_results"]["subtasks_0_5"] is False


def test_score_breakdown_case_error_contract() -> None:
    case = next(c for c in BREAKDOWN_GOLDEN_CASES if c["id"] == "bd07")
    ok = BreakdownResponse(
        source="none", tasks=[], message="AI 拆解失败：未识别到有效项目计划，请输入项目计划内容"
    )
    result = score_breakdown_case(case, ok)
    assert result["full_exact"] is True
    assert result["ai_error"] is False  # 错误路径是预期契约，不计 AI 错误

    violated = BreakdownResponse(
        source="deepseek", tasks=[BreakdownTask(name="闲聊任务")]
    )
    result = score_breakdown_case(case, violated)
    assert result["full_exact"] is False
    assert result["check_results"]["error_contract"] is False


def test_score_breakdown_case_ai_error_marked_for_normal_case() -> None:
    timeout = BreakdownResponse(source="none", tasks=[], message="AI 拆解超时（15 秒），请稍后重试")
    result = score_breakdown_case(_normal_case(), timeout)
    assert result["ai_error"] is True
    assert result["check_results"]["source_ai"] is False
    assert result["full_exact"] is False


def test_compute_breakdown_metrics_is_record_only() -> None:
    response = BreakdownResponse(
        source="deepseek", tasks=[BreakdownTask(name="任务", subtasks=["步骤"])]
    )
    results = [
        score_breakdown_case(_normal_case(), response),
        score_breakdown_case(_normal_case(), response),
    ]
    metrics = compute_breakdown_metrics(results)
    assert metrics["record_only"] is True
    assert metrics["passed"] is True  # record-only 恒通过，不设门禁
    assert metrics["total_cases"] == 2
    assert metrics["check_total"] == 8
    assert metrics["check_accuracy"] == 1.0
    assert metrics["ai_error_cases"] == 0


def test_breakdown_prompt_fingerprint_is_stable_hash() -> None:
    assert len(_breakdown_prompt_fingerprint()) == 12
    assert _breakdown_prompt_fingerprint() == _breakdown_prompt_fingerprint()


def test_parser_accepts_breakdown_split() -> None:
    args = build_parser().parse_args(["--provider", "deepseek", "--split", "breakdown"])
    assert args.split == "breakdown"


def test_breakdown_snapshot_writer_uses_own_version(tmp_path) -> None:
    from app.eval_ai_golden import _write_breakdown_snapshot
    from app.config import Settings

    path = _write_breakdown_snapshot(
        Namespace(snapshot_dir=str(tmp_path)),
        "deepseek",
        {"record_only": True, "passed": True},
        [{"id": "bd01", "full_exact": True}],
        Settings(),
    )
    import json

    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["golden_set_version"] == BREAKDOWN_GOLDEN_VERSION
    assert data["split"] == "breakdown"
    assert data["record_only"] is True
    assert data["thresholds"] is None
    assert data["prompt_version"].startswith("sha256:")
    assert "breakdown" in path.name
