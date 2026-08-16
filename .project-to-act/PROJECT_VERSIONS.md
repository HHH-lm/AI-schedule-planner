# 项目版本

> 只在版本号、发布状态、升级路径或兼容性发生变化时读取和更新。
> 发布清单是 v0.1.0 首次发布的唯一执行基准，Gate 结果在 `PROJECT_ACCEPTANCE.md` 记录。

## 当前版本

- 版本号：`0.1.0`
- 发布状态：未发布（发布清单已定义，待执行）
- 兼容性说明：尚未定义
- 最后更新：2026-08-16

## v0.1.0 发布清单（Release Checklist）

> 定义时间：2026-08-16（证据 E-T025-001）。逐项勾选完成后执行 `G7-001` 发布 Gate 并记录于 `PROJECT_ACCEPTANCE.md`。
> 执行指南见 `docs/operations.md`（部署手册第 2 节 Vercel Serverless、第 4 节日志可观测性、第 7 节事故处理）。

### A. 代码与质量门禁
- [ ] 后端：`cd backend && .venv/bin/python -m pytest -q` 全部通过
- [ ] 前端：`npm test` 全部通过
- [ ] `npm run lint`（--max-warnings=0）通过
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 生产构建通过（先停 dev server 再 `npm run clean`）
- [ ] `npm run scan:secrets` 全部 PASS
- [ ] `npm run eval:ai:golden` AI 解析质量回归通过

### B. 版本与发布产物
- [ ] 版本号一致：`package.json` / `backend/pyproject.toml` / `PROJECT_VERSIONS.md` / README 均为 0.1.0
- [ ] 版本历史已更新（本文件「版本历史」追加 0.1.0 发布记录）
- [ ] 发布提交已打 tag `v0.1.0`

### C. 环境变量与密钥
- [ ] 生产环境变量按 `.env.example` 逐项核对并注入 Vercel：
  - 前端：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`BACKEND_URL`
  - 后端：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`
  - AI：`DEEPSEEK_API_KEY` / `OPENAI_API_KEY`、对应 MODEL/BASE_URL、`AI_TIMEOUT_MS`
  - 推送：`WECHAT_PUSH_TYPE`、`WECOM_WEBHOOK_URL` / `PUSHPLUS_TOKEN` / `SERVERCHAN_KEY`
  - 日志：`LOG_LEVEL`、`LOG_FORMAT`
  - T-024 Serverless：`ENABLE_SCHEDULER`、`CRON_SECRET`、`CORS_ORIGINS`
- [ ] 密钥不入 Git（`scan:secrets` 覆盖），只经 Vercel 环境变量注入

### D. 数据与 Supabase
- [ ] `supabase/schema.sql`（RLS 按 `auth.uid()`）已在生产项目执行
- [ ] `reminder_log` 表已建（`ignore-duplicates` 去重约束生效）
- [ ] 开启每日备份并完成一次恢复演练

### E. 部署与拓扑
- [ ] Vercel 前端部署成功，公网 URL 健康检查返回 `ok`
- [ ] Vercel Serverless 后端部署成功（T-024：`maxDuration=60`、FastAPI Function）
- [ ] GitHub Actions 定时器已配置：每 5 分钟触发 `GET /api/v1/reminders/cron` 并带 `CRON_SECRET`
- [ ] 域名 / HTTPS 就绪（Vercel 默认 TLS）

### F. 真实公网验收（上线前必须实测）
- [ ] Supabase Auth：注册 / 登录 / 错误密码路径公网复测
- [ ] RLS 跨用户隔离 + anon 无权限公网复测
- [ ] 真实 DeepSeek 解析返回 `source=deepseek` 且字段有效
- [ ] 真实微信推送：至少一条通道实测，`reminders/run` 返回 `pushed=1`、`errors=[]`，手机实际收到
- [ ] Cron 未授权访问返回 401，授权可正常触发提醒扫描
- [ ] 日志链路确认：公网调用后可见 `http.request` → `ai.request/response` → `parse.result`，同一 `request_id` 贯穿

### G. 监控与可观测性（上线后持续）
- [ ] 健康端点外部探测（UptimeRobot / Cloudflare Health Checks）每 5 分钟
- [ ] 结构化日志确认已采集（Vercel Logs 或平台日志），事件清单见 `docs/operations.md` 第 4 节
- [ ] SLO 基线记录：AI 调用耗时与成功率、推送成功率，上线首周每日记录一次

### H. 回滚与风险
- [ ] 回滚方案确认：Vercel 上一版本 Redeploy；后端函数回退上一提交
- [ ] 已知限制清单确认（ICS 暂缓、Obsidian 依赖本机、本地模式无后端日志等）
- [ ] 数据安全边界确认（`PROJECT_OVERVIEW.md` 数据分类、日志脱敏约定）

### I. 人工确认与 Gate 执行
- [ ] A-001 / A-002 人工对照验收确认
- [ ] 项目负责人逐项勾选并签字确认本清单
- [ ] 执行 G7-001 发布 Gate → 结果记录于 `PROJECT_ACCEPTANCE.md`

## 下一版本计划

- 目标版本：`0.1.0`（首次发布）
- 计划内容：按上方发布清单执行公网部署与真实验收
- 发布条件：发布清单全部勾选 + G7-001 发布 Gate 通过

## 版本历史

按时间倒序追加：版本号、日期、状态、主要变更、原因、兼容性、证据 ID 和 Gate 结果。

- 0.1.0：2026-08-08，未发布，采用记录显示代码已存在；证据 E-ADOPT-001，无 Gate 结果。
- 暂无版本记录。
