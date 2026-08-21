# AI日程管理与个性化规划系统

AI 拆解宏观计划，双视图落地微观执行。


## 🏗️ 架构概览

```
┌─ Next.js 15 (Frontend) ──────────────────┐   ┌─ FastAPI (Backend) ────────────────┐
│ 周计划 / 任务看板 / 今日待办 / 四象限     │   │ NLP 自然语言解析 / 任务拆解         │
│ Obsidian 集成 / 撤销重做 / 统计周报       │ → │ 冲突检测 / 调度引擎(SchedulingEngine)│
│ 本地存储(localStorage) / Supabase 同步    │   │ AI 代理(OpenAI / DeepSeek)          │
│ 微信提醒设置 / 记忆系统管理              │   │ 定时提醒(调度器/外部定时器) / 推送    │
└──────────────────────────────────────────┘   └────────────────────────────────────┘
```

## ✨ 功能亮点

- **自然语言输入**：中文句子自动解析为日程，支持 OpenAI / DeepSeek / 本地 NLP 规则三级回退
- **智能调度引擎**：AI 理解用户目标 + 确定性算法分配时间，不依赖模型直接生成时间块
- **今日待办四象限**：紧急/重要矩阵分组，移动端单列 · 桌面端双栏仪表盘
- **定时提醒**：自托管 APScheduler 或 Serverless 外部定时器扫描，推送至企业微信 / PushPlus / Server酱
- **记忆系统**：用户主动管理长期偏好习惯，AI 只生成候选不做自动修改
- **多租户安全**：Supabase Auth + RLS 行级隔离，每人一库，未登录时保持本地模式
- **完善的工程基线**：Vitest 测试 · 安全扫描(secrets) · 前后端结构化日志（后端含 AI/推送/提醒关键事件与 request_id 关联）· 错误边界 · 运行手册

## 项目状态

- 阶段：阶段 6 自动验收已完成，进入阶段 7 发布准备（v0.1.0 首次发布）
- 版本：`0.1.0`（公网演示已上线，G7-001 发布 Gate 待项目负责人确认）
- 公网地址：前端 https://ai-schedule-web-ten.vercel.app · 后端 https://ai-schedule-backend.vercel.app
- 公网验收：真实 Supabase Auth/RLS、真实 DeepSeek 解析、PushPlus 微信推送端到端全部通过（E-T024-002）
- 质量基线：前端 Vitest 91 个测试、后端 pytest 206 个测试、密钥扫描 5/5 PASS；AI golden set 真实 DeepSeek 35/35（2026-08-20）

## 核心功能

### 周计划

- 周一至周日 24 小时时间轴
- 拖拽移动与拉伸调整时长
- 完成打卡
- 地点标注、类目颜色区分
- 点击时间轴空白处新建时间块，自动预填日期与开始时间

### 自然语言生成

中文句子由 FastAPI 后端自动解析为时间块，例如：

> 周二下午2点到5点写代码，地点深圳湾；周三上午10点健身

- AI 解析：OpenAI / DeepSeek API（Python 实现），未配置 Key 时由后端本地 NLP 规则回退
- 支持独立地点与带空格时间解析
- “周几”从当前时间起算下一个指定星期几（含当天）
- 生成后自动切换到新块所在周，滚动聚焦并短暂高亮

### 宏观任务看板

- 任务列表 + 14 天日期网格
- 拖拽任务到日期列完成排期；未排期任务可直接拖到所在日期网格，按 15 分钟刻度落点
- 子任务拆解与勾选
- 任务与时间块双向联动

### AI 任务拆解与时间规划

- 任务看板输入项目计划后，FastAPI 后端使用 AI 拆解为任务与子任务
- “AI 规划”按钮调用 FastAPI 后端，为当前任务生成不冲突的时间块
- 新生成的时间块与已有安排冲突时由后端检测，前端弹出冲突提示

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

### 定时提醒

- 时间块编辑弹窗可设置“微信提醒”时间
- 自托管模式：FastAPI 后端 APScheduler 每隔 5 分钟扫描到达提醒时间的时间块
- Serverless 模式：`ENABLE_SCHEDULER=false`，由 Vercel Cron（每日 0 点 UTC，已配置在 `backend/vercel.json`）或 GitHub Actions 调用 `GET /api/v1/reminders/cron` 触发扫描
- 提醒时间已过去超过 10 分钟时不再补发，避免补录历史时间块或服务恢复后推送过期提醒
- 支持企业微信机器人、PushPlus、Server酱三种通道；推送记录写入 `reminder_log` 去重

## 技术栈

- 前端：Next.js 15 + React 19
- 后端：FastAPI + Python 3.12+（自然语言解析、任务拆解、时间规划、冲突检测、AI 调用）
- 样式：Tailwind CSS 4
- 图标：Lucide React
- 数据层：localStorage / Supabase
- 测试：Vitest（前端）+ pytest（后端）

