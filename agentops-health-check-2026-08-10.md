# Agent 架构健康检查报告

- 审查对象：AI 日程管理系统
- 审查日期：2026-08-10

## 体检结论

- 判定：`risky`
- 适用模板：T3 Production Project
- 一句话结论：项目已有扎实的治理账本、证据与单元测试基线，但距离“部署后多人使用”的生产 Agent 还缺少身份隔离、可观测性、安全评测、部署运维和正式 Gate 决策，当前不能判定为生产就绪。
- 置信度：medium（产品层尚无 LLM Agent 运行时，部分生产组件按未来接入方向评估）

## 用户目标与审查边界

- 我理解的目标：把自然语言日程解析、周时间轴、任务看板等能力做成可部署、非个人独占的产品，并让项目状态可被账本与证据恢复。
- 已向用户确认的信息：历史多轮确认“后续要部署，不只个人使用”“直接在本项目中生成报告”。
- 当前假设：以 T3 生产项目为最低基线；风险等级沿用账本的 L1（内部辅助，待负责人确认）；当前 NLP 是确定性规则而非 LLM Agent。
- 不在本次审查范围内：不评估代码行级质量细节，不实施任何修复，不编写实施计划，不判断具体部署平台优劣。

## 完整架构基线

| 基线组件 | 难度要求 | 状态 | 当前证据 | 缺口 / 不需要的理由 |
|---|---|---|---|---|
| System boundary | R | weak | `PROJECT_OVERVIEW.md` 有目标、范围、非目标、L1 风险 | 项目负责人未填、数据分类未定义、风险等级仍为“待确认” |
| Task intake | R | weak | `src/lib/nlp.ts`、`nlp-samples.ts` 16 条样本 | 无意图分类、澄清/拒答规则；reject 样本记录“周八开会”等仍被解析为现状 |
| Identity/session scope | R | missing | `src/lib/storage.ts` 单 localStorage key；`supabase.ts` 使用 `schedule_state` singleton | 无 user id/session id/tenant id；部署多人后数据会全局共享 |
| Agent loop | R | missing | 无 LLM 运行时；产品为确定性解析流水线 | 规则解析不是 observe/think/act 循环；接 OpenAI 增强前需补 |
| Planner | R | missing | 任务看板是用户手动规划 | 无自动分解、依赖排序、计划修订 |
| Router | R | missing | QuickAdd 只有单一路径 `parseScheduleText` | 无任务分类、置信度阈值、回退/升级 |
| Executor | R | weak | 解析-保存有封装；storage/supabase catch 静默失败 | 无重试、超时、取消、typed error、幂等记录 |
| Reflector | R | missing | 开发流程有 review，但运行时无 | 无步骤批评、错误诊断、防覆盖事实 |
| Terminator | R | weak | 解析有固定输出与默认值 | 无“无法理解输入时拒绝”的终止策略 |
| Typed messages | R | weak | `types.ts` 定义 ParsedSchedule/TimeBlock | 无 message role、tool call、handoff 消息契约 |
| State schema | R | adequate | `types.ts` + `AppData.version` + `history.ts` reducer + storage 校验 | 有 schema 与 50 步历史，但无版本迁移逻辑 |
| Tool schema | R | weak | Supabase upsert、Obsidian URL 有函数封装 | 无输入输出 schema、typed error、幂等/副作用分类 |
| Artifact schema | R | weak | `ics.ts`、`report.ts` 有输出格式函数 | 无 owner、checksum、provenance、retention |
| Handoff schema | R | weak | `.project-to-act/tasks/*/TASK.json` 有任务包 | 无运行时 submit/accept/review 生命周期契约 |
| Model layer | R | missing | `.env.example` 预留 `OPENAI_API_KEY`，未接入 | 无模型选择、prompt 版本、structured output、fallback |
| Context assembly | R | missing | 规则解析直接处理输入 | 未来接 LLM 需要检索、排序、引用、token 预算、防污染 |
| Working memory | R | weak | React state + `HistoryState` 保存当前数据 | 无 scratchpad、active constraints、token 预算 |
| Short-term memory | R | weak | 50 步撤销历史、localStorage 持久化 | 不是会话连续性/checkpoint；刷新后恢复仅靠整包数据 |
| Long-term memory | O/R | weak | localStorage/Supabase 持久化用户数据；project-to-act 是开发期记忆 | 无写入门控、来源链接、冲突/过期规则 |
| Tool layer | R | weak | storage/supabase/obsidian 封装 | 无 least privilege、dry-run、retry、rollback、trace |
| Code/workspace sandbox | R | not-needed | 产品无代码执行工具；开发期由 Codex 沙箱承担 | 若未来 agent 写文件，需要独立沙箱与清理策略 |
| Project ledger | R | strong | `.project-to-act/` 五文档 + `AGENT_LIFECYCLE.json` revision 5，两套 validate 通过 | 账本是当前最完整模块 |
| Evidence system | R | adequate | E-T001..T004 记录命令、退出码、哈希、有效期 | `scripts/dev.sh` 与 package.json dev 脚本变更无任务/证据；E-T001 哈希已过期 |
| Gate system | R | weak | G-ADOPT-001 已记录；TASK 有 acceptance/validation | 阶段 5 Gate 未执行，无运行时操作门禁 |
| Workspace/artifacts | R | weak | 数据在 localStorage/.next/报告文件；证据有哈希 | 无 artifact store、版本/ownership；Git 无提交 |
| Agent registry | O | not-needed | 单 Agent 开发流程 | 无多 agent 运行时，暂不需要注册表 |
| Role matrix | O/R | weak | 任务有 owner、Codex/负责人建议 | 无完整 role/non-goals/tools/data access 矩阵 |
| Task routing | R | not-needed | 任务由用户/Codex 手动分配 | 无自动路由与回退；当前单 agent |
| Coordination state | R | weak | `scripts/dev.sh` 防双 dev 实例共享 .next | 有冲突缓解，无正式锁/租约/状态版本 |
| Conflict arbitration | R | weak | `INTENT.json` 有 conflicts 字段 | 无冲突分类、仲裁规则、merge/human-review 触发 |
| Handoff lifecycle | R | weak | T-ADOPT-001 有 HANDOFF.md | 无运行时 submit/accept/review/complete/fail/cancel |
| A2A boundary | O | not-needed | 无 A2A | 当前不需要 |
| MCP/tool boundary | O/R | not-needed | 无 MCP；仅预留 OpenAI key | 接入外部 API 时需定义信任边界与版本锁定 |
| Observability | R | missing | 无 trace/metrics/cost/latency | 无法回答“某次解析失败发生在哪里、为什么” |
| Evaluation | R | adequate | 9 个测试文件、60 个测试、16 条 NLP 样本 | 仅单元/回归层；无轨迹评测、红队、canary/shadow |
| Guardrails/security | R | weak | .gitignore 忽略 .env；NLP 有 reject 样本 | 无 prompt injection 测试、secret scanning、tenant bleed 防护；anon key 客户端可见 |
| Deployment/runtime | R | missing | README 说明可部署 Vercel；无部署配置 | 无健康检查、伸缩、回滚、监控、调度 |
| Operations/runbook | R | weak | README 有本地运行与质量检查命令 | 无 incident runbook、卡死恢复、坏记忆修复、漂移处理 |
| Self-evolution | R | weak | T-002/T-003/T-004 均由用户反馈驱动并补回归样本 | 无正式 feedback buffer、eval gate、canary、rollback 协议 |

