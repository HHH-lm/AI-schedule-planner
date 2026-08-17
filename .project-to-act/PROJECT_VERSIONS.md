# 项目版本

> 只在版本号、发布状态、升级路径或兼容性发生变化时读取和更新。
> 发布清单是 v0.1.0 首次发布的唯一执行基准，Gate 结果在 `PROJECT_ACCEPTANCE.md` 记录。

## 当前版本

- 版本号：`0.1.0`
- 发布状态：未发布（发布清单执行中，G7-001 待项目负责人确认）
- 兼容性说明：尚未定义
- 最后更新：2026-08-17

## v0.1.0 发布清单（Release Checklist）

> 定义时间：2026-08-16（证据 E-T025-001）。逐项勾选完成后执行 `G7-001` 发布 Gate 并记录于 `PROJECT_ACCEPTANCE.md`。
> 执行指南见 `docs/operations.md`（部署手册第 2 节 Vercel Serverless、第 4 节日志可观测性、第 7 节事故处理）。
> 执行状态：2026-08-17 T-027 执行中；自动化项已勾选，人工项保持未勾选并注明所需确认。

### A. 代码与质量门禁
- [x] 后端：`cd backend && .venv/bin/python -m pytest -q` 全部通过（2026-08-17：152 passed）
- [x] 前端：`npm test` 全部通过（2026-08-17：14 文件 82 passed）
- [x] `npm run lint`（--max-warnings=0）通过（2026-08-17）
- [x] `npx tsc --noEmit` 通过（2026-08-17）
- [x] `npm run build` 生产构建通过（2026-08-17：先停 dev server 再 `npm run clean`，E-G6-001）
- [x] `npm run scan:secrets` 全部 PASS（2026-08-17：5/5）
- [x] `npm run eval:ai:golden` AI 解析质量回归通过（2026-08-17：真实 DeepSeek 30/30，E-G6-001）

### B. 版本与发布产物
- [x] 版本号一致：`package.json` / `backend/pyproject.toml` / `PROJECT_VERSIONS.md` / README 均为 0.1.0（2026-08-17 核对）
- [ ] 版本历史已更新（本文件「版本历史」追加 0.1.0 发布记录）（待 G7-001 通过后追加）
- [ ] 发布提交已打 tag `v0.1.0`（待 G7-001 通过后打 tag）

### C. 环境变量与密钥
- [ ] 生产环境变量按 `.env.example` 逐项核对并注入 Vercel（部分已确认：E-T024-002 后端 Encrypted；完整逐项核对需登录 Vercel Dashboard）：
  - 前端：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`BACKEND_URL`
  - 后端：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`
  - AI：`DEEPSEEK_API_KEY` / `OPENAI_API_KEY`、对应 MODEL/BASE_URL、`AI_TIMEOUT_MS`
  - 推送：`WECHAT_PUSH_TYPE`、`WECOM_WEBHOOK_URL` / `PUSHPLUS_TOKEN` / `SERVERCHAN_KEY`
  - 日志：`LOG_LEVEL`、`LOG_FORMAT`
  - T-024 Serverless：`ENABLE_SCHEDULER`、`CRON_SECRET`、`CORS_ORIGINS`
- [x] 密钥不入 Git（`scan:secrets` 覆盖），只经 Vercel 环境变量注入（2026-08-17 5/5 PASS）

### D. 数据与 Supabase
- [x] `supabase/schema.sql`（RLS 按 `auth.uid()`）已在生产项目执行（E-T024-002 公网 Auth/RLS 11 项通过）
- [x] `reminder_log` 表已建（`ignore-duplicates` 去重约束生效）（E-T024-002 去重生效）
- [ ] 开启每日备份并完成一次恢复演练（需 Supabase Dashboard 人工完成）

### E. 部署与拓扑
- [x] Vercel 前端部署成功，公网 URL 健康检查返回 `ok`（2026-08-17 curl HTTP 200）
- [x] Vercel Serverless 后端部署成功（T-024：`maxDuration=60`、FastAPI Function）（2026-08-17 curl HTTP 200）
- [ ] GitHub Actions 定时器已配置：每 5 分钟触发 `GET /api/v1/reminders/cron` 并带 `CRON_SECRET`（需 PAT workflow scope 或网页端创建 + Secrets）
- [x] 域名 / HTTPS 就绪（Vercel 默认 TLS）（公网 https 200）

### F. 真实公网验收（上线前必须实测）
- [x] Supabase Auth：注册 / 登录 / 错误密码路径公网复测（E-T024-002）
- [x] RLS 跨用户隔离 + anon 无权限公网复测（E-T024-002）
- [x] 真实 DeepSeek 解析返回 `source=deepseek` 且字段有效（E-T024-002 + E-G6-001 golden 30/30）
- [x] 真实微信推送 API 结果：`reminders/run` 返回 `pushed=1`、`errors=[]`（E-T024-002；手机实际收到待人工确认）
- [x] Cron 未授权访问返回 401，授权可正常触发提醒扫描（E-T024-002 + 2026-08-17 401 复测）
- [ ] 日志链路确认：公网调用后可见 `http.request` → `ai.request/response` → `parse.result`，同一 `request_id` 贯穿（本地 E-T023-001 已通过；Vercel Logs 公网采集待人工确认）

### G. 监控与可观测性（上线后持续）
- [ ] 健康端点外部探测（UptimeRobot / Cloudflare Health Checks）每 5 分钟（需注册外部探活服务）
- [ ] 结构化日志确认已采集（Vercel Logs 或平台日志），事件清单见 `docs/operations.md` 第 4 节（需 Vercel Logs 人工确认）
- [ ] SLO 基线记录：AI 调用耗时与成功率、推送成功率，上线首周每日记录一次（发布后人工每日记录）

### H. 回滚与风险
- [ ] 回滚方案确认：Vercel 上一版本 Redeploy；后端函数回退上一提交（需项目负责人确认 `docs/operations.md` 第 5 节）
- [ ] 已知限制清单确认（ICS 暂缓、Obsidian 依赖本机、本地模式无后端日志等）（需项目负责人确认）
- [ ] 数据安全边界确认（`PROJECT_OVERVIEW.md` 数据分类、日志脱敏约定）（需项目负责人确认）

### I. 人工确认与 Gate 执行
- [ ] A-001 / A-002 人工对照验收确认（需项目负责人对照 `PROJECT_OVERVIEW.md` / `PROJECT_FEATURES.md`）
- [ ] 项目负责人逐项勾选并签字确认本清单（人工）
- [ ] 执行 G7-001 发布 Gate → 结果记录于 `PROJECT_ACCEPTANCE.md`（人工确认后由 Codex 落账）

## 下一版本计划

- 目标版本：`0.1.0`（首次发布）
- 计划内容：按上方发布清单执行公网部署与真实验收
- 发布条件：发布清单全部勾选 + G7-001 发布 Gate 通过

## 版本历史

按时间倒序追加：版本号、日期、状态、主要变更、原因、兼容性、证据 ID 和 Gate 结果。

- 0.1.0：2026-08-08，未发布，采用记录显示代码已存在；证据 E-ADOPT-001，无 Gate 结果。
- 暂无版本记录。
