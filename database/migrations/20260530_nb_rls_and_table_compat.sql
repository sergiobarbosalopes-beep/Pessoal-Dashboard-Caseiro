-- Ensure Novo Banco tables support browser (anon) reads/writes similarly to CGD/Coverflex.

grant usage on schema public to anon, authenticated;

create table if not exists public.nb_real (
  ano int4 not null,
  mes int4 not null,
  real numeric,
  constraint nb_real_pkey primary key (ano, mes),
  constraint nb_real_mes_check check (mes between 1 and 12)
);

do $$
declare
  target_table text;
  write_tables text[] := array[
    'nb_rubrica',
    'nb_rubricas',
    'nb_despesa',
    'nb_despesas',
    'nb_real',
    'nb_despesa_nota',
    'nb_despesa_notas',
    'nb_despesas_notas'
  ];
begin
  foreach target_table in array write_tables loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', target_table);
      execute format('alter table public.%I enable row level security', target_table);

      execute format('drop policy if exists %I on public.%I', target_table || '_anon_select_all', target_table);
      execute format('drop policy if exists %I on public.%I', target_table || '_anon_insert_all', target_table);
      execute format('drop policy if exists %I on public.%I', target_table || '_anon_update_all', target_table);
      execute format('drop policy if exists %I on public.%I', target_table || '_anon_delete_all', target_table);

      execute format('create policy %I on public.%I for select to anon, authenticated using (true)', target_table || '_anon_select_all', target_table);
      execute format('create policy %I on public.%I for insert to anon, authenticated with check (true)', target_table || '_anon_insert_all', target_table);
      execute format('create policy %I on public.%I for update to anon, authenticated using (true) with check (true)', target_table || '_anon_update_all', target_table);
      execute format('create policy %I on public.%I for delete to anon, authenticated using (true)', target_table || '_anon_delete_all', target_table);
    end if;
  end loop;
end
$$;
