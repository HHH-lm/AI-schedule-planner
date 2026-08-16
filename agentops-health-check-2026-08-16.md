# AI日程管理与个性化规划系统 · Agent 架构健康检查报告

> 检查方式：只读审计 + 本地冒烟验证（`pytest` 120 通过 / `vitest` 14 文件 82 通过）。未修改任何源文件、配置或运行文件。
> 依据：`.project-to-act/` 全部文档、`backend/app/`、`src/`、`docs/`、`scripts/`、`supabase/schema.sql`、Git 状态。

## 体检结论

- **判定：risky（可上线，但上线前有必须补齐的缺口）**
- **适用模板：T3 生产级项目（个人所有、公网部署、真实集成、简历演示）**，T1 个人助理为功能下限，T0/T2 不适用，T4 明确不需要
- **一句话结论**：这是一个**"个人助理级架构 + 生产级工程纪律"的混合体**——项目账本、证据门、测试、安全基线远超一般个人项目，但**真实环境验收、AI 输出质量评测、后端可观测性**三块在"公网部署 + 简历演示"这个目标下是硬缺口，且当前工作树存在未入账的未提交变更。
- **置信度：high**（用户已确认：主要自己用 + 简历演示，不开放注册给陌生人）

## 用户目标与审查边界

- **我理解的目标**：对照完整 Agent 体系基线找组件缺口；按 T0–T4 五个难度判断"该做什么 / 不该过度设计什么 / 上线前必须补齐什么"。
- **已向用户确认的信息**：
  1. 上线后**主要自己使用**，包含简历演示，**不开放注册给陌生人**；
  2. 项目文档 `.project-to-act/PROJECT_OVERVIEW.md` 已声明：风险等级 L2、公开 GitHub + 简历展示、阶段 6 上线准备中。
- **当前假设**：
  1. 上线形态 = 公网部署的 Web 应用（Vercel + FastAPI 自托管），简历访客可访问首页/功能演示，但不会批量注册使用；
  2. 数据敏感度按文档 L2 执行（邮箱/推送凭据高敏感，日程中敏感）；
  3. 未来不打算扩展为多 Agent / 团队协作产品，也不开放多用户注册。
- **不在本次审查范围内**：功能 UX 设计（DESIGN.md）、具体算法正确性、第三方服务 SLA、开放注册场景的企业级治理。

---

## 完整架构基线（T3 视角）

