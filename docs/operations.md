# 部署与运维手册

> 适用于 AI 日程管理系统 v0.1.0（Next.js 15 + Supabase 可选同步）。

## 1. 部署前检查清单

- 本地质量门禁通过：`npm test`、`npm run lint`、`npm run build`、`npx tsc --noEmit`
- Git 工作区已提交，版本号与 `package.json` 一致
- 环境变量只从 `.env.example` 复制，密钥不写入 Git
- Supabase 同步模式：已启用 Email Auth，并执行 `supabase/schema.sql`（RLS 按 `auth.uid()` 隔离）
- 未配置 Supabase 时确认本地存储模式可用，界面显示“本地模式”

## 2. 部署流程

### Vercel

1. 推送 `main` 分支到 Git 远端并导入 Vercel 项目
2. 在项目设置中配置环境变量（`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`）
3. 部署后访问 `/api/health`，确认返回 `status: "ok"`
4. 如需保留服务端日志，在 Vercel 打开 Logs 与错误监控

### Node.js 自托管

```bash
npm ci
npm run build
npm run start
```

建议使用进程管理器（如 `pm2`）守护 `npm run start`，并将 `PORT` 设置为 `3000` 或反向代理指定的端口。

## 3. 健康检查与监控

健康检查端点：`GET /api/health`

```bash
curl -s http://localhost:3000/api/health
```

预期响应：

```json
{"status":"ok","service":"ai-schedule-system","version":"0.1.0","storage":"local","timestamp":"..."}
```

- `status` 非 `ok` 或连续 3 次请求失败时视为实例不可用
- `storage` 为 `supabase` 表示云同步已启用，`local` 表示本地存储模式
- 建议配置外部 uptime 检查（如 UptimeRobot、Cloudflare Health Checks）每 5 分钟探测 `/api/health`
- Supabase 侧关注仪表盘中的 API 错误率、数据库连接和慢查询

## 4. 回滚

- Vercel：在 Deployment 列表选择上一个健康版本并 Redeploy；或使用 Git revert 后重新部署
- 自托管：保留上一版本的构建目录或容器镜像，直接切换回旧产物
- 回滚后立即验证 `/api/health` 和核心流程（NLP 生成、周时间轴、云同步）

## 5. 备份与恢复

- 本地模式：浏览器 localStorage 数据可通过统计周报的 Markdown 导出人工归档
- Supabase 模式：在 Dashboard 使用 Database Backups 开启每日备份；恢复时先确认 `user_id` 作用域正确
- 恢复演练：至少验证一次“从备份恢复后能正常加载时间块与任务”

## 6. 事故处理

| 症状 | 处置 |
|---|---|
| `/api/health` 不可用 | 查部署日志；确认环境变量与端口；必要时回滚 |
| 云同步失败 | 确认 Supabase 配置、登录状态与表结构；本地数据仍在，可离线使用 |
| 数据丢失 | 先停止写入，从本地存储或 Supabase 备份恢复 |
| 多人数据串用 | 检查是否每位用户独立登录；RLS 按 `auth.uid()` 隔离，禁止共享账号 |

## 7. 已知限制

- 云同步依赖 Supabase Email Auth；未登录时仅本地模式，不读写云端数据
- 本地模式没有服务端日志，故障排查依赖浏览器控制台
- ICS 导出暂缓，不参与发布验收