## 本地运行

首次运行：

```bash
npm install
uv sync --project backend --extra dev
npm run dev
```

`npm run dev` 会同时启动 FastAPI 后端（8000）与 Next.js 前端（3000）。
已安装依赖后可直接运行 `npm run dev`。

```bash
npm run dev
```

浏览器打开 http://localhost:3000。dev 脚本会自动检测本项目已有实例；端口被其他项目占用时，可通过 `PORT` 环境变量指定其他端口。

也可以分开启动：

```bash
cd backend && .venv/bin/python -m uvicorn app.main:app --port 8000
npm run dev:raw
```

## 部署（Vercel Serverless）

无服务器/域名，只用 Vercel 即可上线，适合自用与面试展示：

### 当前线上实例

- 前端：https://ai-schedule-web-ten.vercel.app
- 后端：https://ai-schedule-backend.vercel.app
- Vercel Cron：每日 0 点 UTC 触发 `/api/v1/reminders/cron` 作为提醒兜底

### 国内访问说明

- `vercel.app` 默认域名在当前网络（常见于国内运营商/防火墙环境）下可能无法直连，手机上打不开时请先开启代理/VPN 后访问。
- 需要无代理访问时：注册一个自己的域名，绑定到 Vercel 项目并通过 Cloudflare 等 CDN 回源；或把前端放到国内可达的托管/服务器。

### 重新部署步骤

1. 后端：Vercel 新建项目，导入本仓库，Root Directory 填 `backend`，配置 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`DEEPSEEK_API_KEY`、`AI_PROVIDER`、`ENABLE_SCHEDULER=false`、`CRON_SECRET`、`WECHAT_PUSH_TYPE` 等环境变量后部署，得到 `https://<backend>.vercel.app`。
2. 前端：Vercel 再新建项目，Root Directory 填仓库根目录，Framework 选 Next.js，配置 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`BACKEND_URL=https://<backend>.vercel.app` 后部署。
3. 定时提醒：Serverless 不常驻调度器，Vercel Cron（免费版每天 1 次）或仓库内示例工作流 `deploy/github-actions/reminder-cron.yml`（启用后每 5 分钟）调用 `GET /api/v1/reminders/cron`，携带 `Authorization: Bearer <CRON_SECRET>`。

详细步骤与自托管备选形态见 [docs/operations.md](docs/operations.md)。

## 质量检查

```bash
npm test        # Vitest 单元测试
cd backend && .venv/bin/python -m pytest -q
npm run lint    # ESLint（零警告）
npm run build   # Next.js 构建
npm run scan:secrets
```

## 可选配置

复制 `.env.example` 为 `.env.local` 后按需填写。

### Supabase 云同步（登录式多租户）

不配置时使用 localStorage。启用云同步需要：

1. 在 Supabase Authentication 中启用 Email provider（可开启密码确认邮件）。
2. 在 SQL Editor 执行 [supabase/schema.sql](supabase/schema.sql)，创建按 `auth.uid()` 隔离的表并启用 RLS。
3. 在 `.env.local` 中填写：

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

应用顶栏会显示登录入口。每位用户注册/登录后，`user_id` 取 `auth.uid()`，只能读写自己的数据行；未登录时保持本地模式，不读写云端数据。

### AI 解析（OpenAI / DeepSeek）

自然语言解析、任务拆解与时间规划默认由 FastAPI 后端调用 AI API，支持 OpenAI 与 DeepSeek；未配置 Key 时由后端回退到本地中文 NLP 规则，接口超时或失败时前端会显示明确错误。在 `.env.local` 中配置：

```text
AI_PROVIDER=auto
AI_TIMEOUT_MS=15000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
```

- `AI_PROVIDER` 可选 `auto` / `openai` / `deepseek` / `local`，默认 `auto`（优先 OpenAI，其次 DeepSeek）。
- `OPENAI_BASE_URL` / `DEEPSEEK_BASE_URL` 可覆盖默认端点，便于使用兼容网关。
- `AI_TIMEOUT_MS` 控制 AI 请求超时，默认 `15000`（15 秒）；超时或失败时提示重试或简化输入。
- 也可以在应用“设置”中选择解析服务；选择的服务需要对应的服务端 Key 已配置，否则回退本地规则。
- API Key 只保存在 FastAPI 后端环境变量中，不会下发到浏览器。

### AI 解析质量评测与回归

