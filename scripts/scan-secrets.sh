#!/usr/bin/env bash
# 安全扫描：已跟踪文件中的密钥/凭据与危险渲染 API。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$ROOT"

fail=0

scan_tracked() {
  local label="$1" pattern="$2"
  local matches
  matches="$(rg -n -i --hidden \
    -g '!node_modules/**' \
    -g '!.git/**' \
    -g '!.next/**' \
    -g '!package-lock.json' \
    -g '!scripts/scan-secrets.sh' \
    -g '!.env*' \
    "$pattern" . 2>/dev/null || true)"
  if [ -n "$matches" ]; then
    echo "[FAIL] $label"
    echo "$matches"
    fail=1
  else
    echo "[PASS] $label"
  fi
}

scan_tracked "密钥/高熵 token 模式" \
  'sk_(live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

scan_tracked "带值的密钥环境变量" \
  '(NEXT_PUBLIC_SUPABASE_ANON_KEY|OPENAI_API_KEY|DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|PUSHPLUS_TOKEN|SERVERCHAN_KEY|WECOM_WEBHOOK_URL)\s*=\s*["'\'']?[^[:space:]"'\'']'

scan_tracked "明显凭据赋值" \
  '(password|secret|api[_-]?key)\s*=\s*["'\'']?[^[:space:]"'\'']'

tracked_env="$(git ls-files | rg '(^|/)\.env($|\.local$|\.prod$|\.staging$)' || true)"
if [ -n "$tracked_env" ]; then
  echo "[FAIL] 真实环境文件被 Git 跟踪"
  echo "$tracked_env"
  fail=1
else
  echo "[PASS] 真实 .env 文件未被 Git 跟踪"
fi

dangerous="$(rg -n --hidden -g '!node_modules/**' -g '!.git/**' -g '!.next/**' \
  'dangerouslySetInnerHTML|document\.write|eval\(' src 2>/dev/null || true)"
if [ -n "$dangerous" ]; then
  echo "[FAIL] 发现危险渲染/执行 API"
  echo "$dangerous"
  fail=1
else
  echo "[PASS] 未发现危险渲染/执行 API"
fi

exit "$fail"
