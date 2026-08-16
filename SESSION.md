# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 已完成：Vercel Serverless 公网部署与验收（E-T024-002，2026-08-17）
- 进行中：README.md 与 docs/operations.md 更新（已上线状态 + 国内访问说明，2026-08-17）
- 上一目标：T-024 代码/测试部分（E-T024-001）；T-025 发布清单定义（E-T025-001）

## 文件索引

### 公网部署验收 / T-024
- 前端：`https://ai-schedule-web-ten.vercel.app`（Vercel 项目 `hhh-lm1/ai-schedule-web`）
- 后端：`https://ai-schedule-backend.vercel.app`（Vercel 项目 `hhh-lm1/ai-schedule-backend`，Root Directory=`backend`）
- `backend/vercel.json` — FastAPI 函数 `maxDuration=60` + 每日 Vercel Cron `0 0 * * *`
- `deploy/github-actions/reminder-cron.yml` — 5 分钟定时器示例；PAT 无 workflow scope，未推入 `.github/workflows/`
- `.project-to-act/tasks/T-024/evidence/E-T024-002.md` — 公网验收证据
- `backend/.gitignore` — Vercel CLI 自动生成，忽略 `.vercel` 与 `.env*`

### 历史（本会话之外，见 SESSION 历史）
- T-024 代码部分、T-025、T-023、T-022、T-021：见 `.project-to-act/PROJECT_PROGRESS.md`

## Git 状态

- 当前分支 `codex/vercel-serverless`；本次公网验收后的改动未提交（按约定需用户批准后才 git add/commit）。
- 待提交：`README.md`、`docs/operations.md`（最新上线状态 + 国内访问说明）、`backend/vercel.json`（新增 Vercel Cron）、`backend/.gitignore`、`.project-to-act/`（T-024 TASK 状态、E-T024-002、PROJECT_PROGRESS、PROJECT_ACCEPTANCE）+ `SESSION.md`。
- 自托管版本保留在 `deploy/self-host-001`（`c9e00d9`），`main` 未改动。

## 验证结果

- 公网健康检查、Next.js → FastAPI 代理、CORS 全部通过。
- Supabase Auth/RLS 11/11 PASS；cron 鉴权 3/3 PASS；PushPlus 推送与去重 3/3 PASS；清理 4/4 PASS。
- 真实 DeepSeek 解析：`source=deepseek`，`2026-08-19 15:00-16:00`，`category=fitness`，`location=世纪公园`。
- 后端 pytest 152 个、前端 Vitest 82 个测试此前通过（E-T024-001）。

## Open Questions

- GitHub PAT 无 workflow scope：`deploy/github-actions/reminder-cron.yml` 无法直接推入 `.github/workflows/`，需要用户加权限或网页端创建，并配置 `BACKEND_URL` / `CRON_SECRET` Secrets。
- Hobby 版 Vercel Cron 每天最多 1 次；5 分钟级提醒用 GitHub Actions。
- 阶段 7 发布 Gate G7-001 仍待项目负责人逐项确认（E-T025-001 已定义）。

## 交接要点

- 公网验收全部完成，验收测试用户与数据已清理；DeepSeek 余额已恢复，真实 AI 调用通过。
- 后续若重新部署：后端项目固定 Root Directory=`backend`，必须从仓库根目录执行 `vercel deploy --project ai-schedule-backend`，不能从 `backend/` 内再部署。