## 缺失组件清单

| 优先级 | 缺失组件 | 为什么重要 | 建议补齐方式 |
|---|---|---|---|
| P0 | 阶段 5 Gate 决策 | 未执行 Gate 就不能进入阶段 6，验收标准 A-001..A-004 仍为待检查 | 负责人确认测试/类型/构建证据后记录 Gate 结果并补齐 artifacts |
| P0 | Identity/session scope | 部署多人使用后，localStorage singleton 与 Supabase singleton 会导致数据串用 | 明确单用户部署边界，或为 Supabase 增加 user_id + RLS |
| P0 | Deployment/runtime | 无部署、健康检查、回滚与监控，上线后无法诊断和恢复 | 先选择部署平台，定义 readiness/health/rollback 与发布清单 |
| P1 | Observability | 无法观测解析失败、保存失败、撤销状态与同步错误 | 增加请求级日志与最小指标（失败率、延迟、保存错误） |
| P1 | Guardrails/security | 无注入测试、密钥扫描与租户隔离评估 | 增加 NLP 注入/危险输入样本、secret 检查、数据边界测试 |
| P1 | Evaluation 扩展 | 只有单元评测，无轨迹/红队/影子评测 | 在阶段 6 补齐错误分类、回归集与红队报告 |
| P1 | 治理证据缺口 | `scripts/dev.sh`、package.json dev 脚本变更没有任务与证据，E-T001 哈希已过期 | 补 T-005 任务、写入证据、重新收集哈希并更新有效期 |
| P2 | Long-term memory/conflict | 数据无迁移、冲突与过期规则 | 为 AppData 增加迁移函数与测试 |
| P2 | Operations/runbook | 无卡死恢复与外部漂移处理 | 写一页运行手册：重启、清理缓存、回滚 |
| P2 | Model layer | 若接入 OpenAI 增强解析，无 prompt 版本与 fallback | 接入前先做结构化输出 schema 与离线评测 |

## 架构地图

