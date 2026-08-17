from __future__ import annotations

from collections import Counter
from datetime import date

from app.eval_ai_golden import (
    compute_metrics,
    evaluate_planning_checks,
    normalize_text,
    schedule_matches,
    score_case,
)
from app.golden_ai_cases import GOLDEN_AI_CASES
from app.services.ai import build_system_prompt


def test_golden_set_has_33_cases_with_expected_distribution() -> None:
    assert len(GOLDEN_AI_CASES) == 33
    ids = [case["id"] for case in GOLDEN_AI_CASES]
    assert len(set(ids)) == 33
    counts = Counter(case["kind"] for case in GOLDEN_AI_CASES)
    assert counts["quickadd"] == 12
    assert counts["planning"] == 10
    assert counts["boundary"] == 6
    assert counts["constraint_memory"] == 5


def test_golden_case_structures_are_valid() -> None:
    for case in GOLDEN_AI_CASES:
        assert case["id"].startswith({"quickadd": "qa", "planning": "pl", "boundary": "b", "constraint_memory": "cm"}[case["kind"]])
        if case["kind"] in ("quickadd", "boundary"):
            assert case["text"] is not None
            date.fromisoformat(case["today"])
            if case.get("expect_reject"):
                assert not case.get("expect_schedules")
            else:
                schedules = case["expect_schedules"]
                assert schedules
                for item in schedules:
                    date.fromisoformat(item["date"])
                    assert 0 <= item["start"] < item["end"] <= 14 * 1440
                    assert item["category"] in ("work", "study", "fitness", "life", "rest")
        else:
            plan = case["planning"]
            assert plan["tasks"]
            date.fromisoformat(plan["range_start"])
            date.fromisoformat(plan["range_end"])
            assert "checks" in case


def test_normalize_text_strips_whitespace_and_punctuation() -> None:
    assert normalize_text(" 做瑜伽 ") == "做瑜伽"
    assert normalize_text("写代码，") == "写代码"


def test_schedule_matches_perfect() -> None:
    expected = {
        "name": "跑步",
        "date": "2026-08-19",
        "start": 900,
        "end": 960,
        "category": "fitness",
        "location": "世纪公园",
    }
    result = schedule_matches(dict(expected), expected)
    assert result["full"] is True
    assert result["time"] is True
    assert result["correct"] == 6


def test_score_case_perfect_parse_and_reject() -> None:
    parse_case = next(case for case in GOLDEN_AI_CASES if case["id"] == "qa01")
    result = score_case(parse_case, [parse_case["expect_schedules"][0]], None)
    assert result["full_exact"] is True
    assert result["time_exact"] is True
    assert result["schedule_full_count"] == 1

    reject_case = next(case for case in GOLDEN_AI_CASES if case["id"] == "b02")
    result = score_case(reject_case, [], {"code": "garbage", "message": "无有效安排"})
    assert result["reject_ok"] is True
    assert result["full_exact"] is True


def test_evaluate_planning_checks_perfect() -> None:
    case = next(item for item in GOLDEN_AI_CASES if item["id"] == "pl01")
    blocks = [
        {
            "title": "写周报",
            "date": "2026-08-17",
            "start": 540,
            "end": 600,
            "category": "work",
            "priority": "medium",
        }
    ]
    checks = evaluate_planning_checks(case, blocks, [])
    assert all(checks.values())


def test_compute_metrics_passes_with_perfect_results() -> None:
    results = []
    for case in GOLDEN_AI_CASES:
        if case["kind"] in ("quickadd", "boundary"):
            if case.get("expect_reject"):
                result = score_case(case, [], {"code": case["expect_reject"], "message": "x"})
            else:
                result = score_case(case, case["expect_schedules"], None)
            result["kind"] = case["kind"]
        else:
            result = {
                "id": case["id"],
                "kind": case["kind"],
                "full_exact": True,
                "ai_error": False,
                "check_passed": 1,
                "check_total": 1,
            }
        results.append(result)

    thresholds = {
        "full": 0.80,
        "quickadd": 0.90,
        "planning": 0.90,
        "boundary": 1.00,
        "cm": 0.80,
        "field": 0.90,
        "reject": 1.00,
        "check": 0.90,
    }
    metrics = compute_metrics(results, GOLDEN_AI_CASES, thresholds)
    assert metrics["passed"] is True
    assert metrics["total_cases"] == 33
    assert metrics["case_full_rate"] == 1.0


def test_system_prompt_contains_quality_rules() -> None:
    prompt = build_system_prompt("2026-08-16")
    assert "（周日）" in prompt
    assert "end=start+60" in prompt
    assert "绝不可选已经过去" in prompt
    assert "missing_action" in prompt
    assert "本周日期映射" in prompt