| 基线组件 | 难度要求 | 状态 | 当前证据 | 缺口 / 不需要的理由 |
|---|---|---|---|---|
| 系统边界 | required | **present（strong）** | `PROJECT_OVERVIEW.md`：目标/范围/非目标/风险 L2/数据分类 | 边界清晰，非目标明确 |
| 任务摄入 | required | **present** | `routers/parse.py` + `services/nlp.py`：拒答（empty/garbage/invalid_weekday/missing_action/detached_location）、2000 字上限 | 无意图分类器，但任务类别单一（日程/拆解/规划/匹配），够用 |
| 身份/会话隔离 | required | **present** | `supabase/schema.sql` RLS + `src/lib/supabase.ts`（auth.uid()）；未登录本地模式 | 真实 Auth/RLS 未在部署环境验证；本地模式无隔离（个人单机可接受） |
| Agent loop | required(轻量) | **intentionally-lightweight** | 非自主 ReAct 循环；是"用户触发 → 服务管道 → 返回"的确定性流程（`planner_v2.py` 架构注释） | 本产品不需要自主循环；正确的做法，不是缺口 |
| Planner | required | **present（strong）** | `services/scheduling_engine.py` 七维评分 + `validator.py` 校验 + 超时回退本地 | 规划失败有明确回退链 |
| Router | lightweight | **present（轻量）** | `resolve_ai_provider`：openai→deepseek→local 三级回退 | 无置信度阈值/拒绝升级；对 4 个端点够用 |
| Executor | required | **present** | pydantic schema、15s 超时、`max_tokens=1000`、限流 | 无幂等键（除 reminder_log 去重） |
| Reflector | optional | **weak** | `memory_analysis.py` 统计反思用户模式；无步骤级自我批评 | T3 可选；现有"记忆建议"已覆盖主要价值 |
| Terminator | required | **present** | 固定响应模式；APScheduler `max_instances=1, coalesce`；AI 调用超时/上限 | 无无限循环风险 |
| 类型化消息 | required | **present** | `backend/app/schemas.py` + `src/lib/types.ts` | — |
| 状态 schema | required | **present** | AppData 类型、`STORAGE_KEY v1`、Supabase upsert onConflict | 无正式迁移框架（v1 单版本可接受） |
| 工具 schema | required | **present** | API 路由 + pydantic 校验；`reminder_log` 去重；PushPlus `code==200` 判定 | 写操作幂等性局部覆盖 |
| 工件 schema | optional | **weak** | `src/lib/report.ts` Markdown 周报即时生成，无版本/校验和/保留策略 | T3 可选；导出物非核心资产 |
| 交接 schema | not-needed | **intentionally-not-needed** | 无多 Agent | 单 Agent 产品 |
| 模型层 | required | **present（strong）** | `services/ai.py`：双提供商、结构化 JSON、sanitize 白名单、超时/失败回退 | **prompt 无版本 ID，无法与评测结果关联** |
| 上下文组装 | required | **present** | 记忆上下文 + 约束过滤 + 已有日程注入（`planner_v2`） | 无排序/引用；输入长度有上限 |
| 工作记忆 | required | **present** | 请求内上下文（目标/记忆/约束/已有块） | — |
| 短期记忆 | required | **present** | localStorage 会话延续 + 50 步撤销栈（`history.ts`） | 非聊天产品，无对话摘要需求 |
| 长期记忆 | required(轻量) | **present（设计良好）** | `memory_service.py`/`memory_analysis.py`：**AI 只生成 pending 建议，用户采纳才 active**（MemoryModal `onAcceptSuggestion`）、最小样本量 5/9/10、置信度 | 无遗忘/衰减规则、无来源链接持久化（T3 可选） |
| 工具层 | required | **present** | 限流、密钥仅服务端环境变量、用户审批门（记忆采纳）、undo/redo 回滚 | 无 dry-run；外部写（微信推送）无人工预审（推送本身低危） |
| 代码/工作区沙箱 | not-needed | **intentionally-not-needed** | 应用不执行用户代码 | — |
| 项目账本 | required | **present（strong）** | `.project-to-act/`：概览/进度/功能/版本/验收/证据/决策日志 | 唯一事实源，覆盖完整 |
| 证据系统 | required | **present（strong）** | 证据 ID、命令、退出码、文件哈希、有效期、Gate 结果（E-T004-003 等） | — |
| 门系统 | required | **present** | 阶段 Gate（T-004 通过）、test/lint/build/tsc 门、A-001/A-002 人工门待确认 | **发布 Gate 未定义（阶段 7 未开始）** |
| 工作区/工件 | lightweight | **weak** | 周报导出无版本/校验和；ICS 已取消 | 对 T3 可接受 |
| Agent registry | not-needed | **intentionally-not-needed** | 单 Agent | — |
| 角色矩阵 | not-needed | **intentionally-not-needed** | 单 Agent | — |
| 任务路由 | not-needed | **intentionally-not-needed** | 端点级路由已够 | — |
| 协调状态 | not-needed | **intentionally-not-needed** | — | — |
| 冲突仲裁 | not-needed | **intentionally-not-needed** | 日程冲突检测是业务功能，非多 Agent 仲裁 | — |
| 交接生命周期 | not-needed | **intentionally-not-needed** | — | — |
| A2A 边界 | not-needed | **intentionally-not-needed** | — | — |
| MCP/工具边界 | not-needed | **intentionally-not-needed** | 直接调用第三方 API；无 MCP | 不要引入 MCP，属过度设计 |
| 可观测性 | required | **weak** | 前端 `logger.ts` JSON 日志；后端仅 `reminders.py` 有 `logger.warning`，**main.py 无日志配置**；无 trace/指标/成本 | **上线后 AI 慢/失败/推送失败不可见，是硬缺口** |
| 评测 | required | **weak** | 单元测试极强（120+82）；NLP 拒答样本、危险输入样本；**但无 AI 解析/规划质量的 golden-set 评测、无 prompt 回归评测** | **AI 输出质量没有度量，是硬缺口** |
| 守卫/安全 | required | **present（strong）** | `security.test.ts`、`scan-secrets.sh`、RLS、限流、输出白名单 sanitize | 残余：用户文本进第三方 AI 的 prompt 注入（有输出清洗缓解）；本地模式无服务端校验 |
| 部署/运行 | required | **present** | `docs/operations.md`、健康端点、APScheduler、dev/build 防冲突脚本 | 无灰度/回滚演练记录；提醒任务依赖常驻进程（文档已注明 Serverless 需改 cron） |
| 运维手册 | required | **present** | `docs/operations.md` 部署/监控/回滚/备份/事故 | 手册存在但**未演练** |
| 自进化 | optional | **weak（合适）** | 记忆建议 = 候选变更 + 人工审批，符合"轻量自进化" | 无 eval gate/回滚，T3 可选，当前形态合理 |

