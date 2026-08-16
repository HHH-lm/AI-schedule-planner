# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 完成：后端可观测性 — 结构化日志 + 关键事件（AI 慢/失败、推送失败可查），证据 E-T023-001（2026-08-16）
- 上一目标（已完成）：AI 解析质量度量（30 条 golden set + 回归门禁），证据 E-T022-001

## 文件索引

### 后端可观测性 / T-023
- `backend/app/logging_setup.py` — JSON Lines 格式化、`setup_logging`（幂等）、`log_event` 埋点、`request_id` ContextVar
- `backend/app/config.py` — 新增 `LOG_LEVEL` / `LOG_FORMAT`
- `backend/app/main.py` — 启动初始化日志；HTTP 中间件记录 `http.request`（method/path/status/duration_ms，含 429），`request_id` 贯穿
- `backend/app/services/ai.py` — `call_chat_completions` 增加 `operation` 参数；`ai.request/response/timeout/error`
- `backend/app/services/push.py` — `push.request/success/failure`（含 PushPlus 业务错误码）
- `backend/app/services/reminders.py` — `reminder.scan.start/due/done`、`reminder.push.failed/skipped`、`reminder.scan.error`；fetch 异常不再 500
- `backend/app/services/planner_v2.py`、`planner.py` — `plan_v2.start/result`、`breakdown.start/result`
- `backend/app/routers/parse.py`、`match_task.py` — `parse.result`、`match_task.start/result/error`（消除静默吞错）
- `backend/tests/test_observability.py` — 16 个可观测性测试
- `.env.example`、`docs/operations.md`（新增第 4 节“日志与可观测性”）、`README.md`

### 历史（本会话之外，见 SESSION 历史）
- T-020 速率限制 / T-021 真实部署验收 / T-022 AI golden set 评测：见 `.project-to-act/PROJECT_PROGRESS.md`

## Git 状态

- 当前分支 `main`；本次改动未提交（按约定需用户批准后才 `git add`/`git commit`）。
- 本次改动文件：backend 10 个 + tests 1 个 + `.env.example` / `docs/operations.md` / `README.md` / `.project-to-act/`（T-023 任务与证据、PROJECT_PROGRESS、PROJECT_ACCEPTANCE、PROJECT_OVERVIEW）+ `SESSION.md`。
- 工作树另有未跟踪文件 `agentops-health-check-2026-08-16.md`（非本次任务产物）。

## 验证结果

- 后端 pytest：148 个测试通过（132 存量 + 16 新增可观测性），退出状态 0
- 前端 Vitest：14 个文件、82 个测试通过；`npm run lint`、`npx tsc --noEmit` 通过
- 实机验证：`POST /api/v1/parse`（真实 DeepSeek）→ `.backend.log` 输出 `ai.request`(request_id=dcb71d89b7f7) → `ai.response`(1020ms) → `parse.result`(source=deepseek) → `http.request`(200)，同一 request_id 贯穿；连续第 11 次 `POST /api/v1/reminders/run` 返回 429 且被中间件记录
- 证据：E-T023-001

## Open Questions

- 后端日志未接外部日志平台/SLO 告警；`request_id` 尚未写入响应头（阶段 7 发布准备可选）。
- `app.main` 与 `app.limiter` 双层限流（既有 Open Question，未处理）。
- T-020 证据速率限制表仍列 `/api/v1/plan`（既有 Open Question，未处理）。

## 交接要点

- 后端结构化日志默认开启（`LOG_LEVEL=INFO`、`LOG_FORMAT=json`，JSON Lines 到 stderr）；关键事件清单与排查示例见 `docs/operations.md` 第 4 节。
- 隐私约定：日志只记脱敏元数据，不落用户内容/密钥；后续新增埋点必须遵守。
- 项目定义与长期状态见 `.project-to-act/PROJECT_OVERVIEW.md`
