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

## 2. 上线形态：Vercel Serverless（推荐，自用/面试展示）

目标链路：

```text
Next.js (Vercel 公网 URL)
  ↓ /api/v1/*（Next.js rewrites 服务端代理）
FastAPI Serverless (Vercel Python Function 公网 URL)
  ↓
Supabase (真实云端数据库)
```

自托管形态仍保留在 `deploy/self-host-001` 标签与 `docs/operations.md` 第 9 节，后续需要服务器时可直接切换回自托管版本。

### 2.1 部署 FastAPI 后端（Vercel Python Function）

1. 在 Vercel 新建独立项目，导入同一 GitHub 仓库，Root Directory 填 `backend`
2. Framework Preset 保持 Auto（Vercel 会识别 `backend/app/main.py` 的 FastAPI `app`）
3. 配置环境变量：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`（按需）
   - `AI_PROVIDER`
   - `ENABLE_SCHEDULER=false`（Serverless 不允许常驻调度器）
   - `CRON_SECRET`：16 位以上随机串（定时器鉴权）
   - `WECHAT_PUSH_TYPE=pushplus` / `WECOM_WEBHOOK_URL` / `SERVERCHAN_KEY`（按需）
   - `CORS_ORIGINS=https://<前端 Vercel 域名>`
4. 部署后验证：`curl -s https://<backend>.vercel.app/api/v1/health` 返回 `status: "ok"`

`backend/pyproject.toml` 已配置 `[tool.vercel] entrypoint = "app.main:app"`，`backend/vercel.json` 已设置函数 `maxDuration=60`，无需额外 adapter。

### 2.2 部署前端（Next.js）

1. 在 Vercel 新建项目，Root Directory 使用仓库根目录，Framework 选择 Next.js
2. 配置环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `BACKEND_URL=https://<backend>.vercel.app`
3. 部署后验证 `https://<web 域名>/api/health` 返回 `status: "ok"`

### 2.3 定时提醒（Serverless 模式）

Serverless 不常驻进程，因此调度器必须在外部触发，由受保护端点执行扫描：

```text
Vercel Cron 或 GitHub Actions
  ↓ GET https://<backend>.vercel.app/api/v1/reminders/cron
  Authorization: Bearer <CRON_SECRET>
  ↓
scan_reminders → PushPlus / 企业微信 / Server酱
```

- Vercel Cron（Hobby 免费版每天最多 1 次）：`backend/vercel.json` 已配置每日 0 点 UTC 调用 `/api/v1/reminders/cron`，部署后可在 Vercel 项目 Cron Jobs 页面查看；请求会自动带 `Authorization: Bearer <CRON_SECRET>`；Hobby 版无法满足 5 分钟级提醒，适合日级兜底。
- GitHub Actions（推荐，支持 5 分钟级）：仓库提供示例 `deploy/github-actions/reminder-cron.yml`，复制到 `.github/workflows/` 后每 5 分钟调用该端点；在 GitHub 仓库 Settings → Secrets 配置 `BACKEND_URL=https://<backend>.vercel.app` 与 `CRON_SECRET`（与后端环境变量相同），未配置时工作流自动跳过。

### 2.4 自托管形态（备选，保留版本）

`deploy/self-host-001` 标签保留了 Docker + systemd 部署产物（`Dockerfile`、`docker-compose.yml`、`deploy/systemd/`），切换回自托管时只需：

```bash
git checkout deploy/self-host-001 -- Dockerfile docker-compose.yml deploy/systemd 2>/dev/null || true
# 或直接从标签新建分支部署
```

自托管部署步骤见 README“部署”章节与历史版本 `docs/operations.md`；核心差异是 `ENABLE_SCHEDULER=true`（默认），由 APScheduler 常驻扫描，无需外部定时器。

### 2.5 公网验收

```bash
curl -s https://<web 域名>/api/health
curl -s https://<backend>.vercel.app/api/v1/health
curl -s https://<backend>.vercel.app/api/v1/reminders/status
curl -s -H "Authorization: Bearer <CRON_SECRET>" https://<backend>.vercel.app/api/v1/reminders/cron
```

- 浏览器打开公网 Web URL，完成注册/登录并确认云端数据读写（Supabase Auth/RLS）
- 在 QuickAdd 输入自然语言，确认经公网链路完成真实 AI 解析
- 创建带微信提醒的时间块，用 `curl` 触发 cron 端点或等待定时器，确认推送成功
- Serverless 冷启动首请求可能较慢，属正常现象

## 3. 健康检查与监控

健康检查端点：

