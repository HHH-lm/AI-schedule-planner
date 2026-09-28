from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    # 完成指令（「标记为已完成」等）：解析产出即已完成的块；无指令时省略或 False
    done: bool = False
    # 折叠编排（/parse 内联匹配）回填的任务 ID；AI 白名单不产出该字段，仅服务端回填
    taskId: str | None = None


class RejectReason(BaseModel):
    code: str
    message: str


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    provider: Provider | None = None
    today: str | None = None
    api_key: str | None = Field(default=None, max_length=200)
    # 折叠编排（可选）：随解析一并完成任务匹配与冲突过滤，省去前端两次串行往返
    tasks: list[MatchTaskItem] = Field(default_factory=list, max_length=100)
    existing_blocks: list[ExistingBlock] = Field(default_factory=list, max_length=500)


class ParseResponse(BaseModel):
    source: Literal["openai", "deepseek", "none", "local"]
    schedules: list[ParsedSchedule]
    rejected: RejectReason | None = None
    message: str | None = None
    # 折叠编排结果：仅请求携带 tasks/existing_blocks 时返回；schedules 始终为完整解析列表
    accepted: list[ParsedSchedule] | None = None
    blocked: list[ParsedSchedule] | None = None


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


class TranscribeResponse(BaseModel):
    """语音转文字结果。上游失败时 source="none" 并用 message 说明原因（不抛异常）。"""

    source: Literal["siliconflow", "none"]
    text: str = ""
    message: str | None = None


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
        description="个性化规划六维权重，缺省使用 SchedulingEngine 默认值",
    )
    time_preference: TimePreference = Field(
        default="balanced",
        description="时段偏好评分预设：balanced=均衡（默认节奏），early_bird=早起型，night_owl=夜猫型",
    )
    deadline_window_days: int | None = Field(
        default=None, ge=1, le=365,
        description="DDL 窗口（天）：截止日晚于规划范围首日+N 天的子任务暂缓排期；None=不限制",
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
    deferred: list[str] = Field(default_factory=list, description="截止日期超出 DDL 窗口而暂缓排期的任务标题")
    message: str | None = None


# ── 活动证据 → 候选记录（F-045）─────────────────────────────────────────────
# 证据由本机 activity_collector 产出（元数据级：时间戳/会话 ID/工具名/提交信息/
# 文件路径，无消息正文或文件内容），前端原样上传，这里只做结构校验。


class ActivityToolCount(BaseModel):
    name: str
    count: int = 0


class ActivitySegment(BaseModel):
    # 会话内连续活动段（修订 5）：采集器按空闲 > 15 分钟切段；旧证据文件缺省即整段窗口
    start: str
    end: str


class ActivitySessionEvidence(BaseModel):
    session_id: str
    start: str | None = None
    end: str | None = None
    tool_calls: int = 0
    top_tools: list[ActivityToolCount] = Field(default_factory=list)
    # 内容信号（v2，采集器从 ZCode 会话库提取；旧证据文件缺省即回退纯时间窗模板）
    title: str | None = None
    directory: str | None = None
    files_edited: list[str] = Field(default_factory=list)
    commands: list[str] = Field(default_factory=list)
    # 连续活动段（修订 5；缺省/全畸形时回退 start/end 整段窗口）
    segments: list[ActivitySegment] = Field(default_factory=list)


class ActivityZcodeSource(BaseModel):
    available: bool = True
    note: str | None = None
    sessions: list[ActivitySessionEvidence] = Field(default_factory=list)


class ActivityGitCommit(BaseModel):
    hash: str
    time: str | None = None
    subject: str = ""


class ActivityGitRepo(BaseModel):
    path: str
    name: str = ""
    commits: list[ActivityGitCommit] = Field(default_factory=list)


class ActivityGitSource(BaseModel):
    available: bool = True
    note: str | None = None
    repos: list[ActivityGitRepo] = Field(default_factory=list)


class ActivityFileChange(BaseModel):
    path: str
    mtime: str | None = None


class ActivityFilesSource(BaseModel):
    available: bool = True
    note: str | None = None
    truncated: bool = False
    files: list[ActivityFileChange] = Field(default_factory=list)


class ActivityEvidenceSources(BaseModel):
    zcode: ActivityZcodeSource | None = None
    git: ActivityGitSource | None = None
    files: ActivityFilesSource | None = None


class ActivityEvidence(BaseModel):
    # schema 字段为别名：Pydantic BaseModel 自带 schema 属性，字段名用 schema_version
    model_config = ConfigDict(populate_by_name=True)

    schema_version: str = Field(default="activity-evidence/1", alias="schema")
    date: str
    generated_at: str | None = None
    sources: ActivityEvidenceSources = Field(default_factory=ActivityEvidenceSources)


class ActivityDigestRequest(BaseModel):
    evidence: ActivityEvidence
    # AI 归纳为可选增强：use_ai=False 或未配置 AI 时回退纯规则候选
    use_ai: bool = True
    provider: Provider | None = None
    api_key: str | None = Field(
        default=None, max_length=200,
        description="用户自备 API Key（随请求传入，仅在本次调用生命周期内使用，不落日志）",
    )


class ActivityCandidate(BaseModel):
    # dedup_key 是候选的稳定指纹（来源 + 会话/提交/文件集合 + 时间窗哈希），
    # 前端用它识别「同一天重复导入」的候选；时间窗入指纹让同一会话拆出的多段不撞键
    dedup_key: str
    date: str
    start: int | None = None
    end: int | None = None
    summary: str
    category: Category = "work"
    sources: list[str] = Field(default_factory=list)
    evidence: str | None = None
    # 会话内容信号（zcode 候选携带，供 AI 归纳与前端展示；其余来源为空）
    titles: list[str] = Field(default_factory=list)
    files_edited: list[str] = Field(default_factory=list)


class ActivityDigestResponse(BaseModel):
    source: str
    used_ai: bool
    candidates: list[ActivityCandidate] = Field(default_factory=list)
    message: str | None = None
