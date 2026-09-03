#!/usr/bin/env bash
# Supabase Postgres 每日备份(free 版 Dashboard 无 Daily Backups,改用 pg_dump 导出)
#
# 用法:
#   备份:     bash scripts/db_backup.sh
#   恢复演练: 见文件末尾注释
#
# 连接串来源(优先级):环境变量 SUPABASE_DB_URL > 根目录 .env.local 中的 SUPABASE_DB_URL
# 获取方式:Supabase Dashboard → Connect → Session pooler(端口 5432,IPv4 可直连),形如:
#   postgresql://postgres.<项目ref>:<数据库密码>@aws-0-<region>.pooler.supabase.com:5432/postgres
# 数据库密码忘记可在 Dashboard → Project Settings → Database 重置(只影响直连,不影响应用)。
# 连接串含密码:只放 .env.local 或环境变量,严禁写入 Git、文档或对话。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "${SUPABASE_DB_URL:-}" ] && [ -f "$SCRIPT_DIR/../.env.local" ]; then
  SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' "$SCRIPT_DIR/../.env.local" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)"
fi
: "${SUPABASE_DB_URL:?缺少 SUPABASE_DB_URL:export SUPABASE_DB_URL=postgresql://...(Supabase Dashboard → Connect → Session pooler),或写入根目录 .env.local}"

BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups/db}"
KEEP="${KEEP:-14}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/supabase-$STAMP.dump"

pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --file="$OUT"
echo "[OK] $OUT ($(du -h "$OUT" | cut -f1 | tr -d ' '))"

# 只保留最近 KEEP 份,过期删除
ls -1t "$BACKUP_DIR"/supabase-*.dump | tail -n +$((KEEP + 1)) | while IFS= read -r f; do
  rm -f "$f"
  echo "[PRUNE] $f"
done

# 恢复演练(建议每月或发布前做一次;导入到本地临时库,不动线上):
#   createdb supabase_restore_drill
#   pg_restore --no-owner --no-privileges --dbname=supabase_restore_drill backups/db/supabase-<时间戳>.dump
#   psql supabase_restore_drill -c 'select count(*) from schedule_state;' \
#                                  -c 'select count(*) from reminder_log;' \
#                                  -c 'select id from auth.users limit 3;'
#   三条查询能返回行/计数即认为备份可恢复;演练完 dropdb supabase_restore_drill
