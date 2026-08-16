# AI日程管理与个性化规划系统 Agent 架构健康检查报告

检查时间：2026-08-08
检查方式：只读审查，未修改源码、配置或运行时文件

## 体检结论

- 判定：risky（不是 ready）
- 适用模板：T3 Production Project
- 一句话结论：界面完整、规则解析可用，但 agent/生产层组件几乎未建，当前只能作为原型，不能判定为可发布。
- 置信度：medium（用途已确认：后续要部署，不只个人使用）

## 用户目标与审查边界

- 我理解的目标：把 AI日程管理与个性化规划系统从个人原型推进到可验证、可部署的多用户产品。
- 已向用户确认的信息：后续能够部署，不只个人使用；报告保存在本项目。
- 当前假设：按 T3 Production Project 审计，身份隔离、评测、可观测性均为必需项。
- 不在本次审查范围内：项目治理账本本身的维护流程（只引用其存在作为证据）、UI 细节、Next.js 框架选型。

## 完整架构基线

| 基线组件 | 难度要求(T3) | 状态 | 当前证据 | 缺口 / 不需要的理由 |
|---|---|---|---|---|
| 系统边界 | required | weak | PROJECT_OVERVIEW.md 有目标、范围、非目标 | 无明确自主权级别、数据分类、停止条件 |
| 任务输入 | required | weak | QuickAdd.tsx、nlp.ts | 只有规则解析，无意图分类、澄清、拒绝和成功标准 |
| 身份/会话边界 | required | missing | supabase.ts 使用单例表 | 无用户/会话/租户 ID，多用户会互相覆盖 |
| Agent 循环 | required | missing | 无 | 单次确定性解析，没有 observe/plan/act/review 循环 |
| 规划器 | required | missing | 无 | 无任务分解、依赖和计划修订 |
| 路由器 | required | missing | 无 | 无任务/工具选择、置信度阈值和转人工 |
| 执行器 | required | weak | storage.ts、supabase.ts 有读写封装 | 无校验、重试、超时、取消、类型化错误 |
| 反思器 | required | missing | 无 | 无步骤复盘和失败诊断 |
| 终止器 | required | missing | 无 | 无完成条件、最大迭代、卡死处理 |
| 类型化消息 | required | missing | 无消息协议 | 只有领域数据对象，不是消息契约 |
| 状态 Schema | required | adequate | types.ts | 字段完整，但无 reducer/合并规则和版本迁移 |
| 工具 Schema | required | missing | 无 | Supabase/存储操作无输入输出契约 |
| 工件 Schema | required | missing | ics.ts 未启用 | 无版本、checksum、owner、保留策略 |
| 交接 Schema | not-needed | intentionally-not-needed | 单 agent 无交接 | 未来多 agent 才需要 |
| 模型层 | required | missing | README 声称 OpenAI 可选，但代码无调用 | 文档与实现不一致，能力边界不可信 |
| 上下文组装 | required | missing | 无 | 无检索、排序、引用、token 预算 |
| 工作记忆 | required | adequate | page.tsx React state | 单页应用足够；无 scratchpad 和预算概念 |
| 短期记忆 | required | weak | localStorage 持久化 | 无会话语义、checkpoint、恢复 |
| 长期记忆 | required | weak | localStorage + Supabase 单例 | 无写门、来源链接、遗忘和冲突规则 |
| 工具层 | required | weak | Supabase/localStorage 封装 | 无最小权限、dry-run、审批、幂等、回滚 |
| 代码沙箱 | not-needed | intentionally-not-needed | 无代码执行工具 | 前端应用不执行外部代码 |
| 项目账本 | required | strong | .project-to-act/ 五文档 + AGENT_LIFECYCLE.json | 结构完整且已验证 |
| 证据系统 | required | adequate | tasks/T-ADOPT-001/evidence/E-ADOPT-001.md | 有 ID、哈希、时间、位置；产品级声明大多无证据 |
| Gate 系统 | required | weak | manage_lifecycle.py 阶段 Gate | 开发治理有 Gate，运行时操作无 Gate |
| 工件/工作区 | required | weak | .project-to-act 证据文件 | 无统一工件版本、checksum、所有权 |
| Agent 注册表 | optional | intentionally-not-needed | 单 agent | 多 agent 前不需要 |
| 角色矩阵 | optional | intentionally-not-needed | 单 agent | 同上 |
| 任务路由 | optional | intentionally-not-needed | 单 agent | 同上 |
| 协调状态 | optional | intentionally-not-needed | 单 agent | 同上 |
| 冲突仲裁 | optional | intentionally-not-needed | 单 agent | 同上 |
| 交接生命周期 | optional | intentionally-not-needed | 单 agent | 同上 |
| A2A 边界 | not-needed | intentionally-not-needed | 无跨系统 agent | 无 A2A 需求 |
| MCP/工具边界 | optional | intentionally-not-needed | Supabase 为直接集成 | 接入 OpenAI/MCP 前可选 |
| 可观测性 | required | missing | 无 traces、日志、指标 | 无法定位解析错误、存储失败、成本 |
| 评测 | required | missing | 无测试文件 | 核心 NLP 解析器零评测，无法回归 |
| 护栏/安全 | required | weak | 无 LLM 输入所以注入面小 | 无 schema 校验、密钥管理、RLS 审计；部署后风险上升 |
| 部署/运行时 | required | weak | Next.js + PWA + Vercel 指南 | 无健康检查、回滚、监控 |
| 运维手册 | required | missing | 无 | 无卡死恢复、事故响应、坏数据修复 |
| 自我进化 | optional | intentionally-not-needed | 无 | 反馈回灌机制未建立前不需要 |

## 缺失组件清单