---

## 缺失组件清单（按上线影响排序）

| 优先级 | 缺失组件 | 为什么重要 | 建议补齐方式（建议，未实施） |
|---|---|---|---|
| P0 | 真实环境验收证据 | 全部 AI/Auth/RLS/推送验证目前都在本地 mock/代理层完成（文档多处标注"待部署环境人工验收"） | 部署到真实环境后跑一遍：登录→RLS 读写→AI 真实调用→微信推送→断网回退，每条记录证据 ID |
| P0 | AI 输出质量评测集（golden set） | 目前"评测"只有拒答与安全样本，**没有解析准确率/规划可接受率度量**，无法判断 AI 版本退化；简历演示时 AI 质量直接影响观感 | 建 30–50 条中文日程语料（含边界），断言解析结果；规划场景做 10–20 条可接受性断言；每次改 prompt 跑回归 |
| P0 | 后端可观测性 | 前端有 JSON 日志，后端几乎无日志；AI 调用失败/超时/推送失败上线后不可查 | 后端加结构化日志（请求/模型/耗时/成本/失败原因）、关键事件（parse/plan/push 成功失败）、可选接一个免费日志平台 |
| P0 | 发布 Gate 定义 | 阶段 7 发布准备未开始；PROJECT_VERSIONS 无发布条件 | 定义 0.1.0 发布清单：质量门 + 真实环境验收 + 备份验证 + 回滚步骤演练 |
| P1 | 工作树未提交变更未入账 | `git status` 显示 6 个文件未提交（scheduling_engine/planner_v2/page.tsx 等 206 行新增），SESSION.md 称"提交检查已完成"但实际未提交，与账本状态不一致 | 按项目约定先获用户批准再提交，并把变更补入账本与证据 |
| P1 | prompt 版本化 | `build_system_prompt`/规划 prompt 内嵌在代码，无版本 ID，无法关联评测结果 | prompt 增加 `PROMPT_VERSION` 常量或注释 ID，改动入账 |
| P1 | E2E/冒烟测试 | 只有单元测试 + 手动截图；无浏览器级冒烟 | 至少 1 条 Playwright 冒烟（打开→输入中文→生成时间块→打卡），上线前跑一次 |
| P2 | 提醒推送失败监控 | 有重试与日志，但失败无上限无告警 | 推送连续失败 N 次记 ERROR 并支持手动重跑（已有 `/reminders/run`） |
| P2 | 限流双实例 | SESSION.md Open Question：`main.py` 与 `limiter.py` 各建 Limiter 实例，双层兜底 | 上线前合并为单一实例或确认双层行为符合预期 |
| not-needed | 数据删除/导出、注册滥用防护、推送成本上限 | 用户已确认不开放注册，仅自己 + 简历访客使用 | 不需要实现，避免过度设计 |

---

## 难度模板判断（用户核心问题）

### 实际难度定位：**T3 生产级（个人所有、不开放注册）**

触发理由（取最高档）：公网部署 + 真实集成（OpenAI/DeepSeek、Supabase、微信推送）+ 写外部状态（推送消息、云端数据）+ 面向真实访客。同时保留 T1 个人助理的全部组件为功能下限。因不开放注册，**不会触达 T4 的企业级治理需求**。

