#!/usr/bin/env bash
# 构建前检查：禁止与本项目正在运行的前端服务共享 .next。
# 背景：npm run build 与运行中的 next dev 共用 .next 会互相覆盖，
# 导致页面引用 layout.css 等资源返回 404、前端停在“加载中”。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
DEFAULT_PORTS=(3000 3001 3002 3003 3004 3005)

for port in "${DEFAULT_PORTS[@]}" ${PORT:-}; do
  pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  [ -n "$pid" ] || continue
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)"
  if [ "$cwd" = "$ROOT" ]; then
    echo "错误：检测到本项目的服务正在运行（端口 ${port}，PID ${pid}）。" >&2
    echo "npm run build 会覆盖运行中服务使用的 .next，导致页面资源 404。" >&2
    echo "请先停止该服务并清理缓存，再执行构建：" >&2
    echo "  1. 停止前端服务（Ctrl+C 或 kill ${pid}）" >&2
    echo "  2. npm run clean" >&2
    echo "  3. 重新执行 npm run build" >&2
    exit 1
  fi
done

exit 0
