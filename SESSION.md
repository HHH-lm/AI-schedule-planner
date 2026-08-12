# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 记忆系统增强：记忆启用/停用功能 + 用户数据隔离确认（2026-08-12 指示）。

## 文件索引

- 新增：`src/components/MemoryModal.tsx`（记忆 CRUD 模态框，含分类标签过滤、添加/编辑/删除）
- 新增：`src/lib/memory.test.ts`（19 个测试，覆盖创建、过滤、CRUD 操作、启用/停用）
- 新增：`backend/app/routers/memories.py`（`POST /api/v1/memories/context` 格式化记忆上下文）
- 修改：`src/components/SettingsModal.tsx`（新增 `onOpenMemory` 回调和"记忆系统"管理入口按钮）
- 修改：`src/lib/types.ts`（新增 `MemoryCategory`、`MemorySource`、`Memory`、`MemoryCandidate` 类型，`AppData` 增加 `memories`/`memoryCandidates` 字段）
- 修改：`src/app/page.tsx`（导航栏"记忆"按钮已移除，改为通过设置页打开；`MemoryModal` 集成、`saveMemory`/`deleteMemory` 回调）
- 修改：`backend/app/main.py`（注册 `memories` 路由）

## Git 状态

- 当前分支 `main`，针对本次记忆系统的新增文件未提交。

## 决策

- 记忆数据与 `AppData` 共存，走 localStorage + Supabase 同步，与现有数据持久化策略一致。
- 后端 `POST /api/v1/memories/context` 接收前端记忆列表，格式化后供 AI 规划使用，记忆本身不保存在后端。
- 四类别设计：`time-preference`（时间偏好）、`habit`（习惯）、`life-preference`（生活/工作偏好）、`long-term-constraint`（长期约束）。
- `source` 区分 `user`（用户主动管理）和 `ai-candidate`（AI 候选，后续阶段实现）。
- 记忆新增 `active` 字段，默认 `true`；停用的记忆在后端 context API 中自动过滤，不参与 AI 规划。
- 记忆数据通过 `AppData` 随 Supabase 同步，已通过 `auth.uid()` RLS 实现用户隔离。

## 验证结果

- 已通过：`npm test`（14 文件 79 个测试）、`npx tsc --noEmit`、`npm run lint`、`backend pytest`（36 个测试）。
- 未做浏览器实测：需刷新后点击导航栏"记忆"按钮，添加/编辑/删除记忆，验证分类标签过滤和 CRUD 效果。

## 交接要点

- 项目定义与长期状态见 `.project-to-act/PROJECT_OVERVIEW.md`。
- 记忆系统第一阶段功能已实现，后续可扩展 AI 自动生成候选记忆并展示在 `MemoryModal` 中。
- 后端 `POST /api/v1/memories/context` 已就绪，可在 `plan.py` 中引用记忆上下文优化 AI 规划。
