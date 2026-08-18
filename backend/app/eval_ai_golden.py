"""AI 解析与规划 golden set 评测：质量度量与 prompt/模型回归防退化。

用法（backend 目录下）：
    .venv/bin/python -m app.eval_ai_golden --provider deepseek
"""

from __future__ import annotations

import argparse
import asyncio
import itertools
import json
import re
from collections import defaultdict
from datetime import date as date_cls
from typing import Any

from app.config import get_settings
from app.golden_ai_cases import GOLDEN_AI_CASES
from app.schemas import ExistingBlock, PlanV2Request
from app.services.ai import parse_with_ai, resolve_ai_provider
from app.services.planner_v2 import plan_v2_schedule


FIELDS = ("name", "date", "start", "end", "category", "location")
_NORMALIZE_RE = re.compile(r"[\s，。；;、,.!！?？:：]+")


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return _NORMALIZE_RE.sub("", value.strip())


def schedule_matches(actual: dict[str, Any], expected: dict[str, Any]) -> dict[str, Any]:
    name_ok = normalize_text(actual.get("name")) == normalize_text(expected["name"])
    date_ok = actual.get("date") == expected["date"]
    start_ok = actual.get("start") == expected["start"]
    end_ok = actual.get("end") == expected["end"]
    category_ok = actual.get("category") == expected["category"]
    location_ok = normalize_text(actual.get("location")) == normalize_text(expected.get("location"))
    return {
        "full": name_ok and date_ok and start_ok and end_ok and category_ok and location_ok,
        "time": date_ok and start_ok and end_ok,
        "correct": sum((name_ok, date_ok, start_ok, end_ok, category_ok, location_ok)),
    }


def _assignment_score(mapping: list[dict[str, Any]]) -> tuple[int, int, int]:
    return (
        sum(1 for item in mapping if item["full"]),
        sum(1 for item in mapping if item["time"]),
        sum(item["correct"] for item in mapping),
    )


