# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 完成：定义阶段 7 发布清单与发布 Gate（v0.1.0），证据 E-T025-001（2026-08-16）
- 上一目标（已完成）：后端可观测性 — 结构化日志 + 关键事件，证据 E-T023-001

## 文件索引

### 发布清单与发布 Gate / T-025
- `.project-to-act/PROJECT_VERSIONS.md` — v0.1.0 发布清单（A~I 九组，可逐项勾选）与下一版本计划
- `.project-to-act/PROJECT_ACCEPTANCE.md` — 新增验收标准 A-008、Gate 记录 G7-001（状态待执行）、验收记录条目、证据索引 E-T025-001
- `.project-to-act/PROJECT_OVERVIEW.md` — 当前焦点更新为阶段 7 发布准备（v0.1.0）
- `.project-to-act/PROJECT_PROGRESS.md` — 任务表新增 T-025、下一步追加第 9 条、进度历史追加
- `.project-to-act/tasks/T-025/` — TASK.json 与证据 E-T025-001

### 前置已完成（本会话之外）
- T-024 Vercel Serverless 改造（E-T024-001，公网部署验收待执行）
- T-023 后端可观测性（E-T023-001）；T-021 真实部署验收；T-022 AI golden set
- 历史任务见 `.project-to-act/PROJECT_PROGRESS.md`

## Git 状态

- 当前分支 `main`；最新提交 `a7a1bfd`（T-024 Vercel Serverless 改造）。
- 本次 T-025 改动未提交（按约定需用户批准后才 git add/commit）：`.project-to-act/PROJECT_VERSIONS.md`、`PROJECT_ACCEPTANCE.md`、`PROJECT_OVERVIEW.md`、`PROJECT_PROGRESS.md`、`SESSION.md`、`.project-to-act/tasks/T-025/`。

## 验证结果

- 后端 pytest：152 个测试通过
- 前端 Vitest：14 个文件 82 个测试通过
- 证据：E-T025-001（G7-001 Gate 状态为待执行，未伪造通过）

## Open Questions

- G7-001 发布 Gate 待项目负责人逐项勾选发布清单后执行（当前无公网验收环境，未到执行时机）。
- T-024 公网 Vercel 部署验收待用户登录 Vercel 后执行（既有遗留）。

## 交接要点

- 发布执行基准 = `.project-to-act/PROJECT_VERSIONS.md` 的 v0.1.0 发布清单；执行指南见 `docs/operations.md`。
- Gate 结果只记录在 `.project-to-act/PROJECT_ACCEPTANCE.md`；无新鲜证据不得写"通过"。
- 项目定义与长期状态见 `.project-to-act/PROJECT_OVERVIEW.md`
