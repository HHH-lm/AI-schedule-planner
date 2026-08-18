# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 已完成：阶段 6 Gate 通过（G6-001，E-G6-001，2026-08-17）；T-026 生命周期账本一致性修复（E-T026-001）；Vercel Serverless 公网部署与验收（E-T024-002）
- 进行中：T-027 v0.1.0 首次发布执行（阶段 7 in_progress，revision 9）
- 进行中（本会话新增）：周计划跨天时间块支持（手动手工添加 + 自然语言解析），代码与自动测试已完成，人工验收待确认
- 进行中（本会话新增）：提醒过期 10 分钟过滤修复（F-018 修订，T-029），代码与测试已完成
- 进行中（本会话新增）：记忆"9 点之前不安排"等排除式记忆未生效修复（LLM 语义提取 + 本地兜底），代码与测试已完成
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

### 提醒过期窗口修复 / T-029
- `backend/app/services/reminders.py` — `collect_due_blocks` 只处理最近 10 分钟内的到期 `remindAt`
- `backend/tests/test_reminders.py` / `backend/tests/test_observability.py` — 过期边界与扫描事件用例
- `README.md` — 提醒过期行为说明
- `.project-to-act/tasks/T-029/` — TASK + E-T029-001 证据

### 记忆硬约束修复（本会话新增，未入账）
- 根因：`time-preference` 类记忆只作为软文本进 prompt，不产生硬约束；本地 `parse_constraint_filters` 不识别"X点之前/以前/之后/以后"表述
- `backend/app/services/planner_v2.py` — 理解层 prompt 在存在记忆时也要求 LLM 输出结构化 `constraints`；本地兜底合并显式 constraints + 排除式记忆（`_exclusion_memories` / `_fallback_constraint_sources`）
- `backend/app/services/scheduling_engine.py` — 时点正则支持"之前/以前/之后/以后"；时点命中时"晚上/下午X点"不再触发整段排除
- `backend/app/golden_ai_cases.py` — 新增 cm06（记忆驱动硬约束：9 点前不安排），golden 34 条
- 测试：`backend/tests/test_planner_v2.py`（新增）、`test_scheduling_engine.py`、`test_golden_ai_cases.py` 更新
- 真实 DeepSeek golden 评测 35/35 通过（`eval_ai_golden --provider deepseek`，含 cm06/cm07）
- 记忆应用可观测性（本会话新增）：`plan_v2.memory` 埋点（`_log_memory_application`），脱敏记录 memories_total/memories_exclusion/memory_hashes(sha1 前 8 位)/constraint_filters/constraint_source/understandings 聚合；四条路径（llm/fallback/timeout/error）均埋点

### 工作方式分块排期（本会话新增，未入账）
- 方案：扩展结构化契约维度（非单条记忆打补丁）——LLM 理解层新增 `work_style`（chunk_minutes/break_minutes）语义提取，调度引擎执行分块排期
- `backend/app/schemas.py` — 新增 `WorkStyleSpec`
- `backend/app/services/scheduling_engine.py` — `parse_work_style`（本地兜底，支持"以25分钟时间块/工作25分钟休息5分钟/中文数字"等表述）+ `_split_chunks` + `_build_task_blocks`；`schedule_tasks` 新增 `work_style` 参数，分块任务拆成多块，块间间隔仅占位防冲突、不写入休息块（时间块保持空白），硬约束按每个工作块起点校验
- `backend/app/services/planner_v2.py` — prompt 增加 `work_style` 提取指令；四条路径（llm/fallback/timeout/error）均解析并传入；`plan_v2.memory` 埋点增加 work_style/work_style_source
- `backend/app/eval_ai_golden.py` — 分块用例检查适配（all_scheduled/durations 按任务聚合，新增 work_chunk_minutes/min_chunk_gap）
- `backend/app/golden_ai_cases.py` — 新增 cm07（番茄钟分块），golden 35 条
- 测试：`test_scheduling_engine.py`（parse_work_style/分块/硬约束/不拆分）、`test_planner_v2.py`（分块 fallback + 日志）、`test_golden_ai_cases.py` 计数更新；后端全量 193 通过

### 当前时刻之后排期修复（本会话新增，未入账）
- 根因：规划范围首日（今天）按整天 06:00-23:00 生成空闲槽，晚上规划时会把任务排进已过去的白天/下午
- `backend/app/services/slot_finder.py` — `find_free_slots` 新增 `now_minutes`，规划范围首日可排起点钳制为 `max(day_start, now_minutes)`，后续日期不受影响
- `backend/app/services/scheduling_engine.py` — `schedule_tasks` 新增 `now_minutes` 参数透传
- `backend/app/schemas.py` — `PlanV2Request` 新增 `now_minutes`（0-1440）
- `backend/app/services/planner_v2.py` — 四条路径均透传 `request.now_minutes`
- `src/app/page.tsx` — `planTasks` 发送 `now_minutes: 当前本地时钟分钟数`
- 测试：`test_slot_finder.py`（首日钳制/仅首日）、`test_scheduling_engine.py`（不排过去/顺延后续日/缺省兼容）、`test_planner_v2.py`（fallback 透传）；后端全量 200 通过，前端 tsc + Vitest 91 通过

### 记忆系统前端文案调整（本会话新增，未入账）
- `src/components/MemoryModal.tsx` — "AI 分析"→"智能分析"；"AI 建议"→"候选记忆"；"来源：AI 生成"→"来源：智能生成"；空态说明"点击上方按钮，AI 会根据你的时间块数据生成记忆建议"→"点击上方按钮，系统会根据你的过往数据生成记忆建议"
- 前端 tsc + Vitest 91 + lint 通过

### 记忆分析空结果提示（本会话新增，未入账）
- 根因：`/memories/analyze` 数据不足或无规律时返回空建议且无任何提示，用户不知原因
- `backend/app/services/memory_analysis.py` — 新增 `build_analysis_message`：无数据 / 不足 5 条 / 无规律三种场景返回文案
- `backend/app/schemas.py` — `MemoryAnalysisResponse` 新增 `message` 字段
- `backend/app/routers/memories.py` — 返回时组装 message
- `src/app/page.tsx` — `runAnalysis` 在建议为空时复用 toast 弹窗展示后端 message（带本地兜底文案）
- 测试：`backend/tests/test_api.py` 新增 4 个用例（无数据/不足/无规律/正常无提示）；后端全量 204 通过，前端 tsc + Vitest 91 + lint 通过

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
- 本会话 T-029 改动已随当前提交入账（提交哈希见 `git log` HEAD）：`backend/app/services/reminders.py`、`backend/tests/test_reminders.py`、`backend/tests/test_observability.py`、`README.md`、`.project-to-act/tasks/T-029/`、`SESSION.md`。
- 此前的 README/docs/Vercel 改动已在提交 `22cf636`、`5bea748`、`6581985` 中。
- 自托管版本保留在 `deploy/self-host-001`（`c9e00d9`），`main` 未改动。

## 验证结果

- 跨天功能（E-F022-001）：后端 pytest 170、前端 Vitest 91、`tsc --noEmit`、`npm run lint`、`npm run scan:secrets` 5/5、生产构建全部通过；golden set 扩至 33 条（QuickAdd 12 / Planning 10 / Boundary 6 / CM 5）并真实 DeepSeek 33/33、`passed=true`；浏览器 DOM 验收 NLP 跨天生成两段渲染。
- 提醒过期窗口修复（T-029）：后端 pytest 171 通过（新增“提醒时间已过去超过 10 分钟不推送”边界用例）。
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