def best_mapping(
    expected: list[dict[str, Any]], actual: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    if not expected:
        return []
    best: tuple[tuple[int, int, int], list[dict[str, Any]]] | None = None
    if len(actual) >= len(expected):
        for perm in itertools.permutations(range(len(actual)), len(expected)):
            mapping = []
            for expected_idx, actual_idx in enumerate(perm):
                mapping.append(
                    {
                        **schedule_matches(actual[actual_idx], expected[expected_idx]),
                        "expected_idx": expected_idx,
                        "actual_idx": actual_idx,
                    }
                )
            score = _assignment_score(mapping)
            if best is None or score > best[0]:
                best = (score, mapping)
    else:
        for perm in itertools.permutations(range(len(expected)), len(actual)):
            mapping = []
            matched_expected = set(perm)
            for actual_idx, expected_idx in enumerate(perm):
                mapping.append(
                    {
                        **schedule_matches(actual[actual_idx], expected[expected_idx]),
                        "expected_idx": expected_idx,
                        "actual_idx": actual_idx,
                    }
                )
            for expected_idx in range(len(expected)):
                if expected_idx not in matched_expected:
                    mapping.append(
                        {
                            "full": False,
                            "time": False,
                            "correct": 0,
                            "expected_idx": expected_idx,
                            "actual_idx": None,
                        }
                    )
            score = _assignment_score(mapping)
            if best is None or score > best[0]:
                best = (score, mapping)
    return best[1] if best else []


def _reject_code(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, dict):
        return value.get("code")
    return getattr(value, "code", None)


def score_case(
    case: dict[str, Any],
    actual_schedules: list[dict[str, Any]],
    actual_rejected: Any,
) -> dict[str, Any]:
    expected_schedules = case.get("expect_schedules", [])
    expected_reject = case.get("expect_reject")
    if expected_reject:
        reject_ok = _reject_code(actual_rejected) == expected_reject and len(actual_schedules) == 0
        return {
            "id": case["id"],
            "text": case["text"],
            "expect_reject": expected_reject,
            "actual_reject": _reject_code(actual_rejected),
            "reject_ok": reject_ok,
            "full_exact": reject_ok,
            "time_exact": reject_ok,
            "correct_fields": 0,
            "field_total": 0,
            "schedule_full_count": 0,
            "schedule_time_count": 0,
            "expected_count": 0,
            "actual_count": len(actual_schedules),
            "ai_error": False,
        }

    mapping = best_mapping(expected_schedules, actual_schedules)
    full_exact = len(actual_schedules) == len(expected_schedules) and bool(mapping) and all(
        item["full"] for item in mapping
    )
    time_exact = len(actual_schedules) == len(expected_schedules) and bool(mapping) and all(
        item["time"] for item in mapping
    )
    return {
        "id": case["id"],
        "text": case["text"],
        "expect_reject": None,
        "actual_reject": _reject_code(actual_rejected),
        "reject_ok": False,
        "full_exact": full_exact,
        "time_exact": time_exact,
        "correct_fields": sum(item["correct"] for item in mapping),
        "field_total": 6 * len(expected_schedules),
        "schedule_full_count": sum(1 for item in mapping if item["full"]),
        "schedule_time_count": sum(1 for item in mapping if item["time"]),
        "expected_count": len(expected_schedules),
        "actual_count": len(actual_schedules),
        "ai_error": False,
    }


def _blocks_overlap(blocks: list[dict[str, Any]], existing: list[ExistingBlock]) -> bool:
    spans = [(block["date"], block["start"], block["end"]) for block in blocks]
    spans += [(item.date, item.start, item.end) for item in existing]
    spans.sort()
    for index in range(1, len(spans)):
        if spans[index][0] == spans[index - 1][0] and spans[index][1] < spans[index - 1][2]:
            return True
    return False


def evaluate_planning_checks(
    case: dict[str, Any],
    blocks: list[dict[str, Any]],
    unassigned: list[str],
) -> dict[str, Any]:
    plan = case["planning"]
    checks = case.get("checks", {})
    tasks = plan["tasks"]
    task_by_title = {task["title"]: task for task in tasks}
    range_start = date_cls.fromisoformat(plan["range_start"])
    range_end = date_cls.fromisoformat(plan["range_end"])
    existing = [ExistingBlock(**item) for item in plan.get("existing", [])]

    task_titles = {task["title"] for task in tasks}
    results: dict[str, Any] = {
        # 分块任务会产生多个块，"全部安排"按任务是否至少有一个块判断
        "all_scheduled": not unassigned
        and all(any(block["title"] == title for block in blocks) for title in task_titles),
        "within_range": all(
            range_start <= date_cls.fromisoformat(block["date"]) <= range_end for block in blocks
        ),
        # 分块任务各块时长之和等于任务时长
        "durations": all(
            sum(
                block["end"] - block["start"]
                for block in blocks
                if block["title"] == title
            )
            == task_by_title[title]["duration"]
            for title in task_titles
        ),
        "no_conflicts": not _blocks_overlap(blocks, existing),
    }

    expected_categories = checks.get("expected_categories") or {}
    if expected_categories:
        results["expected_categories"] = all(
            block["category"] == expected_categories.get(block["title"]) for block in blocks
        )

    if "start_after" in checks:
        results["start_after"] = bool(blocks) and all(block["start"] >= checks["start_after"] for block in blocks)
    if "start_before" in checks:
        results["start_before"] = bool(blocks) and all(block["start"] < checks["start_before"] for block in blocks)
    if checks.get("no_evening"):
        results["no_evening"] = bool(blocks) and all(block["start"] < 18 * 60 for block in blocks)
    if "no_weekday" in checks:
        results["no_weekday"] = all(
            date_cls.fromisoformat(block["date"]).weekday() != checks["no_weekday"] for block in blocks
        )
    if checks.get("morning"):
        results["morning"] = bool(blocks) and all(block["start"] < 12 * 60 for block in blocks)
    if checks.get("evening"):
        results["evening"] = bool(blocks) and all(block["start"] >= 18 * 60 for block in blocks)
    if "no_weekday_evening" in checks:
        weekday = checks["no_weekday_evening"]
        results["no_weekday_evening"] = all(
            not (date_cls.fromisoformat(block["date"]).weekday() == weekday and block["start"] >= 18 * 60)
            for block in blocks
        )
    if "work_chunk_minutes" in checks:
        max_chunk = checks["work_chunk_minutes"]
        work_blocks = [block for block in blocks if block["title"] in task_titles]
        results["work_chunk_minutes"] = bool(work_blocks) and all(
            block["end"] - block["start"] <= max_chunk for block in work_blocks
        )
    if "min_chunk_gap" in checks:
        min_gap = checks["min_chunk_gap"]
        gap_ok = True
        for title in task_titles:
            task_blocks = sorted(
                (block for block in blocks if block["title"] == title),
                key=lambda block: block["start"],
            )
            for prev, nxt in zip(task_blocks, task_blocks[1:]):
                if nxt["start"] - prev["end"] < min_gap:
                    gap_ok = False
        results["min_chunk_gap"] = gap_ok
    if "deadline_before" in checks:
        deadline = date_cls.fromisoformat(checks["deadline_before"])
        results["deadline_before"] = all(
            date_cls.fromisoformat(block["date"]) <= deadline for block in blocks
        )
    if checks.get("priority_order"):
        results["priority_order"] = (
            len(blocks) >= 2 and blocks[0]["priority"] == "high" and blocks[1]["priority"] == "low"
        )
    return results


def score_planning_case(
    case: dict[str, Any],
    response: Any,
) -> dict[str, Any]:
    blocks = [block.model_dump() for block in response.blocks]
    unassigned = list(response.unassigned)
    check_results = evaluate_planning_checks(case, blocks, unassigned)
    return {
        "id": case["id"],
        "text": case.get("text", case["id"]),
        "full_exact": all(check_results.values()),
        "check_results": check_results,
        "check_total": len(check_results),
        "check_passed": sum(1 for value in check_results.values() if value),
        "actual_count": len(blocks),
        "unassigned": unassigned,
        "source": response.source,
        "message": response.message,
        "ai_error": response.source not in ("openai", "deepseek"),
    }


def compute_metrics(
    results: list[dict[str, Any]], cases: list[dict[str, Any]], thresholds: dict[str, float]
) -> dict[str, Any]:
    total = len(results)
    errors = sum(1 for result in results if result["ai_error"])
    case_full = sum(1 for result in results if not result["ai_error"] and result["full_exact"])
    case_full_rate = case_full / total if total else 0.0

    by_kind: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for result, case in zip(results, cases):
        by_kind[case["kind"]].append(result)

    kind_rates: dict[str, Any] = {}
    for kind in ("quickadd", "planning", "boundary", "constraint_memory"):
        items = by_kind.get(kind, [])
        count = len(items)
        ok = sum(1 for result in items if not result["ai_error"] and result["full_exact"])
        kind_rates[f"{kind}_rate"] = round(ok / count, 4) if count else 1.0
        kind_rates[f"{kind}_exact"] = f"{ok}/{count}"

    parse_results = [
        result
        for result in results
        if result.get("kind") in ("quickadd", "boundary") and not result["ai_error"]
    ]
    field_correct = sum(result.get("correct_fields", 0) for result in parse_results)
    field_total = sum(result.get("field_total", 0) for result in parse_results)
    field_accuracy = field_correct / field_total if field_total else 1.0

    reject_results = [
        result for result in results if result.get("expect_reject") and not result["ai_error"]
    ]
    reject_ok = sum(1 for result in reject_results if result["reject_ok"])
    reject_total = len(reject_results)
    reject_accuracy = reject_ok / reject_total if reject_total else 1.0

    planning_results = [
        result
        for result in results
        if result.get("kind") in ("planning", "constraint_memory") and not result["ai_error"]
    ]
    check_passed = sum(result.get("check_passed", 0) for result in planning_results)
    check_total = sum(result.get("check_total", 0) for result in planning_results)
    check_accuracy = check_passed / check_total if check_total else 1.0

    passed = (
        errors == 0
        and case_full_rate >= thresholds["full"]
        and kind_rates["quickadd_rate"] >= thresholds["quickadd"]
        and kind_rates["planning_rate"] >= thresholds["planning"]
        and kind_rates["boundary_rate"] >= thresholds["boundary"]
        and kind_rates["constraint_memory_rate"] >= thresholds["cm"]
        and field_accuracy >= thresholds["field"]
        and reject_accuracy >= thresholds["reject"]
        and check_accuracy >= thresholds["check"]
    )
    return {
        "total_cases": total,
        "ai_error_cases": errors,
        "case_full_rate": round(case_full_rate, 4),
        "kind_rates": kind_rates,
        "field_accuracy": round(field_accuracy, 4),
        "reject_accuracy": round(reject_accuracy, 4),
        "planning_check_accuracy": round(check_accuracy, 4),
        "thresholds": thresholds,
        "passed": passed,
    }


async def run_eval(args: argparse.Namespace) -> int:
    settings = get_settings()
    provider, message = resolve_ai_provider(args.provider, settings)
    if not provider:
        print(json.dumps({"provider": args.provider, "error": message or "AI provider unavailable"}, ensure_ascii=False))
        return 2

    print(f"provider={provider} cases={len(GOLDEN_AI_CASES)}")
    results: list[dict[str, Any]] = []
    for case in GOLDEN_AI_CASES:
        kind = case["kind"]
        if kind in ("quickadd", "boundary"):
            if kind == "boundary" and not case["text"].strip():
                source = "local"
                actual: list[dict[str, Any]] = []
                rejected: Any = {"code": "empty", "message": "输入为空"}
                ai_message = None
            else:
                source, schedules, rejected, ai_message = await parse_with_ai(
                    case["text"], provider, case["today"], settings
                )
                actual = [schedule.model_dump() for schedule in schedules]
            result = score_case(case, actual, rejected)
            result["kind"] = kind
            result["actual"] = actual
            result["source"] = source
            result["message"] = ai_message
            result["ai_error"] = source == "none"
        else:
            payload = dict(case["planning"])
            payload["planning_range"] = {
                "start": payload.pop("range_start"),
                "end": payload.pop("range_end"),
            }
            payload["provider"] = provider
            response = await plan_v2_schedule(PlanV2Request(**payload), settings)
            result = score_planning_case(case, response)
            result["kind"] = kind
        results.append(result)
        mark = "OK" if result["full_exact"] else "FAIL"
        print(f"[{case['id']}] {kind:16} {mark:4} {case.get('text', case['id'])[:36]}")
        if not result["full_exact"]:
            if kind in ("planning", "constraint_memory"):
                failed = {key: value for key, value in result["check_results"].items() if not value}
                print("    failed_checks=" + json.dumps(failed, ensure_ascii=False))
                if result["ai_error"]:
                    print(f"    source={result.get('source')} message={result.get('message')}")
            else:
                print("    actual=" + json.dumps(result.get("actual", []), ensure_ascii=False))
                print(f"    rejected={result.get('actual_reject')}")

    thresholds = {
        "full": args.threshold_full,
        "quickadd": args.threshold_quickadd,
        "planning": args.threshold_planning,
        "boundary": args.threshold_boundary,
        "cm": args.threshold_cm,
        "field": args.threshold_field,
        "reject": args.threshold_reject,
        "check": args.threshold_check,
    }
    metrics = compute_metrics(results, GOLDEN_AI_CASES, thresholds)
    print("METRICS=" + json.dumps(metrics, ensure_ascii=False, indent=2))
    return 0 if metrics["passed"] else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI 解析与规划 golden set 评测")
    parser.add_argument("--provider", choices=("auto", "openai", "deepseek"), default="auto")
    parser.add_argument("--threshold-full", type=float, default=0.80)
    parser.add_argument("--threshold-quickadd", type=float, default=0.90)
    parser.add_argument("--threshold-planning", type=float, default=0.90)
    parser.add_argument("--threshold-boundary", type=float, default=1.00)
    parser.add_argument("--threshold-cm", type=float, default=0.80)
    parser.add_argument("--threshold-field", type=float, default=0.90)
    parser.add_argument("--threshold-reject", type=float, default=1.00)
    parser.add_argument("--threshold-check", type=float, default=0.90)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return asyncio.run(run_eval(args))


if __name__ == "__main__":
    raise SystemExit(main())
