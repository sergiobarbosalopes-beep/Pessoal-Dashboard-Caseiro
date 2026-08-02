begin;
set local statement_timeout = '120s';
set local lock_timeout = '15s';

/*__BOOTSTRAP_MIGRATION__*/

-- Abort before any test mutation unless the verified production target remains empty.
do $preflight$
declare
  v_prefix text;
  v_rubric_table regclass;
  v_expense_table regclass;
  v_target_count bigint;
  v_source_count bigint;
begin
  foreach v_prefix in array array['cgd', 'nb', 'coverflex'] loop
    case v_prefix
      when 'cgd' then
        v_rubric_table := coalesce(to_regclass('public.cgd_rubrica'), to_regclass('public.cgd_rubricas'));
        v_expense_table := coalesce(to_regclass('public.cgd_despesa'), to_regclass('public.cgd_despesas'));
      when 'nb' then
        v_rubric_table := coalesce(to_regclass('public.nb_rubrica'), to_regclass('public.nb_rubricas'));
        v_expense_table := coalesce(to_regclass('public.nb_despesa'), to_regclass('public.nb_despesas'));
      when 'coverflex' then
        v_rubric_table := coalesce(to_regclass('public.coverflex_rubrica'), to_regclass('public.coverflex_rubricas'));
        v_expense_table := coalesce(to_regclass('public.coverflex_despesa'), to_regclass('public.coverflex_despesas'));
    end case;

    if v_rubric_table is null or v_expense_table is null then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_PREFLIGHT_TABLE_MISSING:' || v_prefix;
    end if;

    execute format(
      'select (select count(*) from %1$s where ano = 2027)
            + (select count(*) from %2$s where ano = 2027)',
      v_rubric_table,
      v_expense_table
    )
    into v_target_count;

    if v_target_count <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_PREFLIGHT_TARGET_NOT_EMPTY:' || v_prefix;
    end if;

    execute format(
      'select count(*) from %s where ano = 2026 and mes = 12',
      v_rubric_table
    )
    into v_source_count;

    if v_source_count = 0 then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_PREFLIGHT_SOURCE_EMPTY:' || v_prefix;
    end if;
  end loop;
end;
$preflight$;

set local role anon;

do $integration$
declare
  v_prefix text;
  v_rubric_table regclass;
  v_expense_table regclass;
  v_real_table regclass;
  v_note_table regclass;
  v_note_name text;
  v_estimated_column text;
  v_result jsonb;
  v_source_rubrics bigint;
  v_source_items bigint;
  v_target_rubrics bigint;
  v_target_items bigint;
  v_mismatch_count bigint;
  v_note_count_before bigint;
  v_note_count_after bigint;
  v_note_table_count bigint;
  v_real_before jsonb;
  v_real_before_count integer;
  v_real_preserved_count bigint;
  v_real_target_count bigint;
  v_real_invalid_new_count bigint;
  v_partial_before jsonb;
  v_partial_after jsonb;