- 前端：`GET /api/health`
- 后端：`GET /api/v1/health`
- 提醒状态：`GET /api/v1/reminders/status`
- 提醒手动/定时触发：`GET /api/v1/reminders/cron`（需 `Authorization: Bearer <CRON_SECRET>`）

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

## 4. 日志与可观测性

FastAPI 后端默认输出 **JSON Lines 结构化日志**（每行一个 JSON 对象），覆盖请求、AI 调用、微信推送与定时提醒扫描等关键事件，用于上线后排查“AI 慢 / 失败 / 推送失败”。

### 4.1 配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `LOG_LEVEL` | `INFO` | 日志级别：DEBUG / INFO / WARNING / ERROR / CRITICAL |
| `LOG_FORMAT` | `json` | `json`（JSON Lines，推荐）或 `text`（人类可读） |

日志写入 stderr：Docker 部署直接 `docker logs` / 平台日志采集；systemd 部署见 `journalctl -u <service>`；本地 dev 见 `.backend.log`。

### 4.2 日志字段

- `time`：UTC ISO 时间
- `level`：INFO / WARNING / ERROR
- `logger`：模块名（`app.ai`、`app.push`、`app.reminders`、`app.http` 等）
- `event`：事件名
- `request_id`：请求级关联 ID（HTTP 请求 12 位 hex；提醒扫描为 `scan-<时间戳>`），用于把一次请求的多个事件串起来
- 其余字段为事件附加字段（provider / model / duration_ms / status / 数量等）

### 4.3 关键事件

| 事件 | 级别 | 关键字段 | 何时出现 |
|---|---|---|---|
| `http.request` | INFO（4xx WARNING，5xx ERROR） | method, path, status, duration_ms | 每个 API 请求（含 429 限流） |
| `ai.request` / `ai.response` | INFO | provider, model, operation, input_chars, timeout_ms / duration_ms, status, output_bytes | AI 调用开始 / 成功 |
| `ai.timeout` | ERROR | provider, model, operation, duration_ms, timeout_ms | AI 超时（默认 15 秒） |
| `ai.error` | ERROR | provider, model, operation, duration_ms, status, error | AI 服务端错误（4xx/5xx） |
| `parse.result` | INFO（异常 WARNING） | source, schedules, rejected | `/api/v1/parse` 结果（ai/local/none） |
| `plan_v2.start` / `plan_v2.result` | INFO（异常 WARNING/ERROR） | tasks, blocks, unassigned, source | `/api/v1/plan-v2` 开始 / 结果 |
| `breakdown.start` / `breakdown.result` | INFO（异常 ERROR） | plan_chars, tasks, source | `/api/v1/breakdown` 结果 |
| `match_task.start` / `match_task.result` / `match_task.error` | INFO / ERROR | tasks, matched, source | `/api/v1/match-task` |
| `push.request` / `push.success` / `push.failure` | INFO / ERROR | channel, status, reason, code | 微信推送（含 PushPlus 业务错误码） |
| `reminder.scan.start` / `reminder.scan.due` / `reminder.scan.done` | INFO | checked, due, pushed, skipped, errors | 每次提醒扫描 |
| `reminder.push.failed` / `reminder.push.skipped` | ERROR / INFO | block_id, error | 单条提醒推送失败 / 去重跳过 |
| `reminder.scan.error` | ERROR | error | 扫描过程中 Supabase 读取失败 |

### 4.4 排查示例

```bash
# 最近 30 分钟 AI 超时/失败
grep '"event": "ai.timeout"\|"event": "ai.error"' <日志> | tail

# 某次请求的完整链路（按 request_id 关联）
grep '"request_id": "abc123"' <日志>

# 推送失败与原因
grep '"event": "push.failure"\|"event": "reminder.push.failed"' <日志>

# AI 慢查询（按耗时排序，取前 20 条）
grep '"event": "ai.response"' <日志> | python3 -c \
  "import sys,json; rows=[json.loads(l) for l in sys.stdin]; \
   [print(r['duration_ms'], r.get('operation'), r.get('provider')) for r in sorted(rows, key=lambda x:-x['duration_ms'])[:20]]"
```

### 4.5 隐私与安全约定

- 日志只记录脱敏元数据（长度、数量、状态码、耗时、错误类型/截断信息），**不记录**自然语言输入、日程文本、推送令牌、API Key 等敏感内容。
- `request_id` 仅用于关联日志，不包含用户身份信息。

## 5. 回滚

- Vercel：在 Deployment 列表选择上一个健康版本并 Redeploy；或使用 Git revert 后重新部署
- 自托管：保留上一版本的前端构建目录与后端进程/镜像，直接切换回旧产物
- 回滚后立即验证 `/api/health`、`/api/v1/health` 和核心流程（AI 解析、拆解、规划、周计划、云同步）

