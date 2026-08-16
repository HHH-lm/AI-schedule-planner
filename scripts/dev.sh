#!/usr/bin/env bash
# 同时启动 FastAPI 后端（8000）与 Next.js 前端（3000）。
# 防多实例逻辑沿用既有实现，避免共享 .next 缓存导致端口 500。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
BIN="$ROOT/node_modules/.bin/next"
PORT="${PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
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
  local path="${2:-/}"
  curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}${path}" 2>/dev/null || true
}

frontend_assets_ok() {
  local port="$1"
  local home page
  home="$(http_code_on "$port" /)"
  [ "$home" = "200" ] || return 1
  page="$(http_code_on "$port" /_next/static/chunks/app/page.js)"
  [ "$page" = "200" ]
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

backend_started=0

ensure_backend() {
  local venv_py="$ROOT/backend/.venv/bin/python"
  if [ ! -x "$venv_py" ]; then
    echo "未找到 backend/.venv，请先运行：uv sync --project backend --extra dev"
    exit 1
  fi

  if [ -f "$ROOT/.backend.pid" ]; then
    local saved_pid
    saved_pid="$(cat "$ROOT/.backend.pid" 2>/dev/null || true)"
    if [ -n "$saved_pid" ] && kill -0 "$saved_pid" 2>/dev/null; then
      echo "FastAPI 后端已在运行：http://localhost:${BACKEND_PORT}"
      return 0
    fi
  fi

  local existing_pid
  existing_pid="$(find_pid_on_port "$BACKEND_PORT")"
  if [ -n "$existing_pid" ]; then
    local existing_cwd
    existing_cwd="$(cwd_of "$existing_pid")"
    if [ "$existing_cwd" = "$ROOT" ] || [ "$existing_cwd" = "$ROOT/backend" ]; then
      echo "$existing_pid" > "$ROOT/.backend.pid"
      echo "FastAPI 后端已在运行：http://localhost:${BACKEND_PORT}"
      return 0
    fi
    echo "端口 $BACKEND_PORT 已被其他进程占用（PID ${existing_pid}），请先释放端口，或使用 BACKEND_PORT 环境变量指定其他端口。"
    exit 1
  fi

  (
    cd "$ROOT/backend"
    exec "$venv_py" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload
  ) >"$ROOT/.backend.log" 2>&1 &
  backend_pid=$!
  echo "$backend_pid" > "$ROOT/.backend.pid"
  backend_started=1
  for _ in {1..40}; do
    if [ "$(http_code_on "$BACKEND_PORT" /api/v1/health)" = "200" ]; then
      echo "FastAPI 后端已启动：http://localhost:${BACKEND_PORT}"
      return 0
    fi
    sleep 0.5
  done
  echo "FastAPI 后端启动失败，日志见 .backend.log："
  tail -n 20 "$ROOT/.backend.log" 2>/dev/null || true
  exit 1
}

next_pid=""
cleanup() {
  if [ -n "$next_pid" ]; then
    kill "$next_pid" 2>/dev/null || true
  fi
  if [ "$backend_started" = "1" ] && [ -n "${backend_pid:-}" ] && [ -n "$next_pid" ]; then
    kill "$backend_pid" 2>/dev/null || true
    rm -f "$ROOT/.backend.pid"
  fi
}
trap cleanup EXIT

existing="$(same_project_running || true)"
if [ -n "$existing" ]; then
  existing_port="${existing%% *}"
  existing_pid="${existing##* }"
  if frontend_assets_ok "$existing_port"; then
    ensure_backend
    echo "AI日程 dev server 已在运行：http://localhost:${existing_port}"
    exit 0
  fi
  echo "检测到本项目前端实例异常（PID ${existing_pid}，端口 ${existing_port}），正在停止并清理缓存后重启..."
  parent="$(ps -o ppid= -p "${existing_pid}" 2>/dev/null | tr -d ' ' || true)"
  kill "${existing_pid}" "$parent" 2>/dev/null || true
  sleep 1
  rm -rf "$ROOT/.next"
fi

ensure_backend

blocking_pid="$(find_pid_on_port "$PORT")"
if [ -n "$blocking_pid" ]; then
  blocking_cwd="$(cwd_of "$blocking_pid")"
  if [ "$blocking_cwd" != "$ROOT" ]; then
    echo "端口 $PORT 已被其他进程占用（PID $blocking_pid），请先释放端口，或使用 PORT 环境变量指定其他端口。"
    exit 1
  fi
fi

"$BIN" dev -p "$PORT" &
next_pid=$!
wait "$next_pid"
