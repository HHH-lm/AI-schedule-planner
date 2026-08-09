# AI 日程管理系统

AI 拆解宏观计划，双视图落地微观执行。

## 项目状态

- 当前阶段：阶段 5（具体功能与纵向切片开发）
- 版本：`0.1.0`（未发布，尚未通过阶段 5 Gate 验收）
- 自动测试基线：Vitest 60 个测试通过，类型检查通过（2026-08-09）

## 核心功能

### 周时间轴

- 周一至周日 24 小时时间轴
- 拖拽移动与拉伸调整时长
- 完成打卡
- 地点标注、类目颜色区分
- 点击时间轴空白处新建时间块，自动预填日期与开始时间

### 自然语言生成

中文句子自动解析为时间块，例如：

> 周二下午2点到5点写代码，地点深圳湾；周三上午10点健身

- 支持独立地点与带空格时间解析
- “周几”从当前时间起算下一个指定星期几（含当天）
- 生成后自动切换到新块所在周，滚动聚焦并短暂高亮

### 宏观任务看板

- 任务列表 + 14 天日期网格
- 拖拽任务到日期列完成排期；未排期任务可直接拖到所在日期网格，按 15 分钟刻度落点
- 子任务拆解与勾选
- 任务与时间块双向联动

### Obsidian 关联

- 时间块支持粘贴 Obsidian 链接并自动解析
- 通过 `obsidian://open` 跳转到对应笔记

### 撤销/重做

- 三段式历史栈，最多 50 步
- 支持 `⌘Z` / `⇧⌘Z` / `Ctrl+Y` 与页面按钮

### 统计周报

- 类目时长统计与占比
- 24 小时时间分布
- 完成率
- Markdown 周报导出

### 数据与同步

- localStorage 本地持久化（默认）
- Supabase 可选云同步

## 技术栈

- 框架：Next.js 15 + React 19
- 样式：Tailwind CSS 4
- 图标：Lucide React
- 数据层：localStorage / Supabase
- AI 解析：本地中文 NLP 规则
- 测试：Vitest

## 本地运行

首次运行：

```bash
npm install
npm run dev
```

已安装依赖后可直接：

```bash
npm run dev
```

浏览器打开 http://localhost:3000。dev 脚本会自动检测本项目已有实例；端口被其他项目占用时，可通过 `PORT` 环境变量指定其他端口。

## 质量检查

```bash
npm test        # Vitest 单元测试
npm run lint    # ESLint（零警告）
npm run build   # Next.js 构建
```

## 可选配置

复制 `.env.example` 为 `.env.local` 后按需填写。

### Supabase 云同步

不配置时使用 localStorage。启用同步需要先在 Supabase SQL Editor 执行 [supabase/schema.sql](supabase/schema.sql) 创建 `schedule_state` 表（主键为 `(user_id, id)`）：

```sql
create table schedule_state (
  user_id text not null,
  id text not null default 'singleton',
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
```

然后在 `.env.local` 中填写：

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_USER_ID=alice
```

### 单用户边界

当前版本未接入 Supabase Auth，云同步采用显式单用户边界：只有同时配置 URL、anon key 和 `NEXT_PUBLIC_SUPABASE_USER_ID` 才会启用同步，读写都按 `user_id` 隔离，不再使用全局 singleton 行。多人部署时每个实例必须配置不同的用户 ID；若需真正的多租户隔离，请先接入 Supabase Auth，再执行 `supabase/schema.sql` 中注释的 RLS 加固 SQL。

### OpenAI API（预留）

`OPENAI_API_KEY` 已预留，当前自然语言解析仍使用本地中文 NLP 规则，尚未接入 OpenAI 增强解析。

## 部署

本项目为标准的 Next.js 应用，可部署到任意支持 Node.js 的平台（如 Vercel）。本地存储模式下无需额外配置；启用 Supabase 同步时配置对应环境变量即可。

## 目录结构

```text
src/
  lib/
    types.ts       - 类型定义
    date.ts        - 日期工具函数
    categories.ts  - 类目配置与关键词识别
    nlp.ts         - 中文自然语言解析
    storage.ts     - 本地存储
    supabase.ts    - Supabase 适配器
    obsidian.ts    - Obsidian 链接解析与生成
    history.ts     - 撤销/重做历史栈
    grid.ts        - 任务看板网格计算
    timeline.ts    - 时间轴滚动聚焦计算
    report.ts      - 周报生成
    sample.ts      - 示例数据
    ics.ts         - ICS 导出（暂缓，未启用）
  components/
    WeekTimeline.tsx - 周时间轴
    QuickAdd.tsx     - 快速添加
    BlockModal.tsx   - 时间块编辑弹窗
    TaskBoard.tsx    - 任务看板
    TaskModal.tsx    - 任务详情弹窗
    StatsView.tsx    - 统计周报
    SettingsModal.tsx - 设置弹窗
  app/
    page.tsx         - 主页面
    layout.tsx       - 布局
    globals.css      - 全局样式
```

## 当前范围边界

- ICS 导出暂缓：导出按钮置灰，相关代码保留注释，后续再评估恢复
- macOS 桌面版、Obsidian 插件双向同步、PWA 离线缓存暂不纳入当前里程碑
