
DO $cleanup$
DECLARE
  v_candidate_count bigint;
  v_deleted_count bigint;
BEGIN
  SELECT count(*)
    INTO v_candidate_count
    FROM public.transactions
   WHERE flow_type = 'real_ops'
      OR category = 'REAL_OPS';

  IF v_candidate_count <> 13 THEN
    RAISE EXCEPTION
      'OPS / Real cleanup aborted: expected 13 manual transactions, found %.',
      v_candidate_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.transactions
     WHERE (flow_type = 'real_ops' OR category = 'REAL_OPS')
       AND (
         maker_import_batch_id IS NOT NULL
         OR real_import_batch_id IS NOT NULL
       )
  ) THEN
    RAISE EXCEPTION
      'OPS / Real cleanup aborted: one or more rows unexpectedly reference an import batch.';
  END IF;

  DELETE FROM public.transactions
   WHERE flow_type = 'real_ops'
      OR category = 'REAL_OPS';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count <> 13 THEN
    RAISE EXCEPTION
      'OPS / Real cleanup aborted: expected to delete 13 rows, deleted %.',
      v_deleted_count;
  END IF;
END
$cleanup$;

ALTER TABLE public.transactions
  DROP CONSTRAINT transactions_flow_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_flow_type_check
  CHECK (
    flow_type = ANY (
      ARRAY[
        'income'::text,
        'expense'::text,
        'neutral'::text,
        'ops_disbursement'::text,
        'operational_disbursement'::text
      ]
    )
  );

ALTER TABLE public.transactions
  DROP CONSTRAINT transactions_category_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_category_check
  CHECK (
    category = ANY (
      ARRAY[
        'RAB'::text,
        'Supplier'::text,
        'KPWS'::text,
        'OPS'::text,
        'GAS'::text,
        'SEWA_SPPG'::text,
        'OPERATIONAL'::text,
        'LAIN_LAIN'::text
      ]
    )
  );

ALTER TABLE public.maker_import_batch_rows
  ADD CONSTRAINT maker_import_batch_rows_no_real_ops_check
  CHECK (
    maker_kind IS DISTINCT FROM 'real_ops'
    AND category IS DISTINCT FROM 'REAL_OPS'
  );

DROP FUNCTION public.get_dashboard_summary(date, date, uuid, text[], text);

CREATE FUNCTION public.get_dashboard_summary(
  start_date date,
  end_date date,
  kitchen_uuid uuid,
  flow_types text[] DEFAULT NULL::text[],
  supplier_filter text DEFAULT NULL::text
)
RETURNS TABLE(
  income bigint,
  expense bigint,
  gas bigint,
  operational bigint,
  operational_disbursement bigint,
  sppg_rent bigint
)
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $function$
select
  coalesce(sum(case when t.flow_type = 'income' then t.amount else 0 end), 0)::bigint as income,
  coalesce(sum(case when t.flow_type = 'expense' then t.amount else 0 end), 0)::bigint as expense,
  coalesce(sum(case when t.flow_type = 'neutral' then t.amount else 0 end), 0)::bigint as gas,
  coalesce(sum(case when t.flow_type = 'ops_disbursement' then t.amount else 0 end), 0)::bigint as operational,
  coalesce(sum(case when t.flow_type = 'ops_disbursement' then t.amount else 0 end), 0)::bigint as operational_disbursement,
  coalesce(sum(case when t.flow_type = 'sppg_rent' then t.amount else 0 end), 0)::bigint as sppg_rent
