-- SUPABASE RLS POLICY FIX FOR nb_real
-- Execute this in Supabase SQL Editor at: https://app.supabase.com/project/uooovgxrexpstrtfktst/sql/new
-- Copy & paste ALL lines below and click RUN

grant usage on schema public to anon, authenticated;

alter table public.nb_real enable row level security;

drop policy if exists nb_real_anon_select_all on public.nb_real;
drop policy if exists nb_real_anon_insert_all on public.nb_real;
drop policy if exists nb_real_anon_update_all on public.nb_real;
drop policy if exists nb_real_anon_delete_all on public.nb_real;

create policy nb_real_anon_select_all
on public.nb_real
for select
to anon, authenticated
using (true);

create policy nb_real_anon_insert_all
on public.nb_real
for insert
to anon, authenticated
with check (true);

create policy nb_real_anon_update_all
on public.nb_real
for update
to anon, authenticated
using (true)
with check (true);

create policy nb_real_anon_delete_all
on public.nb_real
for delete
to anon, authenticated
using (true);

grant select, insert, update, delete on table public.nb_real to anon, authenticated;