## 6. 备份与恢复

- 本地模式：浏览器 localStorage 数据可通过统计周报的 Markdown 导出人工归档
- Supabase 模式：在 Dashboard 使用 Database Backups 开启每日备份；恢复时先确认 `user_id` 作用域正确
- 恢复演练：至少验证一次“从备份恢复后能正常加载时间块与任务”

## 7. 事故处理

| 症状 | 处置 |
|---|---|
| `/api/health` 或 `/api/v1/health` 不可用 | 查对应服务日志；确认环境变量与端口；必要时回滚 |
| Serverless 后端冷启动慢或偶发超时 | 属正常现象；确认 Vercel 函数 `maxDuration` 配置与日志；定时任务可容忍重试 |
| 云同步失败 | 确认 Supabase 配置、登录状态与表结构；本地数据仍在，可离线使用 |
| 数据丢失 | 先停止写入，从本地存储或 Supabase 备份恢复 |
| 多人数据串用 | 检查是否每位用户独立登录；RLS 按 `auth.uid()` 隔离，禁止共享账号 |
| AI 解析失败或慢 | 先查日志中 `ai.timeout` / `ai.error` / `ai.response`（含 `duration_ms`）；再检查服务商 Key、余额与网络；接口超时（默认 15 秒）或失败时前端显示明确错误，未配置 Key 时才回退后端本地规则 |
| 微信提醒未收到 | 确认定时器已触发 `GET /api/v1/reminders/cron`（Serverless）或后端常驻运行（自托管）、`/api/v1/reminders/status` 返回 `enabled: true`；查日志 `push.failure` / `reminder.push.failed` 看原因与状态码；检查微信通道 webhook/token 是否有效、手机端通知权限；推送失败会自动重试 |

## 8. 已知限制

- 云同步依赖 Supabase Email Auth；未登录时仅本地模式，不读写云端数据
- Vercel 默认 `*.vercel.app` 域名在部分网络（常见于国内运营商/防火墙环境）无法直接访问；手机打不开时先使用代理/VPN，长期无代理访问需绑定自定义域名 + Cloudflare 等 CDN 回源，或改用国内可达入口
- 本地模式（未启动 FastAPI 后端）没有后端日志，故障排查依赖浏览器控制台与 `.backend.log`；后端运行时的结构化日志见第 4 节
- AI 解析会把用户输入文本发送到 OpenAI / DeepSeek 服务端，涉及隐私的内容请谨慎输入；Key 仅保存在 FastAPI 后端环境变量
- AI 解析请求默认 15 秒超时，可通过 `AI_TIMEOUT_MS` 调整；复杂长句可能需要更长响应时间，超时后请重试或简化输入
- 定时提醒只扫描已登录并同步到 Supabase 的时间块；未登录或本地模式下的时间块不会触发微信提醒
- 微信通道需要用户自行申请：企业微信机器人、PushPlus 或 Server酱任一即可，手机端需开启对应应用通知
- Serverless 模式不常驻 APScheduler：`ENABLE_SCHEDULER=false`，提醒由外部定时器触发；Hobby 版 Vercel Cron 每天最多 1 次，需要 5 分钟级提醒请使用 GitHub Actions
- 后端速率限制（slowapi）是进程内存态，Serverless 多实例下为近似限流，不作为精确安全边界
- ICS 导出暂缓，不参与发布验收

## 9. 自托管形态（备选，保留版本）

`deploy/self-host-001` 标签保留了完整自托管产物：`Dockerfile`、`docker-compose.yml`、`deploy/systemd/` 与历史部署文档。切换回自托管时，`ENABLE_SCHEDULER` 保持 `true`（默认），由 APScheduler 常驻扫描，无需外部定时器。

### 9.1 Docker Compose

```bash
git clone https://github.com/HHH-lm/ai-schedule-system.git /opt/ai-schedule-system
cd /opt/ai-schedule-system
cp .env.example .env.local
# 填写 .env.local 中 AI/Supabase/推送相关变量，ENABLE_SCHEDULER=true
cd deploy
docker compose up -d --build
```

验证：`curl -s http://localhost:8000/api/v1/health`

如需公网 HTTPS，建议在服务器前置 Nginx/Caddy 反向代理到 `127.0.0.1:8000`，并在 `BACKEND_URL` 中使用对应公网域名。

### 9.2 systemd

```bash
cd /opt/ai-schedule-system/backend
python3 -m venv .venv
.venv/bin/pip install uv
.venv/bin/uv sync --frozen --no-dev
cp ../deploy/systemd/ai-schedule-backend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ai-schedule-backend
```
