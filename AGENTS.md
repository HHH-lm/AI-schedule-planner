# AI日程管理与个性化规划系统 Agent 工作约定

## 事实源分工

- 长期事实源：`.project-to-act/`，唯一承载项目目标、范围、功能、版本、验收、Gate 等长期状态。
- 会话记忆：`SESSION.md`（由 Coding-Tool 维护），只记录当前会话的工作信息。

## 会话开始流程

1. 先读 `.project-to-act/PROJECT_OVERVIEW.md` 取得项目定义。
2. 再读取或创建 `SESSION.md`，作为本次会话的工作记忆。
3. 按任务类型追加读取 `.project-to-act/PROJECT_PROGRESS.md`、`PROJECT_FEATURES.md`、`PROJECT_VERSIONS.md` 或 `PROJECT_ACCEPTANCE.md`。

## SESSION.md 边界

- 允许记录：当前目标、文件索引、git 状态、决策、验证结果、交接要点。
- 禁止记录：项目目标、范围、功能清单、版本、验收标准等长期状态。
- 需要引用项目级信息时只写路径，例如：`项目定义见 .project-to-act/PROJECT_OVERVIEW.md`。
- Project Brief 段落压缩为一行引用，不展开重复填写。

## Coding-Tool 适配

- Coding-Tool 首次问答中，凡 `.project-to-act/` 已有答案的项目定义问题，直接引用现有文档，不向用户重复提问。
- git 检查点、文件索引、提交建议照常执行；任何 `git add` / `git commit` 前必须获得用户批准。

## 冲突处理

- `SESSION.md` 与 `.project-to-act/` 不一致时，以 `.project-to-act/` 为准。
- 差异先记入 `SESSION.md` 的 Open Questions，确认后再更新 P2A 文档。

## 开发运行约定

- 禁止在本项目 dev server（`npm run dev`）运行时执行 `npm run build`：两者共用 `.next`，生产构建会覆盖 dev 缓存，导致页面资源 404、前端停在“加载中”。
- 需要构建时先停止 dev server，再执行 `npm run clean` 清空 `.next`，构建完成后再 `npm run dev` 或 `npm run start`。
- 已误操作后的恢复流程：停止 dev → `npm run clean` → 重新 `npm run dev`。
- `npm run build` 内置冲突检查：检测到本项目服务占用默认 Web 端口（3000-3005）时直接报错并提示恢复步骤。

## 约定范围

- 本文件为项目级约定，供所有 Agent 会话遵守；不修改全局 skill 文件。
