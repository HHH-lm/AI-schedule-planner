from __future__ import annotations

import logging
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.logging_setup import (
    get_logger,
    log_event,
    reset_request_id,
    set_request_id,
    setup_logging,
)
from app.routers import breakdown, conflicts, health, match_task, memories, parse, plan_v2, reminders
from app.services.push import push_channel_ready
from app.services.reminders import scan_reminders


settings = get_settings()
setup_logging(settings.log_level, settings.log_format)

limiter = Limiter(key_func=lambda: "global", default_limits=["60/minute"])

http_logger = get_logger("app.http")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    scheduler: AsyncIOScheduler | None = None
    if (
        settings.supabase_url
        and settings.supabase_service_role_key
        and push_channel_ready(settings)
    ):
        scheduler = AsyncIOScheduler(timezone=settings.timezone)
        scheduler.add_job(
            scan_reminders,
            trigger=IntervalTrigger(seconds=settings.reminder_scan_seconds),
            args=[settings],
            id="reminder-scan",
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
        app.state.scheduler = scheduler
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="AI 日程管理系统 API",
    description="自然语言解析、任务拆解、时间规划与冲突检测服务",
    version=settings.version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


@app.middleware("http")
async def structured_request_log(request: Request, call_next):
    """结构化访问日志：方法/路径/状态码/耗时，附加 request_id 贯穿请求。"""
    request_id = uuid.uuid4().hex[:12]
    token = set_request_id(request_id)
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        log_event(
            http_logger,
            logging.ERROR,
            "http.request",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status=500,
            duration_ms=duration_ms,
        )
        raise
    finally:
        reset_request_id(token)

    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    if response.status_code >= 500:
        level = logging.ERROR
    elif response.status_code >= 400:
        level = logging.WARNING
    else:
        level = logging.INFO
    log_event(
        http_logger,
        level,
        "http.request",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration_ms,
    )
    return response


for router in (
    health.router,
    memories.router,
    parse.router,
    breakdown.router,
    plan_v2.router,
    conflicts.router,
    reminders.router,
    match_task.router,
):
    app.include_router(router, prefix="/api/v1")
