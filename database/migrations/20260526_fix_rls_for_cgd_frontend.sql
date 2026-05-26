-- Restore frontend access for CGD tables when RLS is enabled.
-- This project uses the anon key in browser, so explicit anon policies are required.

grant usage on schema public to anon, authenticated;

do $$
declare
  target_table text;
  write_tables text[] := array[
    'cgd_rubrica',
    'cgd_despesa',
    'cgd_real',
    'cgd_despesa_nota',
    'cgd_rubrica',
    'cgd_despesa',
    'cgd_real',
    'cgd_despesa_nota',
    'cgd_despesa_notas',
    'cgd_despesas_notas'
  ];
begin
  -- Ensure anon/authenticated can use the underlying tables.
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