- 内置 35 条中文 golden set（`GOLDEN_SET_VERSION=0.3.0`，固定锚定日期 2026-08-16）：12 条 QuickAdd（含跨天）、10 条 Planning、6 条边界/异常（含 24:00/1440 边界）、7 条 Constraint/Memory。
- 元数据：每条用例带 `source`（`real_user` / `fault_sample` / `synthetic`）、`rationale`、`added_in` 与稳定 `id/name`；用例字段语义见 `backend/app/golden_ai_cases.py` 与 `backend/app/golden_case_meta.py`。
- 字段语义：`input` 是用户输入，`description`/`rationale` 是语义描述；legacy `text` 由加载层迁移为 `input`，不再混用。
- 评测命令：`cd backend && .venv/bin/python -m app.eval_ai_golden --provider deepseek --split open`
- 快照落盘：每次评测默认写入 `backend/eval_snapshots/eval-<版本>-<split>-<时间>.json`，包含日期、模型、prompt fingerprint、阈值、指标与逐条原始结果，便于回归追踪。
- held-out：`--split heldout` 执行预留集（`backend/app/golden_ai_cases_heldout.py`，不参与 prompt 调参），`--split open` 为默认调参集，`--split all` 两组一起跑。
- 指标：QuickAdd 完整精确率、Planning 排期检查通过率、边界/异常通过率、Constraint/Memory 检查通过率、字段准确率、拒答准确率。
- 默认门禁：`full >= 0.80`、`quickadd >= 0.90`、`planning >= 0.90`、`boundary >= 1.00`、`cm >= 0.80`、`field >= 0.90`、`reject >= 1.00`、`check >= 0.90`。
- 评测范围：当前 golden 只覆盖自然语言解析（QuickAdd/Boundary）与时间规划（Planning/Constraint+Memory）；AI 任务拆解与记忆分析暂未纳入 golden 门禁，后续补充时同步版本号与 README。
- 修改解析提示词后必须重跑评测，防止 AI 解析质量退化。

### 定时提醒（微信推送）

需要满足：Supabase 云同步启用并登录、配置一个微信通道；自托管模式后端常驻由 APScheduler 扫描，Serverless 模式由外部定时器触发 `/api/v1/reminders/cron`。在 `.env.local` 中配置：

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
REMINDER_SCAN_SECONDS=300
ENABLE_SCHEDULER=true
CRON_SECRET=
WECHAT_PUSH_TYPE=wecom
WECOM_WEBHOOK_URL=
```

- `WECHAT_PUSH_TYPE` 可选 `none` / `wecom` / `pushplus` / `serverchan`；企业微信机器人填 `WECOM_WEBHOOK_URL`，PushPlus 填 `PUSHPLUS_TOKEN`，Server酱填 `SERVERCHAN_KEY`。
- `SUPABASE_SERVICE_ROLE_KEY` 权限较高，只放在后端环境变量，不能写进 `NEXT_PUBLIC_*` 或提交 Git。
- 后端推送成功后写入 `reminder_log`，同一时间块同一提醒时间不会重复推送；提醒时间已过去超过 10 分钟不再补发（含推送失败后的重试）。
- Serverless 部署时 `ENABLE_SCHEDULER=false` 并设置 `CRON_SECRET`，定时器必须以 `Authorization: Bearer <CRON_SECRET>` 调用 `/api/v1/reminders/cron`。

### FastAPI 后端 API

前端通过 Next.js 的 `/api/v1/*` 代理访问后端，后端接口：

- `GET /api/v1/health`：健康检查
- `POST /api/v1/parse`：自然语言解析时间块
- `POST /api/v1/breakdown`：AI 任务拆解
- `POST /api/v1/plan`：AI 时间规划
- `POST /api/v1/conflicts/check`：冲突检测
- `GET /api/v1/reminders/status`：提醒任务状态
- `POST /api/v1/reminders/run`：手动触发一次提醒扫描
- `GET /api/v1/reminders/cron`：Serverless 定时触发入口（需 `Authorization: Bearer <CRON_SECRET>`）

后端代码在 `backend/`，依赖由 `uv sync --project backend --extra dev` 安装。

## 上线形态

- 当前线上形态：Next.js 前端与 FastAPI 后端均部署为 Vercel Serverless 项目，前端通过 `/api/v1/*` 服务端代理到后端。
- 自托管备选：Docker/systemd 版本保留在 `deploy/self-host-001` 标签，需要服务器时可按 [docs/operations.md](docs/operations.md) 第 9 节切回。
- 部署前检查、健康检查、监控、回滚与备份详见 [docs/operations.md](docs/operations.md)。

## 目录结构

```text
backend/
  app/             - FastAPI 应用（路由、服务、配置）
  tests/           - pytest 后端测试
src/
  lib/
    types.ts       - 类型定义
    date.ts        - 日期工具函数
    categories.ts  - 类目配置与关键词识别
    api.ts         - FastAPI 后端 API 客户端
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
    WeekTimeline.tsx - 周计划
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
