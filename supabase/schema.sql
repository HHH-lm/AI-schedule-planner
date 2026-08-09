-- AI 日程管理系统：云同步表结构（user_id 隔离版）
-- 在 Supabase SQL Editor 中执行。

create table if not exists public.schedule_state (
  user_id text not null,
  id text not null default 'singleton',
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- 单用户边界说明：
-- 应用尚未接入 Supabase Auth，本表默认不启用 RLS，靠应用层强制
-- 配置 NEXT_PUBLIC_SUPABASE_USER_ID 并按 user_id 隔离数据行。
-- 多人部署前必须接入 Supabase Auth，并执行以下加固 SQL：

-- alter table public.schedule_state enable row level security;
--
-- create policy schedule_state_select on public.schedule_state
--   for select using (user_id = auth.uid()::text);
-- create policy schedule_state_insert on public.schedule_state
--   for insert with check (user_id = auth.uid()::text);
-- create policy schedule_state_update on public.schedule_state
--   for update using (user_id = auth.uid()::text)
--   with check (user_id = auth.uid()::text);
-- create policy schedule_state_delete on public.schedule_state
--   for delete using (user_id = auth.uid()::text);
