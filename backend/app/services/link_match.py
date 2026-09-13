"""关联目标 → 任务的本地匹配（与前端 src/lib/linkDirective.ts 同规则）。

供 /parse 折叠编排使用：解析出的 linkTask 先本地解析（精确 → 包含 → 模糊），
未命中再走 AI 语义匹配，把原前端串行的 /match-task 往返收进单次 /parse 请求。
"""

from __future__ import annotations

import re

from app.schemas import MatchTaskItem

# 模糊兜底阈值：字符 bigram Dice 相似度。0.7 可容许 8 字名错 1-2 字（时/实类
# 语音输入变体），又不会把无关联的短名误连
FUZZY_MATCH_THRESHOLD = 0.7


def normalize_task_name(text: str) -> str:
    # 与前端 normalizeTaskName / match_task._normalize 同规则：去空白与 -_. ,/ 后转小写
    return re.sub(r"[\s\-_.,/]+", "", text).lower()


def bigram_dice(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if len(a) < 2 or len(b) < 2:
        return 0.0
    counts: dict[str, int] = {}
    for i in range(len(b) - 1):
        gram = b[i : i + 2]
        counts[gram] = counts.get(gram, 0) + 1
    overlap = 0
    for i in range(len(a) - 1):
        gram = a[i : i + 2]
        n = counts.get(gram, 0)
        if n > 0:
            overlap += 1
            counts[gram] = n - 1
    return (2 * overlap) / (len(a) + len(b) - 2)


def resolve_link_target(target: str, tasks: list[MatchTaskItem]) -> str | None:
    """本地解析关联目标 → 任务 ID。

    归一化精确相等 → 「目标包含完整任务名」（目标带「项目/任务」等修饰词时）→
    bigram 模糊兜底（错别字/语音输入变体，唯一最佳候选且双方归一化后 ≥4 字才命中，
    多个并列高分为歧义不绑定）。不含反向包含，短目标不因任务名的子串关系误绑定；
    解析不到返回 None。
    """
    normalized_target = normalize_task_name(target)
    if not normalized_target:
        return None
    for task in tasks:
        if normalize_task_name(task.name) == normalized_target:
            return task.id
    for task in tasks:
        normalized = normalize_task_name(task.name)
        if normalized and normalized_target.find(normalized) != -1:
            return task.id
    if len(normalized_target) < 4:
        return None
    best: tuple[str, float] | None = None
    tied = False
    for task in tasks:
        normalized = normalize_task_name(task.name)
        if len(normalized) < 4:
            continue
        score = bigram_dice(normalized_target, normalized)
        if score < FUZZY_MATCH_THRESHOLD:
            continue
        if best is None or score > best[1]:
            best = (task.id, score)
            tied = False
        elif score == best[1]:
            tied = True
    return best[0] if best is not None and not tied else None
