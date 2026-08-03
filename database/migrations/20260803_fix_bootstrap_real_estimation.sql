-- Corrects empty-year bootstrap so Real stays absent and the frontend can estimate it.
-- SECURITY INVOKER intentionally keeps the existing table grants and RLS policies authoritative.

create or replace function public.bootstrap_dashboard_year(
  p_prefix text,
  p_source_year integer,
  p_target_year integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_prefix text := pg_catalog.lower(pg_catalog.btrim(p_prefix));
  v_rubric_table regclass;
  v_expense_table regclass;
  v_rubric_qualified text;
  v_expense_qualified text;
  v_estimated_column text;
  v_target_rubric_count bigint := 0;
  v_target_item_count bigint := 0;
  v_source_rubric_count bigint := 0;
  v_rubrics_created bigint := 0;
  v_items_created bigint := 0;
begin
  if v_prefix is null or v_prefix not in ('cgd', 'nb', 'coverflex') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported dashboard prefix';
  end if;

  if p_source_year is null
    or p_target_year is null
    or p_source_year < 1900
    or p_source_year > 9998
    or p_target_year < 1901
    or p_target_year > 9999
    or p_target_year <> p_source_year + 1
  then
    raise exception using
      errcode = '22023',
      message = 'Target year must immediately follow a sensible source year';
  end if;

  case v_prefix
    when 'cgd' then
      v_rubric_table := coalesce(
        pg_catalog.to_regclass('public.cgd_rubrica'),
        pg_catalog.to_regclass('public.cgd_rubricas')
      );
      v_expense_table := coalesce(
        pg_catalog.to_regclass('public.cgd_despesa'),
        pg_catalog.to_regclass('public.cgd_despesas')
      );
    when 'nb' then
      v_rubric_table := coalesce(
        pg_catalog.to_regclass('public.nb_rubrica'),
        pg_catalog.to_regclass('public.nb_rubricas')
      );
      v_expense_table := coalesce(
        pg_catalog.to_regclass('public.nb_despesa'),
        pg_catalog.to_regclass('public.nb_despesas')
      );
    when 'coverflex' then
      v_rubric_table := coalesce(
        pg_catalog.to_regclass('public.coverflex_rubrica'),
        pg_catalog.to_regclass('public.coverflex_rubricas')
      );
      v_expense_table := coalesce(
        pg_catalog.to_regclass('public.coverflex_despesa'),
        pg_catalog.to_regclass('public.coverflex_despesas')
      );
  end case;

  if v_rubric_table is null or v_expense_table is null then
    raise exception using
      errcode = '42P01',
      message = pg_catalog.format('Required dashboard tables are missing for prefix %s', v_prefix);
  end if;

  select attribute.attname
    into v_estimated_column
    from pg_catalog.pg_attribute as attribute
   where attribute.attrelid = v_expense_table
     and attribute.attnum > 0
     and not attribute.attisdropped
     and attribute.attname in ('valor_estimado', 'valor_Estimado')
   order by case attribute.attname when 'valor_estimado' then 0 else 1 end
   limit 1;

  if v_estimated_column is null then
    raise exception using
      errcode = '42703',
      message = pg_catalog.format('Estimated-value column is missing from %s', v_expense_table);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('bootstrap_dashboard_year:' || v_prefix),
    p_target_year
  );

  select pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
    into v_rubric_qualified
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
   where relation.oid = v_rubric_table;

  select pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
    into v_expense_qualified
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
   where relation.oid = v_expense_table;

  -- The advisory lock serializes cooperating RPC calls. These deterministic table
  -- locks also exclude the frontend's direct INSERT/UPDATE/DELETE operations while
  -- target emptiness and the source December snapshot are checked and copied.
  -- Existing UPDATE/DELETE grants permit this lock mode, so no grants are broadened.
  execute pg_catalog.format(
    'lock table %s, %s in share row exclusive mode',
    v_rubric_qualified,
    v_expense_qualified
  );

  execute pg_catalog.format(
    'select pg_catalog.count(*) from %s where ano = $1',
    v_rubric_qualified
  )
  into v_target_rubric_count
  using p_target_year;

  execute pg_catalog.format(
    'select pg_catalog.count(*) from %s where ano = $1',
    v_expense_qualified
  )
  into v_target_item_count
  using p_target_year;

  if v_target_rubric_count > 0 or v_target_item_count > 0 then
    return pg_catalog.jsonb_build_object(
      'status', 'noop',
      'code', 'TARGET_NOT_EMPTY',
      'prefix', v_prefix,
      'source_year', p_source_year,
      'target_year', p_target_year,
      'rubrics_created', 0,
      'items_created', 0,
      'real_months_created', 0
    );
  end if;

  execute pg_catalog.format(
    'select pg_catalog.count(*) from %s where ano = $1 and mes = 12',
    v_rubric_qualified
  )
  into v_source_rubric_count
  using p_source_year;

  if v_source_rubric_count = 0 then
    return pg_catalog.jsonb_build_object(
      'status', 'noop',
      'code', 'SOURCE_EMPTY',
      'prefix', v_prefix,
      'source_year', p_source_year,
      'target_year', p_target_year,
      'rubrics_created', 0,
      'items_created', 0,
      'real_months_created', 0
    );
  end if;

  execute pg_catalog.format(
    'insert into %1$s (ano, mes, rubrica_id, rubrica_desc, rubrica_seq, rubrica_tipo)
     select $2, target_month.mes, source.rubrica_id, source.rubrica_desc, source.rubrica_seq, source.rubrica_tipo
       from %1$s as source
       cross join pg_catalog.generate_series(1, 12) as target_month(mes)
      where source.ano = $1
        and source.mes = 12',
    v_rubric_qualified
  )
  using p_source_year, p_target_year;
  get diagnostics v_rubrics_created = row_count;

  execute pg_catalog.format(
    'insert into %1$s (
       ano, mes, rubrica_id, despesa_id, despesa_desc, despesa_seq,
       totalizador, valor, %2$I, zerado
     )
     select
       $2, target_month.mes, source.rubrica_id, source.despesa_id,
       source.despesa_desc, source.despesa_seq, source.totalizador,
       0, 0, false
       from %1$s as source
       cross join pg_catalog.generate_series(1, 12) as target_month(mes)
      where source.ano = $1
        and source.mes = 12',
    v_expense_qualified,
    v_estimated_column
  )
  using p_source_year, p_target_year;
  get diagnostics v_items_created = row_count;

  return pg_catalog.jsonb_build_object(
    'status', 'created',
    'code', 'CREATED',
    'prefix', v_prefix,
    'source_year', p_source_year,
    'target_year', p_target_year,
    'rubrics_created', v_rubrics_created,
    'items_created', v_items_created,
    'real_months_created', 0
  );
end;
$function$;

revoke execute on function public.bootstrap_dashboard_year(text, integer, integer) from public;

-- The current frontend still uses the anon role. Restrict this grant to authenticated
-- when the deferred authentication migration moves dashboard writes off anon.
grant execute on function public.bootstrap_dashboard_year(text, integer, integer) to anon, authenticated;

comment on function public.bootstrap_dashboard_year(text, integer, integer) is
  'Creates a zeroed dashboard year from the preceding December. Real rows remain absent or unchanged so the frontend estimates Real from the prior December.';

-- Manual rollback: reapply database/migrations/20260802_bootstrap_dashboard_year.sql
-- to restore the prior function definition. No Real data changes are required.
