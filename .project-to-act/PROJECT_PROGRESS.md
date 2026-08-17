# 项目进度

> 记录当前执行状态与有效工作节点；普通查看、搜索和无状态变化的命令不写入。

## 当前任务

| 任务 | 状态 | 负责人 | 完成条件 | 证据 ID | 最后更新 |
|---|---|---|---|---|---|
| T-ADOPT-001 采用既有项目进入生命周期账本 | 已完成 | 未指定 | 生命周期账本创建并验证通过 | E-ADOPT-001 | 2026-08-08 |
| T-001 建立确定性逻辑单元测试基线 | 已完成 | Codex（建议项目负责人确认） | test/lint/build 通过并写入证据 | E-T001-001 | 2026-08-09 |
| T-002 周时间轴自然语言周几语义修复 | 已完成 | Codex（建议项目负责人确认） | 周几解析回归测试通过并写入证据 | E-T002-001 | 2026-08-09 |
| T-003 生成后自动聚焦新时间块区域 | 已完成 | Codex（建议项目负责人确认） | 生成后切换周并滚动聚焦通过测试 | E-T003-001 | 2026-08-09 |
| T-004 阶段 5 功能迭代（NLP、Obsidian、待排期拖拽、撤销重做、点击空白新建） | 已完成 | Codex（建议项目负责人确认） | 功能迭代自动测试通过并写入证据 | E-T004-001 | 2026-08-09 |
| T-005 Supabase 云同步数据隔离（user_id 单用户边界） | 已完成 | Codex（用户确认边界决策） | 用户隔离测试通过并写入证据 | E-T005-001 | 2026-08-10 |
| T-006 部署与运维配置（健康检查、部署清单、运行手册） | 已完成 | Codex（用户确认） | 健康检查探测通过并写入证据 | E-T006-001 | 2026-08-10 |
| T-007 可观测性（结构化日志、错误边界、关键事件） | 已完成 | Codex（用户确认） | 日志与错误边界测试通过并写入证据 | E-T007-001 | 2026-08-10 |
| T-008 安全评测（注入/危险输入样本与密钥扫描） | 已完成 | Codex（用户确认） | 安全样本与扫描全部通过并写入证据 | E-T008-001 | 2026-08-10 |
| T-009 账本一致性（dev 脚本变更入账与哈希刷新） | 已完成 | Codex（用户确认） | 实例复用验证通过并写入证据 | E-T009-001 | 2026-08-10 |
| T-010 NLP 拒答规则与评测 | 已完成 | Codex（用户确认） | 拒答评测通过并写入证据 | E-T010-001 | 2026-08-10 |
| T-011 Supabase Auth 登录式多租户隔离（auth.uid() + RLS） | 已完成 | Codex（用户确认） | Auth 改造验证通过并写入证据 | E-T011-003 | 2026-08-10 |
| T-012 AI API 解析服务（OpenAI / DeepSeek 双提供商与本地回退） | 已完成 | Codex（用户指令） | API 路由与双提供商测试通过并写入证据 | E-T012-001 | 2026-08-10 |
| T-013 FastAPI/Python 后端重构（AI 解析、拆解、规划、冲突检测、AI 调用迁移到后端） | 已完成 | Codex（用户指令） | 后端 pytest + 前端测试 + 代理联动验证通过并写入证据 | E-T013-001 | 2026-08-10 |
| T-014 移动端今日待办视图与移动/桌面双布局 | 已完成 | Codex（用户指令） | 前端测试 + tsc + lint + build + 双端截图验证通过并写入证据 | E-T014-001 | 2026-08-11 |
| T-015 FastAPI 定时提醒与微信推送 | 已完成 | Codex（用户指令） | 后端 pytest 34 个测试通过 + 提醒端点探测通过并写入证据 | E-T015-001 | 2026-08-11 |
| T-016 今日待办四象限（紧急/重要矩阵）与新建任务象限选择 | 已完成 | Codex（用户指令） | 前端测试 + tsc + lint + build + 注入数据截图验证通过并写入证据 | E-T016-001 | 2026-08-11 |
| T-017 微信提醒默认开始前 5 分钟自动预填（F-018 修订） | 已完成 | Codex（用户反馈） | 前端测试 + tsc + lint + build 通过并写入证据 | E-T017-001 | 2026-08-11 |
| T-018 修复微信提醒 remindAt 保存链路（F-018 修订） | 已完成 | Codex（用户反馈定位） | 云端核查 + 前端测试 + tsc + lint + build 通过并写入证据 | E-T018-001 | 2026-08-11 |
| T-019 修复 PushPlus 业务错误码误判为推送成功（F-018 修订） | 已完成 | Codex（用户反馈定位） | PushPlus 实测 + 后端 pytest 36 个测试通过并写入证据 | E-T019-001 | 2026-08-11 |
| T-020 风险等级升级 L2、数据分类定义、API 速率限制、README 增强、周时间轴→周计划统一命名 | 已完成 | Codex（用户指令） | 后端 pytest 95 个测试 + 前端 Vitest 82 个测试通过并写入证据 | E-T020-001 | 2026-08-13 |
| T-021 真实部署环境验收清单（Auth/RLS、真实 AI、微信推送） | 已完成 | Codex（用户指令） | 真实 Supabase/DeepSeek/PushPlus 端到端断言全部通过并写入证据 | E-T021-001 | 2026-08-16 |
| T-022 AI 解析质量度量（30 条 golden set：10 QuickAdd + 10 Planning + 5 边界 + 5 Constraint/Memory + 回归门禁） | 已完成 | Codex（用户指令） | 评测命令通过 + 真实 DeepSeek 30/30 + 证据入账 | E-T022-001 | 2026-08-16 |
| T-023 后端可观测性（结构化日志 + 关键事件：AI 慢/失败、推送失败可查） | 已完成 | Codex（用户指令） | 后端 148 测试 + 实机日志验证 + 证据入账 | E-T023-001 | 2026-08-16 |
| T-024 Vercel Serverless 形态改造（FastAPI Python Function + Cron 端点 + GitHub Actions 定时器 + 部署手册） | 已完成 | Codex（用户指令） | 后端 152 测试 + 前端 82 测试 + 密钥扫描 5/5 PASS + 公网 Vercel 部署与 Auth/RLS/AI/推送验收全部通过 | E-T024-001, E-T024-002 | 2026-08-17 |
| T-025 定义阶段 7 发布清单与发布 Gate（v0.1.0） | 已完成 | Codex（用户指令） | 发布清单写入 PROJECT_VERSIONS.md + G7-001 定义待执行 + 证据入账 | E-T025-001 | 2026-08-16 |
| T-026 生命周期账本一致性修复（阶段 5 状态、阶段 6 任务/证据、验收/进度/功能索引） | 已完成 | Codex（用户指令） | 两套 validate 通过并写入证据 | E-T026-001 | 2026-08-17 |
| T-027 v0.1.0 首次发布执行（阶段 7 发布清单 + G7-001 发布 Gate） | 进行中 | Codex（用户指令）；发布确认人：项目负责人 | 发布清单 A-I 全部完成 + G7-001 记录 + 证据入账 | 待补充 | 2026-08-17 |

