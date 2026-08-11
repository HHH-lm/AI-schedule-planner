# 部署与运维手册

> 适用于 AI 日程管理系统 v0.1.0（Next.js 15 前端 + FastAPI/Python 后端 + Supabase 可选同步）。

## 1. 部署前检查清单

- 本地质量门禁通过：`npm test`、`npm run lint`、`npm run build`、`npx tsc --noEmit`
- 后端质量门禁通过：`cd backend && .venv/bin/python -m pytest -q`
- Git 工作区已提交，版本号与 `package.json` 一致
- 环境变量只从 `.env.example` 复制，密钥不写入 Git
- Supabase 同步模式：已启用 Email Auth，并执行 `supabase/schema.sql`（RLS 按 `auth.uid()` 隔离）
- 未配置 Supabase 时确认本地存储模式可用，界面显示“本地模式”
- AI 解析：确认 FastAPI 后端已启动，`AI_PROVIDER` 与 `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` 符合预期；未配置时确认后端本地 NLP 规则可用
- 定时提醒（可选）：确认 `SUPABASE_SERVICE_ROLE_KEY`、`WECHAT_PUSH_TYPE` 与对应 webhook/token 已配置，并在 Supabase 执行 `reminder_log` 建表 SQL

## 2. 部署流程

### Vercel

1. 推送 `main` 分支到 Git 远端并导入 Vercel 项目
2. 在项目设置中配置环境变量（Supabase、`BACKEND_URL` 与 AI 解析变量，见 `.env.example`）
3. 单独部署 FastAPI 后端，确保公网可访问 `BACKEND_URL`
4. 部署后访问 `/api/health`，确认返回 `status: "ok"`，并访问 `/api/v1/health` 确认后端代理连通
5. 如需保留服务端日志，在 Vercel 打开 Logs 与错误监控

### Node.js + FastAPI 自托管

```bash
npm ci
npm run build
npm run start
cd backend
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

建议使用进程管理器（如 `pm2` / systemd）分别守护 `npm run start` 与 uvicorn，并将 `PORT` / `BACKEND_PORT` 设置为预期端口。

定时提醒依赖 FastAPI 进程常驻：后端启动时会注册 APScheduler 定时任务，按 `REMINDER_SCAN_SECONDS`（默认 300 秒）扫描一次；若部署在 Serverless 冷启动平台，需要改用系统 cron 定时调用 `POST /api/v1/reminders/run`。

## 3. 健康检查与监控

健康检查端点：

- 前端：`GET /api/health`
- 后端：`GET /api/v1/health`
- 提醒状态：`GET /api/v1/reminders/status`

```bash
curl -s http://localhost:3000/api/health
```

预期响应：

```json
{"status":"ok","service":"ai-schedule-system","version":"0.1.0","storage":"local","timestamp":"..."}
```

- 任一端点 `status` 非 `ok` 或连续 3 次请求失败时视为实例不可用
- `storage` 为 `supabase` 表示云同步已启用，`local` 表示本地存储模式
- 建议配置外部 uptime 检查（如 UptimeRobot、Cloudflare Health Checks）每 5 分钟探测两个健康检查端点
- Supabase 侧关注仪表盘中的 API 错误率、数据库连接和慢查询

## 4. 回滚

- Vercel：在 Deployment 列表选择上一个健康版本并 Redeploy；或使用 Git revert 后重新部署
- 自托管：保留上一版本的前端构建目录与后端进程/镜像，直接切换回旧产物
- 回滚后立即验证 `/api/health`、`/api/v1/health` 和核心流程（AI 解析、拆解、规划、周计划、云同步）

## 5. 备份与恢复

- 本地模式：浏览器 localStorage 数据可通过统计周报的 Markdown 导出人工归档
- Supabase 模式：在 Dashboard 使用 Database Backups 开启每日备份；恢复时先确认 `user_id` 作用域正确
- 恢复演练：至少验证一次“从备份恢复后能正常加载时间块与任务”

## 6. 事故处理

| 症状 | 处置 |
|---|---|
| `/api/health` 或 `/api/v1/health` 不可用 | 查对应服务日志；确认环境变量与端口；必要时回滚 |
| 云同步失败 | 确认 Supabase 配置、登录状态与表结构；本地数据仍在，可离线使用 |
| 数据丢失 | 先停止写入，从本地存储或 Supabase 备份恢复 |
| 多人数据串用 | 检查是否每位用户独立登录；RLS 按 `auth.uid()` 隔离，禁止共享账号 |
| AI 解析失败 | 检查 FastAPI 后端、服务商 Key、余额与网络；接口超时（默认 15 秒）或失败时前端显示明确错误，未配置 Key 时才回退后端本地规则 |
| 微信提醒未收到 | 确认后端常驻运行、`GET /api/v1/reminders/status` 返回 `enabled: true`；检查微信通道 webhook/token 是否有效、手机端通知权限；推送失败会自动重试 |

## 7. 已知限制

- 云同步依赖 Supabase Email Auth；未登录时仅本地模式，不读写云端数据
- 本地模式没有后端日志，故障排查依赖浏览器控制台与 `.backend.log`
- AI 解析会把用户输入文本发送到 OpenAI / DeepSeek 服务端，涉及隐私的内容请谨慎输入；Key 仅保存在 FastAPI 后端环境变量
- AI 解析请求默认 15 秒超时，可通过 `AI_TIMEOUT_MS` 调整；复杂长句可能需要更长响应时间，超时后请重试或简化输入
- 定时提醒只扫描已登录并同步到 Supabase 的时间块；未登录或本地模式下的时间块不会触发微信提醒
- 微信通道需要用户自行申请：企业微信机器人、PushPlus 或 Server酱任一即可，手机端需开启对应应用通知
- ICS 导出暂缓，不参与发布验收
