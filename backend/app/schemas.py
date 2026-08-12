from __future__ import annotations

from typing import Literal

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
    reasoning: str
    confidence: float = Field(ge=0.0, le=1.0)
    createdAt: str


class MemoryAnalysisResponse(BaseModel):
    """AI Memory Analysis 响应。"""
    suggestions: list[MemorySuggestionOutput] = Field(
        default_factory=list, description="生成的记忆建议"
    )
    stats: dict[str, int] = Field(
        default_factory=dict, description="分析统计摘要"
    )