### 该做什么（各难度对照）

| 难度 | 判定 | 说明 |
|---|---|---|
| T0 简单对话 | 不适用 | 项目远超此级；无自主对话循环是**正确**的，不是缺口 |
| T1 个人助理 | **已达标（≈95%）** | 工具层、审批门（记忆采纳）、短期/长期记忆、轻量账本、评测、隐私防护全部到位；补上 AI 评测集即满 |
| T2 娱乐项目 | 不适用 | 无游戏/角色扮演/状态体验需求 |
| T3 生产级 | **基本达标，3 项硬缺口** | 账本/证据/门/安全已达标；缺：真实环境验收、AI 质量评测、后端可观测性 + 发布 Gate |
| T4 企业级多 Agent | **明确不需要** | 见下方"不该过度设计" |

### 不该过度设计什么（按确认的"自己用 + 简历演示"目标，明确建议不要做）

1. **多 Agent 体系**（registry / 角色矩阵 / 任务路由 / 交接 / 冲突仲裁 / A2A）：单用户产品没有任何收益，纯增复杂度。
2. **MCP server / 工具协议层**：当前直接调第三方 API 已够；引入 MCP 属于为架构而架构。
3. **企业级治理**（SSO、RBAC、审计合规、租户配额、成本分摊、开放注册防护）：不开放注册，全部不需要；已有 RLS + Auth 已属超额投资，可作为简历亮点，**不要再扩展**。
4. **完整自进化闭环**（候选变更 → 沙箱 → eval gate → canary → 回滚）：现有"统计 → 建议 → 人工采纳"是正确的最小闭环。
5. **复杂 RAG / 向量检索长期记忆**：当前结构化记忆 + 置信度 + 最小样本量设计已匹配需求。
6. **Prometheus/Grafana/APM 监控全家桶**：结构化日志 + 健康检查 + 免费日志平台足够；个人项目上全套监控是过度设计。
7. **自主 Agent loop / 自动执行**：让系统自主改日程、自主推送，超出你的风险边界（L2 不匹配），应保持"用户触发 + 用户确认"。

### 上线前必须补齐（P0 级，缺任一不建议发布 0.1.0）

1. **真实环境端到端验收**（Supabase Auth+RLS、真实 AI 调用、微信推送）并写入证据；
2. **A-001/A-002 人工验收确认**（账本中明确"待项目负责人最终确认"）；
3. **AI 解析质量 golden-set 评测**（哪怕 30 条语料）；
4. **后端结构化日志 + AI 调用失败可见性**；
5. **0.1.0 发布 Gate 清单 + 回滚演练**（`docs/operations.md` 从"文档"变"已验证"）；
6. **提交当前未提交变更并入账**（否则发布基线不干净）。

---

## 架构地图

| 模块 | 当前证据 | 评分 | 说明 |
|---|---|---|---|
| 摄入/边界 | `parse.py`、`nlp.py`、PROJECT_OVERVIEW | strong | 拒答与长度控制完善 |
| 规划管道 | `planner_v2.py`→`scheduling_engine.py`→`validator.py` | strong | LLM 理解 + 规则调度分离，超时回退链清晰 |
| 模型层 | `services/ai.py` | adequate | 双提供商 + 回退 + sanitize；缺 prompt 版本 |
| 记忆 | `memory_analysis.py`、`MemoryModal.tsx` | strong | 写门 + 置信度 + 最小样本量 |
| 提醒/推送 | `reminders.py`、`push.py` | adequate | 去重、业务码校验、重试；缺失败告警 |
| 多租户 | `supabase/schema.sql`、`supabase.ts` | adequate | RLS 正确；未真实环境验证 |
| 账本/证据/门 | `.project-to-act/*` | strong | 全项目最成熟的部分 |
| 安全 | `security.test.ts`、`scan-secrets.sh`、`docs/security.md` | strong | 覆盖注入/密钥/协议白名单 |
| 可观测性 | `logger.ts` vs 后端无日志 | weak | 前后端不对称，后端是盲区 |
| 评测 | `test_*`（120+82） | weak→adequate | 单元强、AI 质量评测缺 |

---

