-- 토요일 645: 사용자별 저장 + 공동 데이터 저장
-- Supabase SQL Editor에서 한 번 실행하세요.

create table if not exists public.user_kv (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.shared_kv (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_kv enable row level security;
alter table public.shared_kv enable row level security;

drop policy if exists "user_kv_select_own" on public.user_kv;
drop policy if exists "user_kv_insert_own" on public.user_kv;
drop policy if exists "user_kv_update_own" on public.user_kv;
drop policy if exists "user_kv_delete_own" on public.user_kv;

create policy "user_kv_select_own" on public.user_kv
for select using (auth.uid() = user_id);
create policy "user_kv_insert_own" on public.user_kv
for insert with check (auth.uid() = user_id);
create policy "user_kv_update_own" on public.user_kv
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_kv_delete_own" on public.user_kv
for delete using (auth.uid() = user_id);

drop policy if exists "shared_kv_read" on public.shared_kv;
drop policy if exists "shared_kv_write_auth" on public.shared_kv;

-- 공동 채팅/후기는 누구나 읽을 수 있게 하고, 쓰기는 로그인 사용자에게만 허용.
create policy "shared_kv_read" on public.shared_kv
for select using (true);
create policy "shared_kv_write_auth" on public.shared_kv
for all using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

grant select, insert, update, delete on public.user_kv to authenticated;
grant select on public.shared_kv to anon, authenticated;
grant insert, update, delete on public.shared_kv to authenticated;
