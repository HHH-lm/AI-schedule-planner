# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 处理 P2：NLP 拒答规则与评测（用户 2026-08-10 指示）。
- 目标：无意义输入不再生成默认时间块；QuickAdd 给出明确拒绝反馈；拒答规则做成可测试的纯函数。

## 文件索引

- 修改：`src/lib/nlp.ts`、`src/lib/__fixtures__/nlp-samples.ts`、`src/lib/nlp.test.ts`、`src/components/QuickAdd.tsx`、`docs/security.md`
- 新增：`src/lib/nlp-reject.test.ts`、`SESSION.md`
- 账本：`.project-to-act/`（T-010 任务与 E-T010-001 证据待补）

## Git 状态

- 当前分支 `main`，最近提交 `b72c79f`（T-009 账本一致性）。
- T-011 Supabase Auth 多租户隔离已完成验证（87 个测试、lint、tsc、build、scan 通过），T-011 证据与账本已同步，等待用户批准后提交。

## 决策

- Supabase 云同步从显式 user_id 升级为登录式多租户：`user_id` 取 `auth.uid()`，schema.sql 启用 RLS。
- 新增 AuthModal（登录/注册/登出）；未登录保持本地模式。
- 旧 text user_id 表需按 schema.sql 注释迁移为 uuid。

## 验证计划

- 已完成：`npm test`（13 文件 87 测试）、`npm run lint`、`npx tsc --noEmit`、`npm run build`、`npm run scan:secrets` 全部通过。
- 已生成 T-011 证据并同步 `.project-to-act/`；提交前请用户批准。