| 优先级 | 缺失组件 | 为什么重要 | 建议补齐方式 |
|---|---|---|---|
| P0 | 评测系统 | nlp.ts 是整个产品的 AI 核心，却没有任何测试或样本集，无法证明质量、也无法防回归 | 建立 20 条左右评测样本（正常/边界/拒绝场景）并写单元测试 |
| P0 | 模型层声明与实现一致 | README 写“可选接入 OpenAI API”，代码里没有任何 OpenAI 实现，误导用户和后续开发 | 删除该宣称，或实现最小服务端 API 层并保留本地规则降级 |
| P1 | 身份与会话隔离 | Supabase 用单例表 schedule_state，任何持 key 的人都读写同一份数据 | 部署前加 Supabase Auth、RLS 和按用户行隔离；或明确仅私有单用户 |
| P1 | 状态迁移与校验 | AppData.version 存在但从未使用，损坏数据静默失败 | 增加写入校验、版本迁移、本地/远端冲突策略 |
| P1 | 可观测性 | 没有错误日志、操作记录和指标，故障无法定位 | 增加最小错误日志和关键操作 trace |
| P2 | 护栏/安全 | 接入 OpenAI 后用户文本将进入模型，无拒绝策略和密钥边界 | 输入策略、密钥只放服务端、RLS、审计 |
| P2 | 运维手册 | 无回滚和恢复路径 | 建立最小 runbook：数据损坏、同步失败、发布回退 |

## 架构地图

| 模块 | 当前证据 | 评分 | 说明 |
|---|---|---|---|
| 前端界面 | WeekTimeline、TaskBoard、StatsView 等 6 组件 | adequate | 功能齐全但未验收 |
| NLP 解析 | nlp.ts 规则解析时间、地点、类目 | weak | 可用但零评测，未接入模型 |
| 数据持久化 | storage.ts + supabase.ts | weak | 有读写，无校验/迁移/冲突/重试 |
| 项目治理 | .project-to-act/ 全套文件 | strong | 证据门和生命周期账本已建立 |
| 运行时控制 | 无 | missing | 无循环、规划、路由、终止条件 |
| 可观测与评测 | 无 | missing | 无测试、日志、指标 |

## 功能审查报告

| 功能/能力 | 是否存在 | 完整度 | 主要问题 | 建议 |
|---|---|---|---|---|
| 自然语言生成时间块 | 是 | 弱 | 无评测集、无模型回退、无拒绝策略 | 建样本集并写单测 |
| 周时间轴 | 是 | 中 | 拖拽/拉伸无测试 | 加状态回归测试 |
| 任务看板 | 是 | 中 | 双向联动无测试 | 同上 |
| 统计周报 | 是 | 中 | 计算逻辑无测试 | 为 report.ts 加单元测试 |
| 本地存储 | 是 | 弱 | 静默失败、无版本迁移 | 加校验与迁移 |
| Supabase 同步 | 是 | 弱 | 单例表无隔离、无冲突策略 | 加 RLS 和合并规则 |
| OpenAI 增强 | 否 | 缺失 | 只有 README 宣称，无代码 | 实现或移除该宣称 |
| ICS 导出 | 是 | 弱 | 已实现但注释掉未启用 | 明确是否纳入范围 |
| PWA 离线 | 是 | 弱 | service worker 存在，无离线验收 | 部署前验证 |

## 关键问题

| 优先级 | 问题 | 为什么重要 | 建议修复 |
|---|---|---|---|
| P0 | 核心解析器没有测试 | 无法证明质量，也无法防回归 | 建评测集 + 单测，Gate 5 前必须通过 |
| P0 | README 宣称 OpenAI API 但代码不存在 | 能力边界失实，影响决策 | 删除宣称或实现最小 API 层 |
| P1 | Supabase 单例数据无用户隔离 | 一旦部署，多用户互相覆盖 | 加 Auth/RLS 或明确单用户私有 |
| P1 | 数据写入静默失败、无迁移 | 用户日程可能无感知丢失 | 加校验、迁移、错误提示 |
| P1 | 无任何观测和评测 | 故障无法定位、发布无依据 | 补日志、指标和回归集 |
| P2 | 项目治理已建立但 Gate 5 未通过 | 当前账本状态诚实，但不能宣称完成 | 按 T-001 建立测试基线后再 Gate |

## 优化建议

| 优先级 | 建议 | 预期收益 | 实施成本 | 验收方式 |
|---|---|---|---|---|
| P0 | 为 nlp.ts、date.ts、report.ts 写单元测试和 20 条样本集 | 核心质量可证明、可回归 | 低 | npm test 通过，覆盖正常/边界/拒绝场景 |
| P0 | 对齐 README 与实现：实现或移除 OpenAI API | 能力边界可信 | 中 | README 与代码一致 |
| P1 | Supabase 加 Auth/RLS 或锁定单用户 | 防止多用户数据覆盖 | 中 | 双用户并发测试不互相覆盖 |
| P1 | 数据 schema 校验与版本迁移 | 防止静默损坏 | 低 | 坏 JSON 不丢数据，迁移有测试 |
| P1 | 加最小观测：错误日志 + 关键操作 trace | 故障可定位 | 低 | 模拟失败可复现日志 |
| P2 | 建立 Git 基线并推进 Gate 5 | 证据可绑定版本 | 低 | git log + lifecycle validate 通过 |

## 下一步

1. 确认用途与风险边界：已确认后续要部署给真实用户，按 T3 执行。
2. 优先解决 P0：建立 nlp.ts 评测集和单元测试，这是阶段 5 Gate 的最小证据。
3. 本报告只做诊断，不包含实施改动；实施建议需作为独立任务另行执行。
