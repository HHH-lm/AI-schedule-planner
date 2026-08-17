# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 已完成：阶段 6 Gate 通过（G6-001，E-G6-001，2026-08-17）；T-026 生命周期账本一致性修复（E-T026-001）；Vercel Serverless 公网部署与验收（E-T024-002）
- 进行中：T-027 v0.1.0 首次发布执行（阶段 7 in_progress，revision 9）
- 进行中（本会话新增）：周计划跨天时间块支持（手动手工添加 + 自然语言解析），代码与自动测试已完成，人工验收待确认
- 上一目标：阶段 6 Gate；T-026 账本修复；T-024 代码与公网验收；T-025 发布清单定义

## 文件索引

### 生命周期账本修复 / T-026
- `.project-to-act/tasks/T-026/` — TASK/INTENT/CONTEXT + E-T026-001 + E-G6-001
- `.project-to-act/AGENT_LIFECYCLE.json` — 阶段 5 修正为 passed，阶段 6 passed，阶段 7 ready，revision=8
- `.project-to-act/PROJECT_ACCEPTANCE.md` — 补 E-T017-001 至 E-T020-001 索引 + G6-001 Gate 记录
- `.project-to-act/PROJECT_PROGRESS.md` — 补 T-020/T-026 行与进度历史
- `.project-to-act/PROJECT_FEATURES.md` — F-020 证据改为 E-T020-001

### 阶段 7 发布执行 / T-027
- `.project-to-act/tasks/T-027/` — TASK/INTENT/CONTEXT（v0.1.0 首次发布执行）
- `.project-to-act/tasks/T-027/evidence/E-T027-001.md` — 发布清单自动化部分执行证据
- `.project-to-act/AGENT_LIFECYCLE.json` — revision 9，阶段 7 in_progress
- `.project-to-act/PROJECT_OVERVIEW.md` / `PROJECT_PROGRESS.md` — 当前焦点与下一步已切换到 T-027
- `.project-to-act/PROJECT_VERSIONS.md` — 发布清单已勾选自动化项，人工项保持未勾选

### 跨天时间块支持（本会话新增）
- `src/lib/blockTime.ts` — 跨天分段、结束日期、范围重叠与时间文案辅助
- `src/components/WeekTimeline.tsx` — 周计划按天切段渲染，跨天块支持拖拽/调整
- `src/components/BlockModal.tsx` — 新增“结束日期”，结束时间早于开始时间时按次日处理
- `src/lib/report.ts` / `TodayView.tsx` / `StatsView.tsx` / `TaskBoard.tsx` / `ConflictModal.tsx` / `ics.ts` — 跨天展示与统计
- `backend/app/services/nlp.py` / `ai.py` / `conflict.py` / `slot_finder.py` / `reminders.py` / `memory_analysis.py` — 跨天解析、冲突与提醒
- 测试：`src/lib/blockTime.test.ts`、`src/lib/report.test.ts`、`backend/tests/test_nlp.py`、`test_conflict.py`、`test_api.py`、`test_ai_sanitize.py`

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

- 当前分支 `codex/vercel-serverless`；阶段 6 Gate 已提交（`925cc5b`），T-027 创建与阶段 7 启动相关改动未提交（按约定需用户批准后才 git add/commit）。
- 待提交：`.project-to-act/tasks/T-027/`、`.project-to-act/AGENT_LIFECYCLE.json`、`.project-to-act/PROJECT_OVERVIEW.md`、`.project-to-act/PROJECT_PROGRESS.md`、`.project-to-act/PROJECT_VERSIONS.md`、`.project-to-act/PROJECT_ACCEPTANCE.md`、`SESSION.md`。
- 此前的 README/docs/Vercel 改动已在提交 `22cf636`、`5bea748`、`6581985` 中。
- 自托管版本保留在 `deploy/self-host-001`（`c9e00d9`），`main` 未改动。

## 验证结果

- 跨天功能（E-F022-001）：后端 pytest 170、前端 Vitest 91、`tsc --noEmit`、`npm run lint`、`npm run scan:secrets` 5/5、生产构建全部通过；golden set 扩至 33 条（QuickAdd 12 / Planning 10 / Boundary 6 / CM 5）并真实 DeepSeek 33/33、`passed=true`；浏览器 DOM 验收 NLP 跨天生成两段渲染。
- T-027 发布清单自动化部分：pytest 152、Vitest 82、lint/tsc、scan 5/5、公网前后端健康 200、cron 未授权 401、版本号一致；Auth/RLS/DeepSeek/推送 API 复用 E-T024-002 与 E-G6-001。
- 阶段 7 已启动：`manage_lifecycle.py` revision 9、阶段 7 in_progress、T-027 入账，两套 validate 通过。
- 阶段 6 Gate：后端 pytest 152、前端 Vitest 82、lint、tsc、密钥扫描 5/5、真实 DeepSeek golden 30/30、生产构建全部通过；`manage_lifecycle.py` revision 8、阶段 6 passed、阶段 7 ready。
- T-026 修复后两套 validate 通过。
- 公网健康检查、Next.js → FastAPI 代理、CORS 全部通过。
- Supabase Auth/RLS 11/11 PASS；cron 鉴权 3/3 PASS；PushPlus 推送与去重 3/3 PASS；清理 4/4 PASS。
- 真实 DeepSeek 解析：`source=deepseek`，`2026-08-19 15:00-16:00`，`category=fitness`，`location=世纪公园`。
- 后端 pytest 152 个、前端 Vitest 82 个测试此前通过（E-T024-001）。

## Open Questions

- GitHub PAT 无 workflow scope：`deploy/github-actions/reminder-cron.yml` 无法直接推入 `.github/workflows/`，需要用户加权限或网页端创建，并配置 `BACKEND_URL` / `CRON_SECRET` Secrets。
- Hobby 版 Vercel Cron 每天最多 1 次；5 分钟级提醒用 GitHub Actions。
- 阶段 7 发布 Gate G7-001 仍待项目负责人逐项确认（E-T025-001 已定义）。
- 阶段 6 Gate G6-001 已通过；阶段 7 已启动（T-027），发布清单 A-I 与 G7-001 待执行。
- 跨天支持真实 DeepSeek golden 33/33 已通过（E-F022-001）；拖拽与跨周渲染待人工确认（浏览器自动化受限）。

## 交接要点

- 公网验收全部完成，验收测试用户与数据已清理；DeepSeek 余额已恢复，真实 AI 调用通过。
- 阶段 6 Gate 已通过，阶段 7 已启动（T-027，revision 9）；下一步按 `PROJECT_VERSIONS.md` 发布清单 A-I 执行 v0.1.0 首次发布，G7-001 待项目负责人逐项确认。
- 后续若重新部署：后端项目固定 Root Directory=`backend`，必须从仓库根目录执行 `vercel deploy --project ai-schedule-backend`，不能从 `backend/` 内再部署。
