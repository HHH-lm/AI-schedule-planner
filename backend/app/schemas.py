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
