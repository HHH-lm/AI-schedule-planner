"""AI Memory Analysis 服务 - 基于统计的模式检测，不依赖 LLM。

分析流程：
  时间块数据 → 统计 → 模式检测 → 样本量校验 → Suggestion

核心原则：
  1. 基于统计，不靠 LLM 自由发挥
  2. 最小样本量保护：<5 不生成，5-9 低置信度，10+ 正常
  3. AI 永远不直接写入 active Memory，只生成 pending suggestion
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any

from app.schemas import MemorySuggestionOutput, TimeBlockInput


# ── 样本量阈值 ──

MIN_SAMPLES = 5          # 低于此值不生成建议
LOW_CONF_SAMPLES = 9     # 5-9 为低置信度
HIGH_CONF_SAMPLES = 10   # 10+ 为正常置信度

# ── 时段划分（分钟） ──

MORNING_START = 6 * 60     # 06:00
MORNING_END = 12 * 60      # 12:00
AFTERNOON_END = 18 * 60    # 18:00


def _period_label(minutes: int) -> str:
    if minutes < MORNING_START:
        return "凌晨"
    if minutes < MORNING_END:
        return "上午"
    if minutes < AFTERNOON_END:
        return "下午"
    return "晚上"


def _confidence_from_samples(n: int) -> float:
    if n < MIN_SAMPLES:
        return 0.0
    if n <= LOW_CONF_SAMPLES:
        # 5-9: 0.50 ~ 0.66
        return round(0.50 + (n - MIN_SAMPLES) * 0.04, 2)
    # 10+: 0.70 ~ 0.95
    return round(min(0.70 + (n - HIGH_CONF_SAMPLES) * 0.025, 0.95), 2)


def _suggestion_id() -> str:
    import uuid
    return str(uuid.uuid4())


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ── 分析器 ──

def analyze_completion_by_period(
    blocks: list[TimeBlockInput],
) -> list[MemorySuggestionOutput]:
    """按时间段（上午/下午/晚上）分析完成率差异。"""
    # 按时间段分组
    period_data: dict[str, list[bool]] = {
        "上午": [], "下午": [], "晚上": []
    }
    for block in blocks:
        # 取时间块的中点作为时段判断依据
        mid = (block.start + block.end) // 2
        label = _period_label(mid)
        if label in period_data:
            period_data[label].append(block.done)

    suggestions: list[MemorySuggestionOutput] = []
    period_stats: dict[str, dict[str, Any]] = {}

    for period, dones in period_data.items():
        total = len(dones)
        if total < MIN_SAMPLES:
            continue
        completed = sum(1 for d in dones if d)
        rate = completed / total
        period_stats[period] = {
            "total": total,
            "completed": completed,
            "rate": round(rate, 2)
        }

    # 找出最佳和最差时段
    if len(period_stats) < 2:
        return suggestions

    best = max(period_stats, key=lambda p: period_stats[p]["rate"])
    worst = min(period_stats, key=lambda p: period_stats[p]["rate"])
    best_stat = period_stats[best]
    worst_stat = period_stats[worst]
    diff = best_stat["rate"] - worst_stat["rate"]

    # 差异显著（>15%）且样本达标才生成建议
    if diff > 0.15 and best_stat["total"] >= MIN_SAMPLES:
        confidence = _confidence_from_samples(best_stat["total"])
        if confidence > 0:
            suggestions.append(MemorySuggestionOutput(
                id=_suggestion_id(),
                category="time-preference",
                content=f"你在{best}的完成率（{best_stat['completed']}/{best_stat['total']}，{best_stat['rate']:.0%}）显著高于{worst}（{worst_stat['completed']}/{worst_stat['total']}，{worst_stat['rate']:.0%}），{best}更适合安排需要专注的任务。",
                conclusion=f"{best}更适合安排需要专注的任务。",
                reasoning=f"过去的数据显示，{best}共{best_stat['total']}个时间块，完成{best_stat['completed']}个；{worst}共{worst_stat['total']}个时间块，完成{worst_stat['completed']}个。",
                confidence=confidence,
                createdAt=_now_iso(),
            ))

    return suggestions


def analyze_exercise_frequency(
    blocks: list[TimeBlockInput],
) -> list[MemorySuggestionOutput]:
    """分析运动习惯模式。"""
    exercise_blocks = [b for b in blocks if b.category == "fitness"]
    total = len(exercise_blocks)
    if total < MIN_SAMPLES:
        return []

    # 按星期几分组
    weekday_counts: Counter[int] = Counter()
    for block in exercise_blocks:
        try:
            d = date.fromisoformat(block.date)
            weekday_counts[d.weekday()] += 1
        except (ValueError, TypeError):
            continue

    if not weekday_counts:
        return []

    # 找最常运动的星期几
    most_common = weekday_counts.most_common()
    top_day_idx, top_count = most_common[0]
    weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    top_day_name = weekday_names[top_day_idx] if top_day_idx < 7 else ""

    # 检查是否集中在特定天
    if top_count >= total * 0.3 and total >= MIN_SAMPLES:
        confidence = _confidence_from_samples(total)
        if confidence > 0:
            return [MemorySuggestionOutput(
                id=_suggestion_id(),
                category="habit",
                content=f"你似乎有定期运动的习惯，尤其是在{top_day_name}（{top_count}/{total}次运动安排在这一天）。",
                conclusion=f"你似乎有定期运动的习惯，尤其是在{top_day_name}。",
                reasoning=f"过去共有{total}次运动安排，其中{top_count}次集中在{top_day_name}，占比{top_count/total:.0%}。",
                confidence=confidence,
                createdAt=_now_iso(),
            )]

    return []


def analyze_work_study_balance(
    blocks: list[TimeBlockInput],
) -> list[MemorySuggestionOutput]:
    """分析工作与学习的分布。"""
    category_counts: Counter[str] = Counter()
    for block in blocks:
        if block.category in ("work", "study"):
            duration = block.end - block.start
            category_counts[block.category] += duration

    total_duration = sum(category_counts.values())
    if total_duration < 60 * MIN_SAMPLES:  # 至少 5 小时总时长
        return []

    work_minutes = category_counts.get("work", 0)
    study_minutes = category_counts.get("study", 0)
    work_ratio = work_minutes / total_duration if total_duration > 0 else 0
    study_ratio = study_minutes / total_duration if total_duration > 0 else 0

    # 总时间块数作为样本量参考
    total_blocks = len([b for b in blocks if b.category in ("work", "study")])
    if total_blocks < MIN_SAMPLES:
        return []

    suggestions: list[MemorySuggestionOutput] = []

    # 工作占比过高
    if work_ratio > 0.75 and total_blocks >= MIN_SAMPLES:
        confidence = _confidence_from_samples(total_blocks)
        if confidence > 0:
            suggestions.append(MemorySuggestionOutput(
                id=_suggestion_id(),
                category="life-preference",
                content=f"你的时间中工作占比偏高（{work_minutes // 60}h / {total_duration // 60}h，{work_ratio:.0%}），建议适当增加学习或休息时间。",
                conclusion=f"工作占比偏高，建议适当增加学习或休息时间。",
                reasoning=f"过去的数据显示，工作类时间块共{work_minutes // 60}小时，占总可用时间的{work_ratio:.0%}。",
                confidence=confidence,
                createdAt=_now_iso(),
            ))

    # 学习占比过低
    if study_ratio < 0.1 and total_blocks >= MIN_SAMPLES:
        confidence = _confidence_from_samples(total_blocks)
        if confidence > 0:
            suggestions.append(MemorySuggestionOutput(
                id=_suggestion_id(),
                category="life-preference",
                content=f"你的学习时间占比较低（{study_minutes // 60}h / {total_duration // 60}h，{study_ratio:.0%}），可能需要在日程中为学习留出更多时间。",
                conclusion=f"学习时间占比较低，可能需要在日程中为学习留出更多时间。",
                reasoning=f"过去的数据显示，学习类时间块仅{study_minutes // 60}小时，占总可用时间的{study_ratio:.0%}。",
                confidence=confidence,
                createdAt=_now_iso(),
            ))

    return suggestions


# ── 主入口 ──

def run_analysis(
    blocks: list[TimeBlockInput],
    analysis_horizon_days: int | None = None,
) -> tuple[list[MemorySuggestionOutput], dict[str, int]]:
    """运行完整分析，返回建议列表和统计摘要。

    遵循最小样本量原则：
      - 样本 < 5: 不生成
      - 5-9: 低置信度
      - 10+: 正常置信度
    """
    # 统计基础数据
    total_blocks = len(blocks)
    done_blocks = sum(1 for b in blocks if b.done)
    category_dist = Counter(b.category for b in blocks)
    period_dist = Counter(_period_label((b.start + b.end) // 2) for b in blocks)

    stats = {
        "total_blocks": total_blocks,
        "done_blocks": done_blocks,
        "completion_rate": round(done_blocks / total_blocks, 2) if total_blocks > 0 else 0,
        "analysis_horizon_days": analysis_horizon_days or 0,
    }

    # 执行各分析器
    suggestions: list[MemorySuggestionOutput] = []
    suggestions.extend(analyze_completion_by_period(blocks))
    suggestions.extend(analyze_exercise_frequency(blocks))
    suggestions.extend(analyze_work_study_balance(blocks))

    # 补充统计摘要
    stats["categories"] = dict(category_dist)
    stats["periods"] = dict(period_dist)
    stats["suggestions_generated"] = len(suggestions)

    return suggestions, stats
