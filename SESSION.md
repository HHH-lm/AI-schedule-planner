# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 检查并提交工作树中的未提交变更（2026-08-14 指示）

## 文件索引

### 上线准备 / T-020
- `backend/app/limiter.py` — 速率限制实例；业务路由添加 `@limiter.limit`
- `backend/app/main.py` — SlowAPIMiddleware、默认 60 次/分钟全局兜底、注册新路由表
- `backend/app/routers/` — parse/plan-v2/breakdown/conflicts/memories/reminders/match-task 增加限流；`plan.py` 移除
- `backend/pyproject.toml` + `backend/uv.lock` — 新增 slowapi 依赖
- `README.md`、`.project-to-act/PROJECT_OVERVIEW.md`、`.project-to-act/tasks/T-020/` — L2 风险等级、数据分类、README 与任务证据

### 调度与前端联动
- `backend/app/services/scheduling_engine.py`、`planner_v2.py`、`schemas.py` — TaskUnderstanding 评分、硬约束过滤、task_id/subtask_id 透传
- `backend/tests/test_scheduling_engine.py`、`test_api.py` — 约束/理解/记忆优先级测试，移除旧 `/plan` 测试
- `src/app/page.tsx`、`src/components/WeekTimeline.tsx`、`TaskBoard.tsx`、`BlockModal.tsx`、`src/lib/types.ts` — 子任务与时间块完成状态双向同步、批量删除、紧凑时间块、视图记忆
- `scripts/dev.sh` — uvicorn 增加 `--reload`

## Git 状态

- 当前分支 `main`；本会话提交检查与验证已完成，提交记录以 `git log` 为准。

## 验证结果

- 后端 pytest：115 个测试通过
- 前端 Vitest：14 个文件、82 个测试通过
- `npm run lint`：通过

## Open Questions

- `app.main` 与 `app.limiter` 分别创建了 Limiter 实例，当前形成“路由级 + 全局兜底”双层限流；后续可评估合并为单一实例。
- T-020 证据的速率限制表中仍列出 `/api/v1/plan`，与已删除路由不一致，待确认后再更新证据。

## 交接要点

- 项目定义与长期状态见 `.project-to-act/PROJECT_OVERVIEW.md`
- 速率限制已生效，旧 `/api/v1/plan` 路由已移除
- SchedulingEngine 已支持理解层评分与自然语言硬约束
- 周计划批量删除与子任务/时间块完成联动已合入工作树
