# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 修复：长期约束带时间条件（如“从14:00开始安排工作”）时 AI 规划全部无法排期（2026-08-16 用户反馈）

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

- 当前分支 `main`；工作树含未提交变更（约束功能 + 本次修复），未提交，等待用户批准。

### 本次修复（2026-08-16）
- 根因：`schedule_tasks` 把硬约束在“整天空闲槽（06:00-23:00）”粒度过滤，
  而时间类约束（`_make_time_after_filter` 等）按 `slot.start` 判断，
  整槽 start=6:00 恒小于约束点 → 所有槽被排除 → 全部任务无法排期。
- 修复：删除整槽粒度预过滤，改为在候选位置（15 分钟粒度）上校验硬约束；
  顺带增强 `parse_constraint_filters`：否定式时点约束翻转方向（“9点前不安排”→ 允许 9 点后）、
  “晚上X点”按 24 小时制转换（晚上9点=21:00）。
- 涉及：`backend/app/services/scheduling_engine.py`、`backend/tests/test_scheduling_engine.py`

## 验证结果

- 后端 pytest：124 个测试通过（新增 4 个回归：时间条件约束可排期、day_start 不阻塞、下午三点前、排除晚上）
- 前端 Vitest：14 个文件、82 个测试通过
- `npm run lint`：通过；`npx tsc --noEmit` 通过
- 实机验证：`POST /api/v1/plan-v2`（provider=local）带“从14:00开始安排工作”→ 返回 14:00-15:00 时间块；修复前返回空 blocks

## Open Questions

- `app.main` 与 `app.limiter` 分别创建了 Limiter 实例，当前形成“路由级 + 全局兜底”双层限流；后续可评估合并为单一实例。
- T-020 证据的速率限制表中仍列出 `/api/v1/plan`，与已删除路由不一致，待确认后再更新证据。

## 交接要点

- 项目定义与长期状态见 `.project-to-act/PROJECT_OVERVIEW.md`
- 长期约束时间条件导致 AI 规划无法排期的 bug 已修复；硬约束改在候选位置粒度校验
- 已知遗留：本地解析器未映射“周末”（周六/周日）排除；`ConstraintSpec.max_daily_minutes` 解析后暂未在调度层执行
- 速率限制已生效，旧 `/api/v1/plan` 路由已移除
- SchedulingEngine 已支持理解层评分与自然语言硬约束
- 周计划批量删除与子任务/时间块完成联动已合入工作树
