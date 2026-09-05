from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


Provider = Literal["auto", "openai", "deepseek", "local"]
# "auto" 仅作旧客户端兼容值：后端将其映射为环境变量 AI_PROVIDER（限 openai/deepseek/local），缺省 local。
Category = Literal["work", "study", "fitness", "life", "rest"]
TimePreference = Literal["balanced", "early_bird", "night_owl"]


class ParsedSchedule(BaseModel):
    name: str
    date: str
    start: int
    end: int
    category: Category = "life"
    location: str | None = None
    linkTask: str | None = None


class RejectReason(BaseModel):
    code: str
    message: str


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    provider: Provider | None = None
    today: str | None = None
    api_key: str | None = Field(default=None, max_length=200)


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
    api_key: str | None = Field(default=None, max_length=200)


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
    api_key: str | None = Field(default=None, max_length=200)


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
    api_key: str | None = Field(default=None, max_length=200)


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
    horizon_days: int = Field(default=14, ge=7, le=90, description="分析回溯天数")
    today: str | None = Field(
        default=None,
        description="分析参考日期（YYYY-MM-DD），不传则使用服务器当天",
    )


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
    message: str | None = Field(
        default=None,
        description="分析提示：数据量不足或未发现规律时，向用户说明原因",
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


class PlanningWeights(BaseModel):
    """SchedulingEngine 六维加权评分权重（0-1，用户可在设置页调节）。

    截止日期不参与评分：作为硬约束在调度时强制（排期不得越过截止日），
    并通过自动优先级让截止任务优先认领时段。
    """
    memory: float = Field(default=0.33, ge=0.0, le=1.0, description="记忆匹配度权重")
    understanding: float = Field(default=0.22, ge=0.0, le=1.0, description="理解匹配度权重")
    time: float = Field(default=0.17, ge=0.0, le=1.0, description="时间可用性权重")
    priority: float = Field(default=0.17, ge=0.0, le=1.0, description="任务优先级权重")
    conflict: float = Field(default=0.06, ge=0.0, le=1.0, description="冲突风险权重")
    workload: float = Field(default=0.05, ge=0.0, le=1.0, description="负荷惩罚权重")

    @model_validator(mode="after")
    def normalize_sum_to_one(self):
        """归一化权重，使六维总和恰好为 1。"""
        dims = ("memory", "understanding", "time", "priority", "conflict", "workload")
        total = sum(
            getattr(self, dim)
            for dim in dims
        )
        if total <= 0:
            return self
        for dim in dims:
            setattr(self, dim, round(getattr(self, dim) / total, 2))
        # 把舍入误差加到最大维度上
        current = sum(
            getattr(self, dim)
            for dim in dims
        )
        diff = round(1.0 - current, 2)
        if diff != 0:
            largest = max(
                dims,
                key=lambda d: getattr(self, d),
            )
            setattr(self, largest, round(getattr(self, largest) + diff, 2))
        return self


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
    weights: PlanningWeights | None = Field(
        default=None,
        description="个性化规划七维权重，缺省使用 SchedulingEngine 默认值",
    )
    time_preference: TimePreference = Field(
        default="balanced",
        description="时段偏好评分预设：balanced=均衡（默认节奏），early_bird=早起型，night_owl=夜猫型",
    )
    provider: Provider | None = None
    api_key: str | None = Field(
        default=None, max_length=200,
        description="用户自备 API Key（随请求传入，仅在本次调用生命周期内使用，不落日志）",
    )


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