## 功能审查报告

| 功能/能力 | 是否存在 | 完整度 | 主要问题 | 建议 |
|---|---|---|---|---|
| 自然语言解析 | ✅ | 高 | 无准确率评测集 | 建 golden set |
| AI 任务拆解 | ✅ | 中 | 同上；无拆解质量度量 | 纳入评测集 |
| AI 时间规划（V2） | ✅ | 高 | 七维评分有测试；真实 AI 理解层未部署验证 | 真实环境验收 |
| 冲突检测 | ✅ | 高 | — | — |
| 记忆系统 | ✅ | 高 | 无遗忘/衰减（可选） | 暂不做 |
| 定时提醒/微信推送 | ✅ | 中高 | 失败无监控告警；Serverless 需 cron | 加失败上限 + 告警 |
| Supabase 多租户同步 | ✅ | 中 | 未真实环境验证；旧表迁移需执行 | 部署验收 |
| 统计周报 | ✅ | 高 | 导出物无版本（可选） | 暂不做 |
| 撤销/重做 | ✅ | 高 | — | — |
| Obsidian 集成 | ✅ | 中高 | 依赖本机 Obsidian（已知） | 保持 |
| ICS 导出 | ❌ 已取消 | — | 有意暂缓 | 保持置灰 |

---

## 关键问题

| 优先级 | 问题 | 为什么重要 | 建议修复 |
|---|---|---|---|
| P0 | 全部"真实环境验收"未做 | 公网部署 + 简历展示意味着真实访客会踩到本地没暴露的问题（Auth 邮件、RLS 权限、AI 配额、CORS） | 部署后逐项验收并入账 |
| P0 | AI 输出无质量度量 | 无法证明"解析/规划可靠"，也无法在改 prompt 后防退化；简历演示直接展示 AI 能力 | 30–50 条 golden set + 回归 |
| P0 | 后端不可观测 | 上线后 AI 慢/失败/推送失败无日志可查，等于盲飞 | 结构化日志 + 关键事件 |
| P1 | 6 个文件未提交、账本不一致 | SESSION.md 声称已检查但工作树仍有 206 行变更；发布基线不干净 | 批准后提交 + 入账 |
| P1 | 发布 Gate 未定义 | 0.1.0 无"可发布"的判定标准 | 定义发布清单并执行 |
| P2 | 限流双实例 | 行为未确认，可能限流不符合预期 | 合并或确认 |

---

## 优化建议（按性价比排序）

| 优先级 | 建议 | 预期收益 | 实施成本 | 验收方式 |
|---|---|---|---|---|
| 1 | 后端结构化日志 + AI/推送关键事件 | 上线后可排障、可展示工程能力 | 低（半天） | 本地触发一次 AI 失败，日志可定位 |
| 2 | AI 解析 golden set（30–50 条） | 质量可度量、prompt 可防退化、简历演示有说服力 | 中（1 天） | 评测命令通过 + 证据入账 |
| 3 | 提交未提交变更 + 账本同步 | 基线干净，Gate 可信 | 低 | git status 干净 + 证据 ID |
| 4 | 定义 0.1.0 发布 Gate 并演练回滚 | 发布可控 | 中 | 发布清单逐项打勾 + 回滚演练记录 |
| 5 | 真实环境验收清单 | 消除最大不确定性 | 中（需部署环境） | 每项证据 ID |
| 6 | prompt 版本化 | 与评测结果关联 | 低 | 改动后回归通过 |
| 7 | 单条 Playwright 冒烟 | 补单元测试盲区 | 中 | CI/手动跑通 |

---

## 下一步

1. （P0）先**提交当前 6 个未提交文件并入账**（按项目约定需你批准）。
2. （P0）在真实部署环境跑验收清单：Supabase Auth/RLS、真实 AI 调用、微信推送端到端，逐项记录证据。
3. （P0）补 AI 解析 golden set 与后端结构化日志，二者是"上线前必须补齐"中成本最低收益最高的两项。
4. （P0）定义 0.1.0 发布 Gate，把 `docs/operations.md` 的回滚/备份从文档变成演练记录。
5. 完成后可判定从 risky → ready，再进入阶段 7 发布。
