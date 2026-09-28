#!/usr/bin/env bash
# 生产健康自检：提醒链路 + 日志环境标签（F-043/T-059）
#
# 用法：bash scripts/check-reminder-health.sh
#
# 只读检查，不改任何东西。判断依据是 Vercel 运行时日志（比 Axiom 更权威：
# 直接看进程 stdout，绕开日志上报与 Axiom 查询过滤，能区分"生产坏了"与"监控没配上"）。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="${BACKEND_URL:-https://ai-schedule-backend.vercel.app}"
PROJECT="${VERCEL_PROJECT:-ai-schedule-backend}"

# vercel CLI 常在 nvm 的 node bin 下，本机 PATH 默认没有
if ! command -v vercel >/dev/null 2>&1; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin; do
    [ -x "$candidate/vercel" ] && export PATH="$candidate:$PATH" && break
  done
fi
if ! command -v vercel >/dev/null 2>&1; then
  echo "✗ 找不到 vercel CLI：请先安装（npm i -g vercel）或手动把 node bin 加进 PATH"
  exit 2
fi

echo "检查目标：${BACKEND_URL}（项目 ${PROJECT}）"
echo "拉取运行时日志…"
LOG="$(cd "$ROOT" && vercel logs "$BACKEND_URL" --project "$PROJECT" 2>&1)"

if printf '%s' "$LOG" | grep -q "Fetched 0 logs"; then
  echo "⚠ 没有取到日志。可能最近无人访问，或部署 URL 已变。"
  echo "  可手动访问一次 ${BACKEND_URL}/api/v1/health 后重试。"
  exit 1
fi

# ── 1. 环境标签：每条日志都应带 env:prod ───────────────────────
TOTAL=$(printf '%s' "$LOG" | grep -c '"level":')
PROD=$(printf '%s' "$LOG" | grep -c '"env": "prod"')
DEV=$(printf '%s' "$LOG" | grep -c '"env": "dev"')

echo
echo "── 环境标签 ──"
echo "日志条数：${TOTAL}，其中 env=prod：${PROD}，env=dev：${DEV}"
if [ "$DEV" -gt 0 ]; then
  echo "✗ 生产出现 env=dev：APP_ENV 未生效，Axiom 监控过滤 env==\"prod\" 后会看不到数据（静默失明）"
  LABEL_OK=0
elif [ "$PROD" -eq 0 ]; then
  echo "✗ 没有一条日志带 env 字段：新版本可能未部署成功"
  LABEL_OK=0
else
  echo "✓ 全部带 env=prod，Axiom 过滤能匹配"
  LABEL_OK=1
fi

# ── 2. 扫描心跳：reminder.scan.done 应每约 5 分钟一条 ───────────
SCANS=$(printf '%s' "$LOG" | grep -c '"event": "reminder.scan.done"')
echo
echo "── 扫描心跳 ──"
echo "本次窗口内 reminder.scan.done：${SCANS} 条"
if [ "$SCANS" -eq 0 ]; then
  echo "✗ 没有扫描心跳：cron-job.org 可能失效，或扫描全部报错"
  SCAN_OK=0
else
  # 相邻心跳的时间差（取 UTC 时间戳；值形如 2026-09-16T17:35:17.353583+00:00，
  # 用 [^"]+ 匹配避免被结尾的 +00:00 卡住）
  TIMES=$(printf '%s' "$LOG" \
    | grep '"event": "reminder.scan.done"' \
    | grep -oE '"time": "[^"]+"' \
    | grep -oE '[0-9]{2}:[0-9]{2}:[0-9]{2}' | sort -u)
  if [ "$(printf '%s\n' "$TIMES" | grep -c .)" -ge 2 ]; then
    echo "心跳时刻（UTC）：$(printf '%s' "$TIMES" | tr '\n' ' ')"
    echo "✓ 心跳在滚动（相邻应约 5 分钟）"
  else
    echo "✓ 有心跳（窗口内仅 1 条，无法比对间隔）"
  fi
  SCAN_OK=1
fi

# ── 3. 错误与状态码 ───────────────────────────────────────────
SCAN_ERR=$(printf '%s' "$LOG" | grep -c '"event": "reminder.scan.error"')
PUSH_FAIL=$(printf '%s' "$LOG" | grep -cE '"event": "(push.failure|reminder.push.failed)"')
HTTP_5XX=$(printf '%s' "$LOG" | grep -c '"status": 5')
HTTP_4XX=$(printf '%s' "$LOG" | grep -cE '"status": 4[0-9]{2}')

echo
echo "── 错误统计 ──"
echo "reminder.scan.error：${SCAN_ERR}  push.failure/reminder.push.failed：${PUSH_FAIL}"
echo "HTTP 5xx：${HTTP_5XX}  HTTP 4xx：${HTTP_4XX}"
if [ "$SCAN_ERR" -gt 0 ] || [ "$PUSH_FAIL" -gt 0 ] || [ "$HTTP_5XX" -gt 0 ]; then
  echo "✗ 存在错误事件：到 Axiom Stream 按 event 名细查（这几类会触发「关键错误」邮件）"
  ERR_OK=0
else
  echo "✓ 无扫描错误、无推送失败、无 5xx"
  ERR_OK=1
fi

# ── 结论 ─────────────────────────────────────────────────────
echo
echo "════════════════════════════════"
if [ "$LABEL_OK" -eq 1 ] && [ "$SCAN_OK" -eq 1 ] && [ "$ERR_OK" -eq 1 ]; then
  echo "✓ 生产健康：心跳准点、环境标签正确、零错误"
  echo "  若此时仍收到告警邮件，说明事件来自 env=dev（本地 pytest/dev）——"
  echo "  检查 Axiom 三条 Monitor 查询是否都加了 env == \"prod\"。"
  exit 0
fi
echo "✗ 发现问题，见上方 ✗ 项"
exit 1