| 模块 | 当前证据 | 评分 | 说明 |
|---|---|---|---|
| 治理与账本 | `.project-to-act/` 五文档、AGENT_LIFECYCLE revision 5、T-001..T-004 | strong | 项目事实源完整，能支持新会话恢复状态 |
| 证据系统 | E-T001..T004、命令/退出码/哈希/有效期 | adequate | 有真实证据，但维护有缺口 |
| NLP 解析 | `nlp.ts`、16 条样本、单元测试 | adequate | 确定性规则，无拒答与 LLM 层 |
| 状态与历史 | `types.ts`、`history.ts`、`storage.ts` | adequate | 有 reducer 与持久化，缺迁移 |
| 数据同步 | `supabase.ts` | weak | singleton 模型，无用户隔离 |
| 外部集成 | `obsidian.ts`、`ics.ts` | adequate/weak | Obsidian 有测试；ICS 暂缓未启用 |
| 评测 | 9 个测试文件、60 个测试 | adequate | 单元层强，生产评测缺 |
| 运行时平台 | 无部署配置/健康检查 | missing | 未上线 |
| 可观测性 | 无 trace/metrics | missing | 无法诊断线上问题 |
| 安全 | `.gitignore`、`supabase.ts` | weak | 无注入测试与租户边界 |

## 功能审查报告

| 功能/能力 | 是否存在 | 完整度 | 主要问题 | 建议 |
|---|---|---|---|---|
| 自然语言生成时间块 | 是 | adequate | 规则解析无法拒答，复杂句可能拆分错误 | 增加拒答与错误样本，接 LLM 前先做 schema 评测 |
| 周时间轴 | 是 | adequate | 交互无 E2E 测试 | 补关键交互回归（生成聚焦、拖拽、打卡） |
| 任务看板 | 是 | adequate | UI 层无自动测试，grid 有单元测试 | 补网格排期与拖拽的回归 |
| 统计周报 | 是 | adequate | 仅单元测试，输出正确性靠样例 | 增加更多边界样例 |
| 本地存储/同步 | 是 | weak | singleton、静默失败、无用户隔离 | 定义多用户或单用户边界，补错误上报 |
| Obsidian 关联 | 是 | adequate | 依赖本机 Obsidian | 保持测试，文档说明限制 |
| 撤销/重做 | 是 | adequate | 50 步上限正确，但快照内存未测量 | 补充大状态性能测试 |
| ICS 导出 | 代码存在 | weak | 未启用，README 已标记暂缓 | 恢复时重新验收 |

## 关键问题

| 优先级 | 问题 | 为什么重要 | 建议修复 |
|---|---|---|---|
| P0 | 阶段 5 Gate 未执行，Git 无提交 | 无法进入阶段 6，也无法绑定可复现版本 | 先建立 Git 基线，再做 Gate |
| P0 | Supabase 使用 singleton 表，无用户隔离 | 部署多人使用后数据串用风险高 | 增加 user_id/RLS 或明确单用户边界 |
| P0 | 无部署与运维配置 | 上线后没有健康检查、回滚、监控 | 制定部署清单与运行手册 |
| P1 | 无可观测性 | 故障只能靠复现，无法定位 | 加最小日志与指标 |
| P1 | 无安全评测 | 输入不可信时没有防护证据 | 补注入/危险输入样本与密钥扫描 |
| P1 | dev 脚本变更未入账本 | 证据索引与真实文件状态不一致 | 补任务与证据，更新哈希有效期 |
| P2 | 规则 NLP 无法拒答 | 用户输入无意义时仍生成默认块 | 建立拒绝规则与评测 |

## 优化建议

| 优先级 | 建议 | 预期收益 | 实施成本 | 验收方式 |
|---|---|---|---|---|
| P0 | 执行阶段 5 Gate 并建立 Git 基线 | 解锁阶段 6，可复现版本 | 低 | Gate 记录 + commit 存在 |
| P0 | 定义部署与数据边界 | 避免上线即数据串用 | 中 | 部署试运行 + 隔离测试 |
| P1 | 加最小可观测性 | 能定位解析/保存失败 | 低 | 日志样例 + 指标查询 |
| P1 | 补安全与红队样本 | 对不可信输入有防护证据 | 中 | 新评测样本全绿 |
| P1 | 补齐账本证据缺口 | 账本与文件状态一致 | 低 | 两套 validate 通过 |
| P2 | 数据迁移与长期记忆规则 | 数据结构可演进 | 中 | 迁移测试通过 |
| P2 | 接入 OpenAI 前先做评测设计 | 避免“更智能但不可测” | 中 | prompt 版本 + 结构化输出评测 |

## 下一步

1. 项目负责人确认并执行阶段 5 Gate，同步 `PROJECT_ACCEPTANCE.md` 与生命周期账本。
2. 建立 Git 提交基线，让证据绑定可复现版本。
3. 明确部署目标与用户边界（单用户本地 / 多用户云同步）。
4. 在进入阶段 6 前补齐错误分类、回归集、红队报告与可观测性基线。
5. 为 `scripts/dev.sh` 与 package.json 变更补任务与证据，更新过期哈希。

> 本报告仅作诊断与建议，未修改任何源码、配置、运行时或知识文件。
