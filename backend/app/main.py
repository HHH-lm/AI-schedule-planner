from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import breakdown, conflicts, health, match_task, memories, parse, plan, plan_v2, reminders
from app.services.push import push_channel_ready
from app.services.reminders import scan_reminders


settings = get_settings()


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

for router in (
    health.router,
    memories.router,
    parse.router,
    breakdown.router,
    plan.router,
    plan_v2.router,
    conflicts.router,
    reminders.router,
    match_task.router,
):
    app.include_router(router, prefix="/api/v1")
