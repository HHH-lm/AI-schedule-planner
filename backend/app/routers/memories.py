"""记忆系统路由 - 为 AI 规划提供用户记忆上下文。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.limiter import limiter
from app.schemas import (
    MemoryAnalysisRequest,
    MemoryAnalysisResponse,
    MemoryContextRequest,
    MemoryContextResponse,
)
from app.services.memory_service import format_memory_context
from app.services.memory_analysis import build_analysis_message, run_analysis

router = APIRouter()


@router.post(
    "/memories/analyze",
    response_model=MemoryAnalysisResponse,
    summary="AI Memory Analysis",
    description="基于统计的时间块模式分析，生成记忆建议。不依赖 LLM，遵循最小样本量原则。",
)
@limiter.limit("10/minute")
async def analyze_memories(
    request: Request,
    payload: MemoryAnalysisRequest,
    settings: Settings = Depends(get_settings),
) -> MemoryAnalysisResponse:
    """基于用户时间块数据运行统计分析，生成记忆建议。"""
    suggestions, stats = run_analysis(
        payload.timeBlocks,
        payload.horizon_days,
        today=payload.today,
    )
    return MemoryAnalysisResponse(
        suggestions=suggestions,
        stats=stats,
        message=build_analysis_message(suggestions, stats),
    )


@router.post(
    "/memories/context",
    response_model=MemoryContextResponse,
    summary="生成记忆上下文",
    description="接收用户的记忆列表，返回格式化后的上下文文本，供 AI 规划时参考",
)
@limiter.limit("30/minute")
async def get_memory_context(
    request: Request,
    payload: MemoryContextRequest,
    settings: Settings = Depends(get_settings),
) -> MemoryContextResponse:
    """将用户记忆列表格式化为 AI 可读的上下文文本。"""
    return format_memory_context(payload.memories)
