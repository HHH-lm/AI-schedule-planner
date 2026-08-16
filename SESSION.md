# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 进行中：Vercel Serverless 形态改造（代码完成，公网部署待用户登录 Vercel），证据 E-T024-001（2026-08-16）
- 上一目标（已完成）：后端可观测性 — 结构化日志 + 关键事件，证据 E-T023-001（2026-08-16）

## 文件索引

### Serverless 改造 / T-024
- `backend/app/config.py` — 新增 `ENABLE_SCHEDULER`（默认 true）、`CRON_SECRET`、`CORS_ORIGINS`
- `backend/app/main.py` — lifespan 仅在 `enable_scheduler=True` 时启动 APScheduler；CORS 可配置
- `backend/app/routers/reminders.py` — 新增 `GET /api/v1/reminders/cron`（Bearer 鉴权，403/401/200）
- `backend/pyproject.toml` — `[tool.vercel] entrypoint = "app.main:app"`
- `backend/vercel.json` — `functions["app/main.py"].maxDuration = 60`
- `deploy/github-actions/reminder-cron.yml` — GitHub Actions 示例（复制到 `.github/workflows/` 后生效），每 5 分钟调用 cron 端点，Secrets 未配置时跳过
- `docs/operations.md` — 第 2 节 Vercel Serverless 部署指南、第 9 节自托管备选
- `backend/tests/test_reminders.py` — 新增 4 个 Serverless 测试
- `scripts/scan-secrets.sh` — 凭据赋值检查跳过 `backend/tests/**`，修复既有扫描误报

### 历史（本会话之外，见 SESSION 历史）
- 后端可观测性 / T-023：见 `SESSION.md` 历史段落与 `.project-to-act/PROJECT_PROGRESS.md`
- T-020 速率限制 / T-021 真实部署验收 / T-022 AI golden set 评测：见 `.project-to-act/PROJECT_PROGRESS.md`

## Git 状态

- 当前分支 `codex/vercel-serverless`（与 main 同 HEAD `00ca92c`）；本次改动未提交（按约定需用户批准后才 `git add`/`git commit`）。
- 本次改动文件：backend 5 个 + tests 1 个 + `.env.example` / `deploy/github-actions/reminder-cron.yml` / `README.md` / `docs/operations.md` / `scripts/scan-secrets.sh` / `.project-to-act/`（T-024 任务与证据、PROJECT_PROGRESS）+ `SESSION.md`。
- 工作树另有未跟踪文件 `agentops-health-check-2026-08-16.md`（非本次任务产物，不提交）。

## 验证结果

- 后端 pytest：152 个测试通过（148 存量 + 4 新增 Serverless），退出状态 0
- 前端 Vitest：14 个文件 82 个测试通过；`npm run scan:secrets` 5 项全部 PASS
- 本机无 Vercel CLI / 登录态，公网部署验收待用户执行

## Open Questions

- 公网 Vercel 部署需用户账号：后端 Root Directory=backend、前端根目录、环境变量按 `docs/operations.md` 第 2 节配置。
- Hobby 版 Vercel Cron 每天最多 1 次；5 分钟级提醒用 GitHub Actions（Secrets 未配置时跳过）。
- `app.main` 与 `app.limiter` 双层限流（既有 Open Question，未处理）。

## 交接要点

- 自托管版本保留在 `deploy/self-host-001`（`c9e00d9`），`main` 未改动；Serverless 改造在 `codex/vercel-serverless` 分支。
- Serverless 部署必须 `ENABLE_SCHEDULER=false` + `CRON_SECRET`，否则要么常驻调度器不会启动（Vercel 无后台进程），要么定时端点无鉴权。
- 部署前先 `git add`/`git commit`（需用户批准），再推送到 GitHub，再在 Vercel 导入。
