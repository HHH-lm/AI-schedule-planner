from __future__ import annotations

import json
from argparse import Namespace
from collections import Counter
from datetime import date

from app.config import Settings
from app.eval_ai_golden import (
    _blocks_overlap,
    _fallback_empty_ai_result,
    _prompt_fingerprint,
    _write_snapshot,
    compute_metrics,
    evaluate_planning_checks,
    normalize_text,
    schedule_matches,
    score_case,
)
from app.golden_ai_cases import GOLDEN_AI_CASES, GOLDEN_SET_VERSION
from app.golden_ai_cases_heldout import HELDOUT_AI_CASES, HELDOUT_GOLDEN_SET_VERSION
from app.services.ai import build_system_prompt


def test_golden_set_has_38_cases_with_expected_distribution() -> None:
    assert len(GOLDEN_AI_CASES) == 38
    assert GOLDEN_SET_VERSION == "0.5.0"
    ids = [case["id"] for case in GOLDEN_AI_CASES]
    assert len(set(ids)) == 38
    counts = Counter(case["kind"] for case in GOLDEN_AI_CASES)
    assert counts["quickadd"] == 15
    assert counts["planning"] == 10
    assert counts["boundary"] == 6
    assert counts["constraint_memory"] == 7


def test_golden_case_structures_are_valid() -> None:
    for case in GOLDEN_AI_CASES:
        assert case["id"].startswith({"quickadd": "qa", "planning": "pl", "boundary": "b", "constraint_memory": "cm"}[case["kind"]])
        assert case["name"]
        assert case["description"]
        assert case["input"] is not None
        assert case["source"] in ("real_user", "fault_sample", "synthetic")
        assert case["added_in"] in ("0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0")
        assert case["rationale"]
        assert "text" not in case
        if case["kind"] in ("quickadd", "boundary"):
            assert case["input"] is not None
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
            assert isinstance(plan.get("existing_schedule"), list)
            for item in plan.get("existing_schedule", []):
                date.fromisoformat(item["date"])
                assert 0 <= item["start"] < item["end"] <= 14 * 1440
            assert "checks" in case


def test_heldout_set_has_expected_schema() -> None:
    assert len(HELDOUT_AI_CASES) == 6
    assert HELDOUT_GOLDEN_SET_VERSION == "0.1.0"
    for case in HELDOUT_AI_CASES:
        assert case["name"]
        assert case["description"]
        assert case["input"] is not None
        assert case["source"] in ("real_user", "fault_sample", "synthetic")
        assert case["added_in"] == "0.1.0"
        assert case["rationale"]
        assert "text" not in case
        assert case["id"].startswith(
            {"quickadd": "hqa", "planning": "hpl", "boundary": "hb", "constraint_memory": "hcm"}[case["kind"]]
        )


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
    assert result["correct"] == 7


def test_schedule_matches_link_task_field() -> None:
    base = {
        "name": "截止日期修改",
        "date": "2026-08-16",
        "start": 0,
        "end": 25,
        "category": "work",
        "location": None,
    }
    # 双方均无 linkTask：第 7 字段默认成立
    result = schedule_matches(dict(base), dict(base))
    assert result["correct"] == 7
    assert result["full"] is True
    # 期望 linkTask 而实际一致
    with_link = {**base, "linkTask": "AI schedule"}
    assert schedule_matches(dict(with_link), with_link)["full"] is True
    # 实际缺失 linkTask：第 7 字段失分但不影响 time
    result = schedule_matches(dict(base), with_link)
    assert result["correct"] == 6
    assert result["full"] is False
    assert result["time"] is True
    # 实际多出 linkTask 而期望没有：同样失分
    result = schedule_matches(dict(with_link), base)
    assert result["correct"] == 6
    assert result["full"] is False


def test_fallback_empty_ai_result_uses_local_rules() -> None:
    from app.schemas import ParsedSchedule

    schedules, rejected, message, used_fallback = _fallback_empty_ai_result(
        "!!!###", "2026-08-16", [], None, None
    )
    assert schedules == []
    assert rejected is not None
    assert rejected.code == "garbage"
    assert "本地规则" in (message or "")
    assert used_fallback is True

    kept = [
        ParsedSchedule(
            name="写代码", date="2026-08-16", start=540, end=600, category="work"
        )
    ]
    schedules2, rejected2, message2, used_fallback2 = _fallback_empty_ai_result(
        "周三写代码", "2026-08-16", kept, None, "原始消息"
    )
    assert schedules2 == kept
    assert rejected2 is None
    assert message2 == "原始消息"
    assert used_fallback2 is False


