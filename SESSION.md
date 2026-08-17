# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 已完成：T-026 生命周期账本一致性修复（E-T026-001，2026-08-17）；Vercel Serverless 公网部署与验收（E-T024-002，2026-08-17）
- 进行中：无（等待用户确认是否继续阶段 6 Gate / 阶段 7 发布执行）
- 上一目标：T-024 代码与公网验收（E-T024-001/E-T024-002）；T-025 发布清单定义（E-T025-001）

## 文件索引

### 生命周期账本修复 / T-026
- `.project-to-act/tasks/T-026/` — TASK/INTENT/CONTEXT + E-T026-001
- `.project-to-act/AGENT_LIFECYCLE.json` — 阶段 5 修正为 passed，revision=7，阶段 6 补录 T-005 至 T-025
- `.project-to-act/PROJECT_ACCEPTANCE.md` — 补 E-T017-001 至 E-T020-001 索引与验收记录
- `.project-to-act/PROJECT_PROGRESS.md` — 补 T-020 行与进度历史
- `.project-to-act/PROJECT_FEATURES.md` — F-020 证据改为 E-T020-001

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
- 本会话 T-026 改动未提交（按约定需用户批准后才 git add/commit）。
- 待提交：`.project-to-act/tasks/T-026/`、`.project-to-act/AGENT_LIFECYCLE.json`、`.project-to-act/PROJECT_ACCEPTANCE.md`、`.project-to-act/PROJECT_PROGRESS.md`、`.project-to-act/PROJECT_FEATURES.md`、`SESSION.md`。
- 此前的 README/docs/Vercel 改动已在提交 `22cf636`、`5bea748`、`6581985` 中。
- 自托管版本保留在 `deploy/self-host-001`（`c9e00d9`），`main` 未改动。

## 验证结果

- T-026 修复后 `manage_lifecycle.py validate`（revision 7）与 Project-to-Act `--validate` 均通过。
- 公网健康检查、Next.js → FastAPI 代理、CORS 全部通过。
- Supabase Auth/RLS 11/11 PASS；cron 鉴权 3/3 PASS；PushPlus 推送与去重 3/3 PASS；清理 4/4 PASS。
- 真实 DeepSeek 解析：`source=deepseek`，`2026-08-19 15:00-16:00`，`category=fitness`，`location=世纪公园`。
- 后端 pytest 152 个、前端 Vitest 82 个测试此前通过（E-T024-001）。

## Open Questions

- GitHub PAT 无 workflow scope：`deploy/github-actions/reminder-cron.yml` 无法直接推入 `.github/workflows/`，需要用户加权限或网页端创建，并配置 `BACKEND_URL` / `CRON_SECRET` Secrets。
- Hobby 版 Vercel Cron 每天最多 1 次；5 分钟级提醒用 GitHub Actions。
- 阶段 7 发布 Gate G7-001 仍待项目负责人逐项确认（E-T025-001 已定义）。
- 阶段 6 Gate G6-001 尚未正式执行；账本修复后阶段 6 为 in_progress，阶段 7 仍为 pending。

## 交接要点

- 公网验收全部完成，验收测试用户与数据已清理；DeepSeek 余额已恢复，真实 AI 调用通过。
- T-026 完成后生命周期账本已恢复脚本可维护状态；下一步是阶段 6 Gate（G6-001），再启动阶段 7 执行 G7-001。
- 后续若重新部署：后端项目固定 Root Directory=`backend`，必须从仓库根目录执行 `vercel deploy --project ai-schedule-backend`，不能从 `backend/` 内再部署。
