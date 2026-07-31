-- User administration table for dashboard access controls.
-- Stores one row per user email with read/edit permissions.

grant usage on schema public to anon, authenticated;

create table if not exists public.admin (
  email text primary key,
  consultar boolean not null default true,
  editar boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint admin_email_check check (position('@' in email) > 1)
);

create or replace function public.admin_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end
$$;

drop trigger if exists admin_set_updated_at on public.admin;
create trigger admin_set_updated_at
before update on public.admin
for each row
execute function public.admin_set_updated_at();

alter table public.admin enable row level security;
grant select, insert, update, delete on table public.admin to anon, authenticated;

drop policy if exists admin_anon_select_all on public.admin;
drop policy if exists admin_anon_insert_all on public.admin;
drop policy if exists admin_anon_update_all on public.admin;
drop policy if exists admin_anon_delete_all on public.admin;

create policy admin_anon_select_all
on public.admin
for select
to anon, authenticated
using (true);

create policy admin_anon_insert_all
on public.admin
for insert
to anon, authenticated
with check (true);

create policy admin_anon_update_all
on public.admin
for update
to anon, authenticated
using (true)
with check (true);

create policy admin_anon_delete_all
on public.admin
for delete
to anon, authenticated
using (true);

insert into public.admin (email, consultar, editar)
values ('sergiobarbosalopes@gmail.com', true, true)
on conflict (email) do update
set consultar = excluded.consultar,
    editar = excluded.editar;
