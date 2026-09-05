# SLO 基线记录(v0.1.0 上线首周)

- 记录频率:上线首周每日一次(G7-001 发布 Gate 通过当日记 Day 1,此后连续 7 天)
- 指标:AI 解析调用成功率与耗时、微信推送成功率、cron 定时器可用性
- 数据来源:
  - AI:Vercel Logs(后端项目)过滤 `ai.response`(取 `duration_ms`)、`ai.timeout` / `ai.error`;成功率 = `ai.response` 数 /(`ai.response` + `ai.timeout` + `ai.error`)数
  - 推送:GitHub Actions `reminder-cron` 运行日志中 `/api/v1/reminders/cron` 返回的 `pushed` / `errors`;或 Vercel Logs 中 `reminder.push.failed` / `push.failure` 计数
  - 定时器:GitHub Actions 页 reminder-cron 每日应有 ~288 次触发(`*/5`),关注连续失败或长时间未触发
- 阈值参考(自用软件,无硬性 SLO,以下为观察基线):AI 成功率 ≥ 95%(不含服务商故障时段)、推送失败自动重试后成功、定时器无连续 3 次以上未触发

## 每日记录

| 日期 | AI 调用次数 | AI 成功率 | AI 耗时 p50 / p95 (ms) | cron 触发/失败 | 推送成功 / 失败 | 备注 |
|---|---|---|---|---|---|---|
| 2026-09-05（发布前基线，G7-001 前实测） | 1 | 100%（1/1） | 1121 / —（端到端 1138） | dispatch 2 次成功 / 0 失败（自动 schedule 周期首日观察中） | 1 / 0（手机实收） | E-T027-002/E-T027-005；探活 UptimeRobot Keyword 监控上线（5 分钟） |
| (G7-001 通过当日 = Day 1) | | | | | | |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |

## 异常记录

| 日期 | 现象 | 处置 | 结果 |
|---|---|---|---|
|  |  |  |  |