## 阻塞项

| 阻塞 | 影响 | 解除条件 | 状态 |
|---|---|---|---|
| 无已知阻塞 | 无 | 不适用 | 无 |

## 下一步

1. T-027 已创建并启动阶段 7（revision 9）：按 `PROJECT_VERSIONS.md`「v0.1.0 发布清单」A-I 执行首次发布（G7-001 待项目负责人逐项勾选）。
2. 发布前待办：启用 GitHub Actions 5 分钟定时器（PAT 增加 workflow scope + 配置 `BACKEND_URL`/`CRON_SECRET`）、Supabase 每日备份与恢复演练、外部健康探测、SLO 基线记录、A-001/A-002 人工对照确认。
3. AI 解析 golden set 已建立（E-T022-001）：后续 prompt/模型变更必须重跑 `npm run eval:ai:golden`。

## 进度历史

按时间倒序追加：日期、完成事项、证据 ID、遗留问题、下一步和确认来源。不要覆盖旧记录。

- 2026-08-17：T-027 创建并启动阶段 7：生命周期账本 revision 9、阶段 7 in_progress；任务契约、意图与上下文已写入 `.project-to-act/tasks/T-027/`；下一步按发布清单 A-I 执行。遗留问题：G7-001 与人工确认待完成。来源：用户指令。
- 2026-08-17：阶段 6 Gate 通过（G6-001）：后端 pytest 152、前端 Vitest 82、lint、tsc、密钥扫描 5/5、真实 DeepSeek golden 30/30、生产构建全部通过；构建前已停止 dev server 并执行 clean；生命周期账本 revision 8、阶段 6 passed、阶段 7 ready。证据 E-G6-001。遗留问题：A-001/A-002 人工对照待确认；G7-001 发布 Gate 与发布清单待执行。下一步：创建 T-027 启动阶段 7，执行 v0.1.0 首次发布。来源：用户指令。
- 2026-08-17：T-026 生命周期账本一致性修复完成：修正 AGENT_LIFECYCLE.json 阶段 5 非法状态 completed 为 passed 并补工件 E-T004-003 证据文件；revision 从失配的 14 对齐到 6 条既有转换记录后由 CLI 补记阶段 6 启动转换（rev 7）；阶段 6 taskIds/evidenceIds 补录 T-005 至 T-025 与对应 E-T 证据；PROJECT_ACCEPTANCE 补 E-T017-001 至 E-T020-001 索引，PROJECT_PROGRESS 补 T-020 行，PROJECT_FEATURES F-020 证据改为 E-T020-001；manage_lifecycle validate 与 Project-to-Act validate 均通过。证据 E-T026-001。遗留问题：G7-001 发布 Gate 待执行；GitHub Actions 定时器、备份演练、外部探测、SLO、A-001/A-002 待办。下一步：阶段 6 Gate 与阶段 7 发布执行。来源：用户指令。
- 2026-08-17：T-024 公网部署验收完成（补记 UTC 2026-08-16T19:20Z）：Vercel CLI 登录后创建 `ai-schedule-backend`（Root Directory=backend）与 `ai-schedule-web` 两个项目并生产部署；公网健康检查、Next.js → FastAPI 代理、CORS；真实 Supabase Auth/RLS 11 项、cron 鉴权 3 项、PushPlus 推送与去重 3 项、清理 4 项全部 PASS；DeepSeek 充值后真实解析返回 `source=deepseek`；`backend/vercel.json` 增加每日 Vercel Cron 兜底并重新部署；测试用户与数据已清理。证据 E-T024-002。遗留问题：GitHub Actions 5 分钟定时器因 PAT 无 workflow scope 未推入 `.github/workflows/`，示例在 `deploy/github-actions/reminder-cron.yml`；Hobby 版 Vercel Cron 每天 1 次。下一步：用户给 PAT 加 workflow scope 或网页端创建 workflow，并配置 `BACKEND_URL`/`CRON_SECRET` Secrets。来源：用户指令（执行部署检查 + DeepSeek 充值后真实 AI 调用）。
- 2026-08-16：T-025 定义阶段 7 发布清单与发布 Gate：发布清单写入 `.project-to-act/PROJECT_VERSIONS.md`（A 质量门禁 / B 版本产物 / C 环境变量与密钥 / D 数据与 Supabase / E 部署拓扑 / F 真实公网验收 / G 监控可观测性 / H 回滚风险 / I 人工确认与 Gate 执行），执行指南引用 `docs/operations.md`；`PROJECT_ACCEPTANCE.md` 新增 A-008 验收标准与 G7-001 Gate 记录（状态待执行，未伪造通过）；后端 pytest、前端 Vitest 保持通过。证据 E-T025-001。遗留问题：清单未执行，G7-001 发布 Gate 待项目负责人逐项勾选后确认。下一步：按清单执行公网部署与真实验收。来源：用户指令。
- 2026-08-16：T-024 Vercel Serverless 改造（代码部分）：新增 `ENABLE_SCHEDULER` / `CRON_SECRET` / `CORS_ORIGINS` 配置，lifespan 仅在 `enable_scheduler=True` 时启动 APScheduler；新增 `GET /api/v1/reminders/cron`（Authorization Bearer 鉴权）；`backend/pyproject.toml` 配置 `[tool.vercel] entrypoint`、`backend/vercel.json` 配置 `maxDuration=60`；新增 `deploy/github-actions/reminder-cron.yml` 示例（复制到 `.github/workflows/` 后每 5 分钟定时触发）；`docs/operations.md` 第 2 节改为 Vercel Serverless 部署指南并保留自托管第 9 节；后端 152 测试（新增 4 Serverless 测试）、前端 82 测试、密钥扫描 5/5 PASS。证据 E-T024-001。遗留问题：公网 Vercel 部署未执行（本机无 Vercel CLI/登录态）。下一步：用户登录 Vercel 后按手册部署并跑公网验收清单。来源：用户指令。
- 2026-08-16：完成 T-023 后端可观测性：后端从“无日志可查”升级为 JSON Lines 结构化日志（`app/logging_setup.py`），HTTP 中间件记录 `http.request`（method/path/status/duration_ms，含 429），AI 调用记录 `ai.request/response/timeout/error`，推送记录 `push.request/success/failure`（含 PushPlus 业务错误码），提醒扫描记录 `reminder.scan.*`/`reminder.push.*`，`request_id` 贯穿单次请求；`match_task` 静默吞错改为记录 `match_task.error`；`reminders` fetch 异常不再 500 而是记录 `reminder.scan.error` 并安全返回；后端 148 测试（新增 16 可观测性测试）、前端 82 测试、lint/tsc 全部通过，实机 DeepSeek 解析日志含完整 request_id 链路。证据 E-T023-001。遗留问题：未接外部日志平台/SLO 告警；request_id 未写入响应头。下一步：人工验收与阶段 7 发布准备。来源：用户指令。
- 2026-08-16：完成 T-022 AI 解析质量度量：golden set 重构为 10 QuickAdd + 10 Planning + 5 边界异常 + 5 Constraint/Memory，新增 `app.eval_ai_golden` 评测命令；评测发现并修复 weekday_label 周日错标、晚上偏好按时段中点误判、记忆未应用到全部任务；真实 DeepSeek 四类均 100%，后端 132 测试与前端 82 测试通过。证据 E-T022-001。遗留问题：无。下一步：prompt/模型变更后重跑评测，继续人工验收与阶段 7 发布准备。来源：用户指令。
- 2026-08-16：完成 T-021 真实部署环境验收：生产模式启动 `next start` + uvicorn；真实 Supabase Auth/RLS 15 项断言通过（创建/登录/错误密码、跨用户读/写/删隔离、anon 拦截、service_role 审计）；真实 DeepSeek 解析返回 `source=deepseek`；真实 PushPlus 推送 `pushed=1, errors=[]`、`reminder_log` 去重生效；验收数据与测试用户已清理。证据 E-T021-001。遗留问题：A-001/A-002 人工对照待确认，阶段 7 发布准备待进行。下一步：人工验收与发布准备。来源：用户指令。
- 2026-08-11：完成 T-019 修复 PushPlus 判定：直测发现未实名认证时 PushPlus 返回 HTTP 200 但业务 `code 905`，旧实现误记成功；改为解析响应校验 `code == 200`，905 不计成功不落库，并清理 3 条假成功记录；后端 pytest 36 个测试通过；用户实名后实测评测返回 code 200，`reminders/run` 返回 `pushed:3`。证据 E-T019-001。遗留问题：无；下一步：用户确认微信实际收到消息。来源：用户反馈定位。
- 2026-08-11：完成 T-018 修复微信提醒保存链路：`saveBlock` 遗漏 `remindAt` 导致云端全部时间块无提醒时间；修复后编辑保存保留 `remindAt`，NLP/AI 新块与待排期拖拽落点自动写默认提醒；Supabase 核查确认根因，`npm test` 13 文件 60 个测试、lint/tsc/build 全部通过。证据 E-T018-001。遗留问题：云端旧时间块需编辑保存一次或批量迁移。下一步：用户刷新页面保存测试块后人工验收真实微信推送。来源：用户反馈定位。
- 2026-08-11：完成 T-017 微信提醒默认行为修订（F-018 修订）：BlockModal 未设置提醒时自动预填“开始前 5 分钟”，修改日期/开始时间时自动重算（跨天回落到前一天），手动修改后保留手动值，清空则关闭；`npm test` 13 文件 59 个测试、lint/tsc/build 全部通过。证据 E-T017-001。遗留问题：无；旧时间块需编辑保存一次后获得提醒。下一步：人工验收与阶段 7 发布准备。来源：用户反馈。
- 2026-08-11：完成 T-016 今日待办四象限：新增 `TaskQuadrant` 与 `Task.priority`，任务弹窗可选象限，今日待办按紧急/重要矩阵分组（移动端单列、桌面端 2x2），任务看板显示象限色点；`npm test` 13 文件 57 个测试、lint/tsc/build 全部通过，Playwright 注入四象限+旧数据截图验证分组正常。证据 E-T016-001。遗留问题：无；下一步：人工验收与阶段 7 发布准备。来源：用户指令。
- 2026-08-11：完成 T-015 定时提醒与微信推送：`TimeBlock.remindAt` + BlockModal 提醒输入；后端 APScheduler 每 5 分钟扫描 Supabase 到期待提醒的时间块，`reminder_log` 去重；支持企业微信机器人 / PushPlus / Server酱；`/api/v1/reminders/{status,run}`；后端 pytest 34 个测试、前端 test/lint/tsc/build/scan 全部通过，实际启动后端探测 status/run 返回符合预期。证据 E-T015-001。遗留问题：真实微信通道推送需部署环境配置 webhook/token 后人工验收。下一步：人工验收与阶段 7 发布准备。来源：用户指令。
- 2026-08-11：完成 T-014 移动端今日待办视图：新增 `TodayView`，移动端（<768px）单列卡片流、桌面端（>=768px）双栏仪表盘，应用默认打开今日待办；`npm test` 52 个测试、lint/tsc/build（Turbopack）全部通过，Playwright 移动端 390x844 与桌面 1440x900 截图验证通过。证据 E-T014-001。遗留问题：提醒/微信推送尚未实施；下一步：可继续 PWA 安装、提醒与微信通道。来源：用户指令。
- 2026-08-10：完成 T-013 FastAPI/Python 后端重构：新增 `backend/`（FastAPI 路由与服务：NLP、AI 调用、冲突检测、任务拆解、时间规划），前端通过 `/api/v1/*` 代理调用，移除前端本地 NLP/AI/冲突检测实现，dev 脚本同时启动 8000/3000；`pytest` 22 个测试、`npm test` 52 个测试、lint/tsc/build/scan 全部通过，dev 联动验证 DeepSeek 解析成功。证据 E-T013-001。遗留问题：FastAPI 与前端需同时部署，`BACKEND_URL` 需在部署环境配置；真实 OpenAI 调用待部署环境验收。下一步：人工验收与阶段 7 发布准备。来源：用户指令。
- 2026-08-10：T-012 修订：AI 解析超时与失败反馈优化。请求默认 15 秒超时（`AI_TIMEOUT_MS` 可配置），`max_tokens=1000`，提示词精简；超时或失败时 QuickAdd 显示明确错误并保留输入，不再静默回退本地规则（仅未配置 Key 时回退）。`npm test` 14 个文件 105 个测试、lint/tsc/build/scan 全部通过。证据 E-T012-002。遗留问题：真实长句解析耗时受模型响应速度影响，超时后需重试或简化输入。下一步：人工验收与阶段 7 发布准备。来源：用户反馈。
- 2026-08-10：完成 T-012 AI API 解析服务：`POST /api/parse` 支持 OpenAI / DeepSeek（可配置模型与 Base URL），设置页可选解析服务，QuickAdd 异步调用并在未配置 Key/接口失败时回退本地 NLP；`npm test` 14 个文件 103 个测试、lint/tsc/build/scan 全部通过。证据 E-T012-001。遗留问题：真实服务商 API 调用需部署环境人工验收。下一步：人工验收与阶段 7 发布准备。来源：用户指令。
- 2026-08-10：T-011 修订：Auth 错误提示完善，密码策略/泄露/常见密码映射中文原因，未知错误展示原文；87 个测试、lint/tsc/build 通过。证据 E-T011-003。遗留问题：真实 Auth/RLS 待部署环境验收。来源：用户反馈（注册失败时提示过于笼统）。
- 2026-08-10：T-011 修订：登录入口改为始终显示，未配置 Supabase 时点击弹窗提示配置环境变量；87 个测试、lint/tsc/build 通过。证据 E-T011-002。遗留问题：真实 Auth/RLS 待部署环境验收。来源：用户反馈（顶部未看到登录入口）。
- 2026-08-10：完成 T-011 Supabase Auth 登录式多租户隔离：AuthModal 登录/注册/登出、`user_id` 取 `auth.uid()`、schema.sql 启用 RLS、未登录保持本地模式；`npm test` 87 个测试、lint/tsc/build/scan 全部通过。证据 E-T011-001。遗留问题：真实 Email Auth 与 RLS 需部署环境人工验收，旧 text user_id 表需迁移。下一步：人工验收与阶段 7 发布准备。来源：用户确认升级（每人登录、每人一库）。
- 2026-08-10：完成 T-010 NLP 拒答规则与评测：纯函数 `detectRejectReason`/`hasMeaningfulName`，拒绝 empty/garbage/invalid_weekday/missing_action/detached_location；QuickAdd 显示具体原因；`npm test` 86 个测试、lint/tsc/build 通过。证据 E-T010-001。遗留问题：名称有效性不识别纯数字/emoji。下一步：人工验收与阶段 7 发布准备。来源：用户 P2 清单。
- 2026-08-10：完成 T-009 账本一致性：dev 脚本防多实例变更补录任务与证据，`bash -n`、两次 `npm run dev` 实例复用验证通过；全量关键文件哈希刷新，E-T001-001 标记过期。证据 E-T009-001。遗留问题：无。下一步：NLP 拒答。来源：用户 P1 清单 + agentops 健康检查。
- 2026-08-10：完成 T-008 安全评测：注入/超长/控制字符样本与 Obsidian 协议编码评测；`npm run scan:secrets` 5 项全部 PASS；`npm test` 74 个测试、lint/tsc 通过。证据 E-T008-001。遗留问题：扫描模式需随凭据格式补充。下一步：账本一致性。来源：用户 P1 清单。
- 2026-08-10：完成 T-007 可观测性：结构化 JSON 日志、AppErrorBoundary、初始化/NLP/Supabase 关键事件；`npm test` 65 个测试、lint/tsc/build 通过。证据 E-T007-001。遗留问题：未接外部日志平台。下一步：安全评测。来源：用户 P1 清单。
- 2026-08-10：完成 T-006 部署与运维配置：新增 `GET /api/health`、`docs/operations.md` 运行手册，生产构建与本地探测通过。证据 E-T006-001。遗留问题：外部 uptime 探测需公网地址。下一步：可观测性。来源：用户 P0 清单。
- 2026-08-10：完成 T-005 Supabase 云同步数据隔离：读写按 user_id 隔离，未配置用户 ID 禁用云同步；提供 RLS 加固 SQL 与单用户边界文档；`npm test` 63 个测试、`npx tsc --noEmit` 通过。证据 E-T005-001。遗留问题：真正多租户需后续接入 Supabase Auth + RLS。下一步：部署与运维配置。来源：用户 P0 清单。
- 2026-08-10：建立 Git 基线提交 `2e1ad62`；阶段 5 Gate 执行通过（`npm test` 60 个测试、`npx tsc --noEmit`、`npm run lint`、`npm run build` 全部通过）。证据 E-T004-003。遗留问题：A-001/A-002 人工对照待确认。下一步：进入阶段 6，逐项处理用户 P0/P1/P2 清单。来源：用户指示（先建立 Git 基线，再做 Gate）。
- 2026-08-09：完成 T-004 阶段 5 功能迭代：NLP 独立地点与带空格时间解析、Obsidian 关联与跳转、待排期任务拖拽、撤销/重做、点击时间轴空白新建，移除冗余手动入口；`npm test` 60 个测试、`npx tsc --noEmit` 通过。证据 E-T004-001。遗留问题：阶段 5 Gate 未执行。下一步：负责人确认 Gate。来源：用户反馈与自动验证。
- 2026-08-09：完成 T-003，自然语言生成后自动切换到新块所在周并滚动聚焦，短暂高亮；`npm test` 60 个测试、lint、build 全部通过。证据 E-T003-001。遗留问题：阶段 5 Gate 未执行。下一步：负责人确认 Gate。来源：用户反馈与自动验证。
- 2026-08-09：完成 T-002 周几语义修复，周几解析从展示周改为当前时间起算；`npm test` 55 个测试、lint、build 全部通过。证据 E-T002-001。遗留问题：阶段 5 Gate 未执行。下一步：负责人确认 Gate。来源：用户反馈与自动验证。
- 2026-08-09：完成 T-001 测试基线，新增 Vitest 测试、ESLint 配置、NLP 评测样本与 `test` 脚本。证据 E-T001-001。遗留问题：阶段 5 Gate 未执行。来源：T-001 合同与自动验证。
- 暂无记录。
