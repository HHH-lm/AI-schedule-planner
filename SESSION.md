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
- T-010 改动与账本更新已完成验证（86 个测试、lint、tsc、build 通过），等待用户批准后提交。

## 决策

- 拒答规则实现为 `detectRejectReason` / `hasMeaningfulName` 纯函数。
- `parseScheduleText` 保持原 API；新增 `parseScheduleWithFeedback` 返回拒绝原因供 UI 使用。
- 拒绝类别：`empty`、`garbage`、`invalid_weekday`、`missing_action`、`detached_location`。

## 验证计划

- 已完成：`npm test`（13 文件 86 测试）、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。
- 已生成 T-010 证据并同步 `.project-to-act/`；提交前请用户批准。
