from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


Provider = Literal["auto", "openai", "deepseek", "local"]
Category = Literal["work", "study", "fitness", "life", "rest"]


class ParsedSchedule(BaseModel):
    name: str
    date: str
    start: int
    end: int
    category: Category = "life"
    location: str | None = None


class RejectReason(BaseModel):
    code: str
    message: str


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    provider: Provider | None = None
    today: str | None = None


class ParseResponse(BaseModel):
    source: Literal["openai", "deepseek", "none", "local"]
    schedules: list[ParsedSchedule]
    rejected: RejectReason | None = None
    message: str | None = None


class ExistingBlock(BaseModel):
    date: str
    start: int
    end: int
    status: Literal["scheduled", "pending"] = "scheduled"


class ConflictCheckRequest(BaseModel):
    schedules: list[ParsedSchedule]
    existing_blocks: list[ExistingBlock] = Field(default_factory=list)


class ConflictCheckResponse(BaseModel):
    accepted: list[ParsedSchedule]
    blocked: list[ParsedSchedule]


class BreakdownTask(BaseModel):
    name: str
    subtasks: list[str] = Field(default_factory=list)


class BreakdownRequest(BaseModel):
    plan: str = Field(min_length=1, max_length=4000)
    provider: Provider | None = None
    today: str | None = None


class BreakdownResponse(BaseModel):
    source: Literal["openai", "deepseek", "none", "local"]
    tasks: list[BreakdownTask]
    message: str | None = None


class PlanTaskInput(BaseModel):
    name: str
    date: str | None = None
    subtasks: list[str] = Field(default_factory=list)


class PlanRequest(BaseModel):
    tasks: list[PlanTaskInput] = Field(min_length=1, max_length=100)
    existing_blocks: list[ExistingBlock] = Field(default_factory=list)
    start_date: str | None = None
    horizon_days: int = Field(default=7, ge=1, le=90)
    provider: Provider | None = None
    today: str | None = None


class PlannedBlock(BaseModel):
    name: str
    date: str
    start: int
    end: int
    category: Category = "life"
    location: str | None = None


class PlanResponse(BaseModel):
    source: Literal["openai", "deepseek", "none", "local"]
    blocks: list[PlannedBlock]
    blocked: list[PlannedBlock]
    message: str | None = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: str


class MatchTaskItem(BaseModel):
    id: str
    name: str


class MatchTaskRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    tasks: list[MatchTaskItem] = Field(default_factory=list)
    provider: Provider | None = None


class MatchTaskResponse(BaseModel):
    source: Literal["openai", "deepseek", "none", "local"]
    taskId: str | None = None
    message: str | None = None

# --- Memory System ---

MemoryCategory = Literal[
    "time-preference", "habit", "life-preference", "long-term-constraint"
]


class MemoryItem(BaseModel):
    id: str = Field(default="", description="记忆唯一标识")
    category: MemoryCategory
    content: str = Field(min_length=1, max_length=2000)
    createdAt: str = ""
    updatedAt: str = ""
    source: Literal["manual", "ai-suggested"] = "manual"
    status: Literal["active", "archived"] = "active"


class MemoryContextRequest(BaseModel):
    memories: list[MemoryItem] = Field(
        default_factory=list, description="用户的记忆列表"
    )


class MemoryContextResponse(BaseModel):
    context: str = Field(description="格式化后的记忆上下文文本，供 AI 规划使用")
    count: int = Field(description="有效记忆数量")


class TimeBlockInput(BaseModel):
    """用于分析的时间块输入。"""
    id: str = ""
    name: str
    date: str
    start: int
    end: int
    category: Literal["work", "study", "fitness", "life", "rest"] = "life"
    done: bool = False


class MemoryAnalysisRequest(BaseModel):
    """AI Memory Analysis 请求。"""
    timeBlocks: list[TimeBlockInput] = Field(
        default_factory=list, description="最近 N 天的时间块列表"
    )
    horizon_days: int = Field(default=28, ge=7, le=90, description="分析回溯天数")


class MemorySuggestionOutput(BaseModel):
    """分析输出的建议。"""
    id: str
    category: MemoryCategory
    content: str
    conclusion: str
    reasoning: str
    confidence: float = Field(ge=0.0, le=1.0)
    createdAt: str


class MemoryAnalysisResponse(BaseModel):
    """AI Memory Analysis 响应。"""
    suggestions: list[MemorySuggestionOutput] = Field(
        default_factory=list, description="生成的记忆建议"
    )
    stats: dict[str, Any] = Field(
        default_factory=dict, description="分析统计摘要"
    )

# --- Planning V2 ---

Priority = Literal["low", "medium", "high"]
PriorityInput = Literal["low", "medium", "high", "auto"]


class PlanV2Task(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    duration: int = Field(ge=15, le=480, description="duration in minutes")
    priority: PriorityInput = "auto"
    deadline: str | None = Field(default=None, description="YYYY-MM-DD")
    task_id: str | None = Field(default=None, description="前端 task id")
    subtask_id: str | None = Field(default=None, description="前端 subtask id")


class PlanningRange(BaseModel):
    start: str = Field(description="YYYY-MM-DD")
    end: str = Field(description="YYYY-MM-DD")


class ConstraintSpec(BaseModel):
    """LLM 解析长期约束后生成的结构化硬约束。"""
    day_start: int | None = Field(default=None, ge=0, le=23, description="每日最早可排小时（X点前不排）")
    day_end: int | None = Field(default=None, ge=0, le=23, description="每日最晚可排小时（X点后不排）")
    exclude_weekdays: list[int] = Field(default_factory=list, description="排除的星期（0=周一 ... 6=周日）")
    exclude_periods: list[str] = Field(default_factory=list, description="排除的时段（上午/下午/晚上/凌晨）")
    max_daily_minutes: int | None = Field(default=None, ge=0, description="每日最大可排分钟数")


class WorkStyleSpec(BaseModel):
    """工作方式（番茄钟式分块排期）。

    由 LLM 理解层从记忆/目标中提取，或由本地规则兜底解析：
    把任务拆成 chunk_minutes 的块，块间保留 break_minutes 的休息间隔。
    """
    chunk_minutes: int | None = Field(default=None, ge=15, le=120, description="分块时长（分钟），如 25")
    break_minutes: int | None = Field(default=None, ge=1, le=60, description="块间休息间隔（分钟），如 5")


class PlanV2Request(BaseModel):
    goal: str = Field(default="", max_length=500, description="user goal")
    tasks: list[PlanV2Task] = Field(min_length=1, max_length=50)
    memories: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    existing_schedule: list[ExistingBlock] = Field(default_factory=list)
    planning_range: PlanningRange
    now_minutes: int | None = Field(
        default=None, ge=0, le=1440,
        description="当前本地时间（当天 0 点起分钟），规划范围首日不得早于该时刻",
    )
    provider: Provider | None = None


class TaskUnderstanding(BaseModel):
    title: str
    category: Category = "life"
    preferred_time: str = "any"
    focus_level: str = "flexible"
    notes: str = ""


class PlanV2Block(BaseModel):
    title: str
    date: str
    start: int
    end: int
    category: Category = "life"
    priority: Priority = "medium"
    task_id: str | None = None
    subtask_id: str | None = None


class PlanV2Response(BaseModel):
    source: Literal["openai", "deepseek", "none", "local"]
    blocks: list[PlanV2Block]
    unassigned: list[str] = Field(default_factory=list)
    message: str | None = None