def test_fallback_used_result_passes_boundary_gate() -> None:
    results = []
    for case in GOLDEN_AI_CASES:
        if case["kind"] in ("quickadd", "boundary"):
            if case.get("expect_reject"):
                result = score_case(case, [], {"code": case["expect_reject"], "message": "x"})
            else:
                result = score_case(case, case["expect_schedules"], None)
            result["kind"] = case["kind"]
            result["ai_error"] = False
            result["fallback_used"] = case["id"] == "b02"
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
    assert metrics["ai_error_cases"] == 0
    assert metrics["kind_rates"]["boundary_exact"] == "6/6"
    assert metrics["reject_accuracy"] == 1.0


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


def test_planning_existing_schedule_maps_to_request_schema() -> None:
    from app.schemas import PlanV2Request

    case = next(item for item in GOLDEN_AI_CASES if item["id"] == "pl04")
    payload = dict(case["planning"])
    payload["planning_range"] = {
        "start": payload.pop("range_start"),
        "end": payload.pop("range_end"),
    }
    request = PlanV2Request(**payload)
    assert request.existing_schedule


def test_eval_conflict_check_detects_cross_day_overlap() -> None:
    from app.schemas import ExistingBlock

    blocks = [{"date": "2026-08-16", "start": 1320, "end": 1560}]
    existing = [ExistingBlock(date="2026-08-17", start=60, end=120)]
    assert _blocks_overlap(blocks, existing) is True


def _block(title: str, start: int, end: int, priority: str = "medium") -> dict[str, object]:
    return {
        "title": title,
        "date": "2026-08-17",
        "start": start,
        "end": end,
        "category": "work",
        "priority": priority,
    }


def test_end_before_requires_full_block_before_threshold() -> None:
    case = next(item for item in GOLDEN_AI_CASES if item["id"] == "cm02")
    overlap = [_block("写周报", 870, 930)]
    complete = [_block("写周报", 840, 900)]
    assert evaluate_planning_checks(case, overlap, [])["end_before"] is False
    assert evaluate_planning_checks(case, complete, [])["end_before"] is True


def test_priority_order_matches_titles_not_positions() -> None:
    case = {
        "planning": {
            "tasks": [
                {"title": "高优先级任务", "duration": 60, "priority": "high"},
                {"title": "低优先级任务", "duration": 60, "priority": "low"},
            ],
            "existing_schedule": [],
            "range_start": "2026-08-17",
            "range_end": "2026-08-17",
        },
        "checks": {"priority_order": True},
    }
    low_first = [
        _block("低优先级任务", 540, 600, priority="low"),
        _block("高优先级任务", 600, 660, priority="high"),
    ]
    high_first = [
        _block("高优先级任务", 540, 600, priority="high"),
        _block("低优先级任务", 600, 660, priority="low"),
    ]
    assert evaluate_planning_checks(case, low_first, [])["priority_order"] is False
    assert evaluate_planning_checks(case, high_first, [])["priority_order"] is True


def test_morning_requires_complete_morning() -> None:
    case = next(item for item in GOLDEN_AI_CASES if item["id"] == "pl07")
    overlap_noon = [_block("写文章", 690, 750)]
    full_morning = [_block("写文章", 660, 720)]
    assert evaluate_planning_checks(case, overlap_noon, [])["morning"] is False
    assert evaluate_planning_checks(case, full_morning, [])["morning"] is True


def test_no_evening_rejects_block_overlapping_evening() -> None:
    case = next(item for item in GOLDEN_AI_CASES if item["id"] == "cm01")
    overlap_evening = [_block("写报告", 1050, 1110)]
    before_evening = [_block("写报告", 1020, 1080)]
    assert evaluate_planning_checks(case, overlap_evening, [])["no_evening"] is False
    assert evaluate_planning_checks(case, before_evening, [])["no_evening"] is True


def test_prompt_fingerprint_and_snapshot_persist(tmp_path) -> None:
    assert len(_prompt_fingerprint()) == 12
    path = _write_snapshot(
        Namespace(snapshot_dir=str(tmp_path)),
        "deepseek",
        {"full": 0.8},
        {"passed": True},
        [{"id": "qa01", "full_exact": True}],
        Settings(),
        "open",
    )
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["split"] == "open"
    assert data["provider"] == "deepseek"
    assert data["model"] == "deepseek-chat"
    assert data["golden_set_version"] == GOLDEN_SET_VERSION
    assert data["prompt_version"].startswith("sha256:")
    assert data["results"] == [{"id": "qa01", "full_exact": True}]


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
    assert metrics["total_cases"] == 38
    assert metrics["case_full_rate"] == 1.0


def test_system_prompt_contains_quality_rules() -> None:
    prompt = build_system_prompt("2026-08-16")
    assert "（周日）" in prompt
    assert "end = start + 60" in prompt
    assert "下一个同名星期" in prompt
    assert "missing_action" in prompt
    assert "本周日期映射" in prompt
    assert "投简历" in prompt
    assert "关联指令" in prompt
    assert "linkTask" in prompt
