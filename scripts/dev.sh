#!/usr/bin/env bash
# 防止同一项目出现多个 next dev 实例共享 .next 缓存（曾导致 3000 端口 500）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
BIN="$ROOT/node_modules/.bin/next"
PORT="${PORT:-3000}"
DEFAULT_PORTS=(3000 3001 3002 3003 3004 3005)

find_pid_on_port() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

cwd_of() {
  local pid="$1"
  lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true
}

http_code_on() {
  local port="$1"
  curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port" 2>/dev/null || true
}

same_project_running() {
  local port pid cwd
  for port in "${DEFAULT_PORTS[@]}"; do
    pid="$(find_pid_on_port "$port")"
    [ -n "$pid" ] || continue
    cwd="$(cwd_of "$pid")"
    if [ "$cwd" = "$ROOT" ]; then
      echo "$port $pid"
      return 0
    fi
  done
  return 1
}

existing="$(same_project_running || true)"
if [ -n "$existing" ]; then
  existing_port="${existing%% *}"
  existing_pid="${existing##* }"
  if [[ "$(http_code_on "$existing_port")" =~ ^2 ]]; then
    echo "AI 日程 dev server 已在运行：http://localhost:$existing_port"
    exit 0
  fi
  echo "检测到本项目实例异常（PID $existing_pid，端口 $existing_port），正在停止并清理缓存后重启..."
  parent="$(ps -o ppid= -p "$existing_pid" 2>/dev/null | tr -d ' ' || true)"
  kill "$existing_pid" "$parent" 2>/dev/null || true
  sleep 1
  rm -rf "$ROOT/.next"
fi

blocking_pid="$(find_pid_on_port "$PORT")"
if [ -n "$blocking_pid" ]; then
  blocking_cwd="$(cwd_of "$blocking_pid")"
  if [ "$blocking_cwd" != "$ROOT" ]; then
    echo "端口 $PORT 已被其他进程占用（PID $blocking_pid），请先释放端口，或使用 PORT 环境变量指定其他端口。"
    exit 1
  fi
fi

exec "$BIN" dev -p "$PORT"
