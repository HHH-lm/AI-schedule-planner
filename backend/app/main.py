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
from app.log_shipper import flush_logs, install_shipper
from app.logging_setup import (
    get_logger,
    log_event,
    reset_request_id,
    set_request_id,
    setup_logging,
)
from app.routers import (
    breakdown,
    conflicts,
    health,
    match_task,
    memories,
    parse,
    plan_v2,
    reminders,
    transcribe,
)
from app.services.push import push_channel_ready
from app.services.reminders import scan_reminders


settings = get_settings()
setup_logging(settings.log_level, settings.log_format)
# 配置了 Axiom 凭据时挂载日志直发 handler（未配置则零开销）
install_shipper(settings)

limiter = Limiter(key_func=lambda: "global", default_limits=["60/minute"])

http_logger = get_logger("app.http")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    scheduler: AsyncIOScheduler | None = None
    if (
        settings.enable_scheduler
        and settings.supabase_url
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
    title="AI日程管理与个性化规划系统 API",
    description="自然语言解析、任务拆解、时间规划与冲突检测服务",
    version=settings.version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


@app.middleware("http")
async def structured_request_log(request: Request, call_next):
    """结构化访问日志：方法/路径/状态码/耗时，附加 request_id 贯穿请求。

    响应头带 X-Request-ID 供报障对号；未捕获异常先记 ERROR（含堆栈）再抛出，
    两条路径都在 request_id 重置前把缓冲日志直发到 Axiom，规避响应后执行冻结。
    """
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
            exc_info=True,
        )
        flush_logs()
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
    response.headers["X-Request-ID"] = request_id
    flush_logs()
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
    transcribe.router,
):
    app.include_router(router, prefix="/api/v1")
