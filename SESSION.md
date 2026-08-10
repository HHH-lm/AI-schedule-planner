# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 按根目录 `DESIGN.md` 的设计规范重构整个项目前端页面（2026-08-10 指示）。

## 文件索引

- 修改：`src/app/globals.css`、`src/app/page.tsx`、`src/app/layout.tsx`、`src/lib/categories.ts`、`src/components/QuickAdd.tsx`、`WeekTimeline.tsx`、`TaskBoard.tsx`、`StatsView.tsx`、`SettingsModal.tsx`、`BlockModal.tsx`、`TaskModal.tsx`、`AuthModal.tsx`、`AppErrorBoundary.tsx`
- 未改功能逻辑：NLP、拖拽、撤销/重做、Supabase 云同步均保持原行为。

## Git 状态

- 当前分支 `main`，重构改动尚未提交。
- 工作区原有未跟踪文件 `DESIGN.md`，未动。

## 决策

- 将 DESIGN.md 的 Apple 风格 token 落实为全局组件类：黑色 44px 全局导航、羊皮纸 frosted 子导航、单一 Action Blue 交互色、pill 主按钮、无阴影 18px 圆角工具面板、dense-link 页脚。
- 类目色保留为低饱和数据语义色（蓝/青/绿/橙/灰），不占用交互色。
- 移动端：子导航操作横向滚动，隐藏同步徽章与导出按钮，消除 390px 视口水平溢出。

## 验证结果

- 已通过：`npm run lint`、`npx tsc --noEmit`、`npm test`（13 文件 87 测试）、`npm run build`。
- 已用 in-app 浏览器截图检查三个视图（周时间轴/任务看板/统计周报）与 390px 移动端布局，无重叠、无水平溢出。