begin
  foreach v_prefix in array array['cgd', 'nb', 'coverflex'] loop
    case v_prefix
      when 'cgd' then
        v_rubric_table := coalesce(to_regclass('public.cgd_rubrica'), to_regclass('public.cgd_rubricas'));
        v_expense_table := coalesce(to_regclass('public.cgd_despesa'), to_regclass('public.cgd_despesas'));
        v_real_table := coalesce(to_regclass('public.cgd_real'), to_regclass('public.cgd_reais'));
      when 'nb' then
        v_rubric_table := coalesce(to_regclass('public.nb_rubrica'), to_regclass('public.nb_rubricas'));
        v_expense_table := coalesce(to_regclass('public.nb_despesa'), to_regclass('public.nb_despesas'));
        v_real_table := coalesce(to_regclass('public.nb_real'), to_regclass('public.nb_reais'));
      when 'coverflex' then
        v_rubric_table := coalesce(to_regclass('public.coverflex_rubrica'), to_regclass('public.coverflex_rubricas'));
        v_expense_table := coalesce(to_regclass('public.coverflex_despesa'), to_regclass('public.coverflex_despesas'));
        v_real_table := coalesce(to_regclass('public.coverflex_real'), to_regclass('public.coverflex_reais'));
    end case;

    select attribute.attname
      into v_estimated_column
      from pg_attribute as attribute
     where attribute.attrelid = v_expense_table
       and attribute.attnum > 0
       and not attribute.attisdropped
       and attribute.attname in ('valor_estimado', 'valor_Estimado')
     order by case attribute.attname when 'valor_estimado' then 0 else 1 end
     limit 1;

    execute format(
      'select count(*) from %s where ano = 2026 and mes = 12',
      v_rubric_table
    )
    into v_source_rubrics;

    execute format(
      'select count(*) from %s where ano = 2026 and mes = 12',
      v_expense_table
    )
    into v_source_items;

    execute format(
      'select coalesce(
         jsonb_agg(jsonb_build_object(''mes'', mes, ''real'', real) order by mes),
         ''[]''::jsonb
       )
       from %s
       where ano = 2027',
      v_real_table
    )
    into v_real_before;
    v_real_before_count := jsonb_array_length(v_real_before);

    v_note_count_before := 0;
    foreach v_note_name in array array[
      v_prefix || '_despesa_nota',
      v_prefix || '_despesa_notas',
      v_prefix || '_despesas_notas'
    ] loop
      v_note_table := to_regclass(format('public.%I', v_note_name));
      if v_note_table is not null then
        execute format('select count(*) from %s where ano = 2027', v_note_table)
          into v_note_table_count;
        v_note_count_before := v_note_count_before + v_note_table_count;
      end if;
    end loop;

    v_result := public.bootstrap_dashboard_year(v_prefix, 2026, 2027);
    if v_result ->> 'code' <> 'CREATED'
      or (v_result ->> 'rubrics_created')::bigint <> v_source_rubrics * 12
      or (v_result ->> 'items_created')::bigint <> v_source_items * 12
      or (v_result ->> 'real_months_created')::integer <> 12 - v_real_before_count
    then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_CREATED_RESULT:' || v_prefix;
    end if;

    execute format('select count(*) from %s where ano = 2027', v_rubric_table)
      into v_target_rubrics;
    execute format('select count(*) from %s where ano = 2027', v_expense_table)
      into v_target_items;
    if v_target_rubrics <> v_source_rubrics * 12 or v_target_items <> v_source_items * 12 then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_CREATED_COUNTS:' || v_prefix;
    end if;

    execute format(
      'select count(*)
         from (
           (
             select target_month.mes, source.rubrica_id, source.rubrica_desc,
                    source.rubrica_seq, source.rubrica_tipo
               from %1$s as source
               cross join generate_series(1, 12) as target_month(mes)
              where source.ano = 2026 and source.mes = 12
             except
             select target.mes, target.rubrica_id, target.rubrica_desc,
                    target.rubrica_seq, target.rubrica_tipo
               from %1$s as target
              where target.ano = 2027
           )
           union all
           (
             select target.mes, target.rubrica_id, target.rubrica_desc,
                    target.rubrica_seq, target.rubrica_tipo
               from %1$s as target
              where target.ano = 2027
             except
             select target_month.mes, source.rubrica_id, source.rubrica_desc,
                    source.rubrica_seq, source.rubrica_tipo
               from %1$s as source
               cross join generate_series(1, 12) as target_month(mes)
              where source.ano = 2026 and source.mes = 12
           )
         ) as differences',
      v_rubric_table
    )
    into v_mismatch_count;
    if v_mismatch_count <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_RUBRIC_STRUCTURE:' || v_prefix;
    end if;

    execute format(
      'select count(*)
         from (
           (
             select target_month.mes, source.rubrica_id, source.despesa_id,
                    source.despesa_desc, source.despesa_seq, source.totalizador
               from %1$s as source
               cross join generate_series(1, 12) as target_month(mes)
              where source.ano = 2026 and source.mes = 12
             except
             select target.mes, target.rubrica_id, target.despesa_id,
                    target.despesa_desc, target.despesa_seq, target.totalizador
               from %1$s as target
              where target.ano = 2027
           )
           union all
           (
             select target.mes, target.rubrica_id, target.despesa_id,
                    target.despesa_desc, target.despesa_seq, target.totalizador
               from %1$s as target
              where target.ano = 2027
             except
             select target_month.mes, source.rubrica_id, source.despesa_id,
                    source.despesa_desc, source.despesa_seq, source.totalizador
               from %1$s as source
               cross join generate_series(1, 12) as target_month(mes)
              where source.ano = 2026 and source.mes = 12
           )
         ) as differences',
      v_expense_table
    )
    into v_mismatch_count;
    if v_mismatch_count <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_ITEM_STRUCTURE:' || v_prefix;
    end if;

    execute format(
      'select count(*)
         from %1$s
        where ano = 2027
          and (
            valor is distinct from 0
            or %2$I is distinct from 0
            or zerado is distinct from false
          )',
      v_expense_table,
      v_estimated_column
    )
    into v_mismatch_count;
    if v_mismatch_count <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_ITEM_VALUES:' || v_prefix;
    end if;

    execute format(
      'select count(*)
         from jsonb_to_recordset($1) as snapshot(mes integer, real numeric)
         join %1$s as current_row
           on current_row.ano = 2027 and current_row.mes = snapshot.mes
        where current_row.real is not distinct from snapshot.real',
      v_real_table
    )
    into v_real_preserved_count
    using v_real_before;

    execute format('select count(*) from %s where ano = 2027', v_real_table)
      into v_real_target_count;

    execute format(
      'select count(*)
         from generate_series(1, 12) as target_month(mes)
         join %1$s as current_row
           on current_row.ano = 2027 and current_row.mes = target_month.mes
         left join jsonb_to_recordset($1) as snapshot(mes integer, real numeric)
           on snapshot.mes = target_month.mes
        where snapshot.mes is null
          and current_row.real is distinct from 0',
      v_real_table
    )
    into v_real_invalid_new_count
    using v_real_before;

    if v_real_preserved_count <> v_real_before_count
      or v_real_target_count <> 12
      or v_real_invalid_new_count <> 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_REAL_ROWS:' || v_prefix;
    end if;

    v_note_count_after := 0;
    foreach v_note_name in array array[
      v_prefix || '_despesa_nota',
      v_prefix || '_despesa_notas',
      v_prefix || '_despesas_notas'
    ] loop
      v_note_table := to_regclass(format('public.%I', v_note_name));
      if v_note_table is not null then
        execute format('select count(*) from %s where ano = 2027', v_note_table)
          into v_note_table_count;
        v_note_count_after := v_note_count_after + v_note_table_count;
      end if;
    end loop;
    if v_note_count_after <> v_note_count_before then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_NOTES_MUTATED:' || v_prefix;
    end if;

    v_result := public.bootstrap_dashboard_year(v_prefix, 2026, 2027);
    execute format('select count(*) from %s where ano = 2027', v_rubric_table)
      into v_target_rubrics;
    execute format('select count(*) from %s where ano = 2027', v_expense_table)
      into v_target_items;
    if v_result ->> 'code' <> 'TARGET_NOT_EMPTY'
      or v_target_rubrics <> v_source_rubrics * 12
      or v_target_items <> v_source_items * 12
    then
      raise exception using
        errcode = 'P0001',
        message = 'BOOTSTRAP_INTEGRATION_REPEAT_CALL:' || v_prefix;
    end if;

    begin
      execute format('delete from %s where ano = 2027', v_expense_table);
      execute format('delete from %s where ano = 2027', v_rubric_table);
      execute format(
        'insert into %1$s (ano, mes, rubrica_id, rubrica_desc, rubrica_seq, rubrica_tipo)
         select 2027, 1, rubrica_id, rubrica_desc, rubrica_seq, rubrica_tipo
           from %1$s
          where ano = 2026 and mes = 12
          order by rubrica_id
          limit 1',
        v_rubric_table
      );

      execute format(
        'select coalesce(jsonb_agg(to_jsonb(target) order by target.mes, target.rubrica_id), ''[]''::jsonb)
           from %s as target
          where target.ano = 2027',
        v_rubric_table
      )
      into v_partial_before;

      v_result := public.bootstrap_dashboard_year(v_prefix, 2026, 2027);
      execute format('select count(*) from %s where ano = 2027', v_rubric_table)
        into v_target_rubrics;
      execute format('select count(*) from %s where ano = 2027', v_expense_table)
        into v_target_items;
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(target) order by target.mes, target.rubrica_id), ''[]''::jsonb)
           from %s as target
          where target.ano = 2027',
        v_rubric_table
      )
      into v_partial_after;
      if v_result ->> 'code' <> 'TARGET_NOT_EMPTY'
        or v_target_rubrics <> 1
        or v_target_items <> 0
        or v_partial_after is distinct from v_partial_before
      then
        raise exception using
          errcode = 'P0001',
          message = 'BOOTSTRAP_INTEGRATION_PARTIAL_TARGET:' || v_prefix;
      end if;

      raise exception using errcode = 'ZX001', message = 'ROLLBACK_PARTIAL_TARGET';
    exception
      when sqlstate 'ZX001' then null;
    end;

    begin
      execute format('delete from %s where ano in (9998, 9999)', v_expense_table);
      execute format('delete from %s where ano in (9998, 9999)', v_rubric_table);
      v_result := public.bootstrap_dashboard_year(v_prefix, 9998, 9999);
      if v_result ->> 'code' <> 'SOURCE_EMPTY' then
        raise exception using
          errcode = 'P0001',
          message = 'BOOTSTRAP_INTEGRATION_SOURCE_EMPTY:' || v_prefix;
      end if;
      raise exception using errcode = 'ZX001', message = 'ROLLBACK_SOURCE_EMPTY';
    exception
      when sqlstate 'ZX001' then null;
    end;
  end loop;

  begin
    perform public.bootstrap_dashboard_year('invalid', 2026, 2027);
    raise exception using errcode = 'P0001', message = 'BOOTSTRAP_INTEGRATION_INVALID_PREFIX_NOT_REJECTED';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.bootstrap_dashboard_year('cgd', 2026, 2028);
    raise exception using errcode = 'P0001', message = 'BOOTSTRAP_INTEGRATION_INVALID_YEAR_NOT_REJECTED';
  exception
    when sqlstate '22023' then null;
  end;