from public.transactions t
left join public.accounts a on a.id = t.account_id
left join public.suppliers s on s.id = t.supplier_id
where t.transaction_date between start_date and end_date
  and (kitchen_uuid is null or t.kitchen_id = kitchen_uuid)
  and (
    flow_types is null
    or t.flow_type = any(flow_types)
    or ('gas' = any(flow_types) and t.flow_type = 'neutral')
  )
  and (
    supplier_filter is null
    or (t.flow_type = 'income' and a.id::text = supplier_filter)
    or (t.flow_type = 'expense' and s.name = supplier_filter)
    or (t.flow_type = 'neutral' and a.id::text = supplier_filter)
    or (t.flow_type = 'ops_disbursement' and t.destination_label = supplier_filter)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(date, date, uuid, text[], text)
  TO PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.get_dashboard_daily_status(date);

CREATE FUNCTION public.get_dashboard_daily_status(p_selected_date date)
RETURNS TABLE(
  kitchen_id uuid,
  kitchen_name text,
  income boolean,
  expense boolean,
  gas boolean,
  operational boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
with transaction_flags as (
  select
    t.kitchen_id,
    coalesce(bool_or(t.flow_type = 'income'), false) as income,
    coalesce(bool_or(t.flow_type = 'expense'), false) as expense,
    coalesce(bool_or(t.flow_type in ('gas', 'neutral')), false) as gas,
    coalesce(bool_or(t.flow_type = 'ops_disbursement'), false) as operational
  from public.transactions t
  where t.transaction_date = p_selected_date
  group by t.kitchen_id
)
select
  k.id as kitchen_id,
  k.name as kitchen_name,
  coalesce(tf.income, false) as income,
  coalesce(tf.expense, false) as expense,
  coalesce(tf.gas, false) as gas,
  coalesce(tf.operational, false) as operational
from public.kitchens k
left join transaction_flags tf
  on tf.kitchen_id = k.id
where k.is_active = true
order by k.name;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_daily_status(date)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_dashboard_daily_status(date)
  TO authenticated, service_role;

DO $remove_transaction_validator$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.validate_transaction_flow()'::regprocedure);

  v_definition := regexp_replace(
    v_definition,
    E'\n  elsif new.flow_type = ''real_ops'' then\n.*?\n  elsif new.flow_type = ''operational_disbursement'' then',
    E'\n  elsif new.flow_type = ''operational_disbursement'' then',
    'ns'
  );

  IF position('real_ops' in lower(v_definition)) > 0
     OR position('REAL_OPS' in v_definition) > 0 THEN
    RAISE EXCEPTION 'Could not fully remove the OPS / Real transaction validator branch.';
  END IF;

  EXECUTE v_definition;
END
$remove_transaction_validator$;

DO $remove_maker_real_ops$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.import_maker_transactions(text,uuid,date,text,jsonb)'::regprocedure
  );

  v_definition := replace(v_definition, ',''real_ops''', '');

  v_definition := replace(
    v_definition,
    '          or (v_flow = ''real_ops'' and t.account_id is null)' || E'\n',
    ''
  );

  v_definition := replace(
    v_definition,
    '    if v_kind = ''real_ops''' || E'\n      or (v_kind = ''lain_lain'' and v_requested_disposition = ''excluded'') then',
    '    if v_kind = ''lain_lain'' and v_requested_disposition = ''excluded'' then'
  );

  v_definition := replace(
    v_definition,
    '    if v_disposition <> ''excluded'' and v_kind <> ''real_ops'' and' || E'\n      (v_recipient = '''' or v_bank = '''' or v_account_number = '''') then',
    '    if v_disposition <> ''excluded'' and' || E'\n      (v_recipient = '''' or v_bank = '''' or v_account_number = '''') then'
  );

  v_definition := replace(
    v_definition,
    '-- OPS Real and explicitly Blocked Lain-lain rows are audit-only and do not' || E'\n      -- need a bank/account identity in the source line.',
    '-- Explicitly Blocked Lain-lain rows are audit-only and do not need a bank/account identity in the source line.'
  );

  v_definition := regexp_replace(
    v_definition,
    '    if btrim\(v_raw_line\) ~ .*? then\n      v_source_label := ''OPS Real'';\n      v_expected_kind := ''real_ops'';\n    else\n(.*?)    end if;\n    if v_kind <> v_expected_kind then',
    '\1    if v_kind <> v_expected_kind then',
    'ns'
  );

  v_definition := regexp_replace(
    v_definition,
    E'\n    elsif v_flow = ''real_ops'' then\n.*?\n    elsif v_flow = ''operational_disbursement'' then',
    E'\n    elsif v_flow = ''operational_disbursement'' then',
    'ns'
  );

  IF position('real_ops' in lower(v_definition)) > 0
     OR position('ops real' in lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Could not fully remove OPS / Real from the Maker import RPC.';
  END IF;

  EXECUTE v_definition;
END
$remove_maker_real_ops$;

NOTIFY pgrst, 'reload schema';
