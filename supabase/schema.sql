-- AI 日程管理系统：云同步表结构（Supabase Auth 多租户版）
-- 在 Supabase SQL Editor 中执行；需先启用 Authentication > Email provider。

create table if not exists public.schedule_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null default 'singleton',
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.schedule_state enable row level security;

drop policy if exists schedule_state_select on public.schedule_state;
create policy schedule_state_select on public.schedule_state
  for select using (user_id = auth.uid());

drop policy if exists schedule_state_insert on public.schedule_state;
create policy schedule_state_insert on public.schedule_state
  for insert with check (user_id = auth.uid());

drop policy if exists schedule_state_update on public.schedule_state;
create policy schedule_state_update on public.schedule_state
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists schedule_state_delete on public.schedule_state;
create policy schedule_state_delete on public.schedule_state
  for delete using (user_id = auth.uid());

-- 旧版 text user_id 表升级（若之前执行过单用户边界版 schema）：
-- alter table public.schedule_state
--   alter column user_id type uuid using user_id::uuid;
-- 升级前请确认旧行的 user_id 均为有效 UUID，否则先删除旧测试行。