end;
$integration$;

reset role;

do $failure_preflight$
begin
  if to_regprocedure('public.bootstrap_dashboard_year_integration_failure()') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'BOOTSTRAP_INTEGRATION_FAILURE_HELPER_EXISTS';
  end if;
end;
$failure_preflight$;

create function public.bootstrap_dashboard_year_integration_failure()
returns trigger
language plpgsql
as $failure_function$
begin
  if new.ano = 2027 then
    raise exception using errcode = 'ZX002', message = 'INJECTED_BOOTSTRAP_FAILURE';
  end if;
  return new;
end;
$failure_function$;

do $failure_trigger$
declare
  v_expense_table regclass := coalesce(
    to_regclass('public.cgd_despesa'),
    to_regclass('public.cgd_despesas')
  );
begin
  execute format(
    'create trigger bootstrap_dashboard_year_integration_failure
       before insert on %s
       for each row
       execute function public.bootstrap_dashboard_year_integration_failure()',
    v_expense_table
  );
end;
$failure_trigger$;

set local role anon;

do $failure_test$
declare
  v_rubric_table regclass := coalesce(
    to_regclass('public.cgd_rubrica'),
    to_regclass('public.cgd_rubricas')
  );
  v_expense_table regclass := coalesce(
    to_regclass('public.cgd_despesa'),
    to_regclass('public.cgd_despesas')
  );
  v_failed boolean := false;
  v_target_count bigint;
begin
  execute format('delete from %s where ano = 2027', v_expense_table);
  execute format('delete from %s where ano = 2027', v_rubric_table);

  begin
    perform public.bootstrap_dashboard_year('cgd', 2026, 2027);
  exception
    when sqlstate 'ZX002' then v_failed := true;
  end;

  execute format(
    'select (select count(*) from %1$s where ano = 2027)
          + (select count(*) from %2$s where ano = 2027)',
    v_rubric_table,
    v_expense_table
  )
  into v_target_count;

  if not v_failed or v_target_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'BOOTSTRAP_INTEGRATION_ATOMIC_ROLLBACK';
  end if;
end;
$failure_test$;

reset role;
rollback;

select 'BOOTSTRAP_INTEGRATION_PASS' as status;
