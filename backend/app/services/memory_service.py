"""记忆系统服务 - 提供记忆格式化、过滤等核心业务逻辑。"""

from __future__ import annotations

from app.schemas import MemoryItem, MemoryContextResponse


CATEGORY_LABELS: dict[str, str] = {
    "time-preference": "时间偏好",
    "habit": "习惯",
    "life-preference": "生活/工作偏好",
    "long-term-constraint": "长期约束",
}


def get_active_memories(memories: list[MemoryItem]) -> list[MemoryItem]:
    """过滤出已启用的记忆（status == "active"）。

    未来可扩展为从数据库查询用户的 active memories。
    """
    return [m for m in memories if m.status == "active"]


def format_memory_context(memories: list[MemoryItem]) -> MemoryContextResponse:
    """将记忆列表格式化为 AI 可读的上下文文本。"""
    active = get_active_memories(memories)
    if not active:
        return MemoryContextResponse(
            context="用户暂未设置任何生效的记忆偏好。"
            if memories
            else "用户暂未设置任何记忆偏好。",
            count=0,
        )

    lines: list[str] = ["以下是用户的个人偏好与习惯记忆，请据此调整日程安排：\n"]
    grouped: dict[str, list[str]] = {}
    for memory in active:
        label = CATEGORY_LABELS.get(memory.category, memory.category)
        if label not in grouped:
            grouped[label] = []
        grouped[label].append(memory.content)

    for label, items in grouped.items():
        lines.append(f"## {label}")
        for item in items:
            lines.append(f"- {item}")
        lines.append("")

    return MemoryContextResponse(
        context="\n".join(lines),
        count=len(active),
    )
