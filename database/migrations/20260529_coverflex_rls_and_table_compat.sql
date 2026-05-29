-- Ensure Coverflex tables support browser (anon) reads/writes similarly to CGD.
-- Also aligns table naming variants (singular/plural) used across environments.

grant usage on schema public to anon, authenticated;

create table if not exists public.coverflex_real (
  ano int4 not null,
  mes int4 not null,
  real numeric,
  constraint coverflex_real_pkey primary key (ano, mes),
  constraint coverflex_real_mes_check check (mes between 1 and 12)
);

do $$
declare
  target_table text;
  write_tables text[] := array[
    'coverflex_rubrica',
    'coverflex_rubricas',
    'coverflex_despesa',
    'coverflex_despesas',
    'coverflex_real',
    'coverflex_despesa_nota',
    'coverflex_despesa_notas',
    'coverflex_despesas_notas'
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

do $$
declare
  rubric_table text;
  check_name text;
begin
  foreach rubric_table in array array['coverflex_rubrica', 'coverflex_rubricas'] loop
    if to_regclass(format('public.%I', rubric_table)) is null then
      continue;
    end if;

    select c.conname
      into check_name
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = rubric_table
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%rubrica_tipo%'
     limit 1;

    if check_name is not null then
      execute format('alter table public.%I drop constraint %I', rubric_table, check_name);
    end if;

    execute format(
      'alter table public.%I add constraint %I check (rubrica_tipo in (''Despesa'', ''Receita'', ''Aprovisionamento''))',
      rubric_table,
      rubric_table || '_rubrica_tipo_check'
    );
  end loop;
end
$$;
