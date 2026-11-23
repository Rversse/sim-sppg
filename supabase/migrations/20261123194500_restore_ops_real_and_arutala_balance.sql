-- OPS / Arutala is identified by the exact Koperasi Arutala BNI account.
-- OPS / Real is expense + OPS. OPS / Pencairan remains separate and excluded
-- from the balance formula.

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
  ops_real bigint,
  operational bigint,
  operational_disbursement bigint,
  sppg_rent bigint
)
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $function$
select
  coalesce(sum(case when t.flow_type = 'income' then t.amount else 0 end), 0)::bigint as income,
  coalesce(sum(case when t.flow_type = 'expense' and t.category = 'Supplier' then t.amount else 0 end), 0)::bigint as expense,
  coalesce(sum(case
    when t.flow_type = 'neutral'
      and upper(regexp_replace(btrim(coalesce(a.bank, '')), '\s+', ' ', 'g')) = 'BNI'
      and lower(regexp_replace(btrim(coalesce(a.name, '')), '\s+', ' ', 'g')) = 'koperasi arutala'
      and regexp_replace(btrim(coalesce(a.account_number, '')), '\s+', '', 'g') = '1985322260'
    then t.amount else 0 end), 0)::bigint as gas,
  coalesce(sum(case when t.flow_type = 'expense' and t.category = 'OPS' then t.amount else 0 end), 0)::bigint as ops_real,
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
    or (
      t.flow_type = any(flow_types)
      and (t.flow_type <> 'expense' or t.category = 'Supplier')
    )
    or (
      'gas' = any(flow_types)
      and t.flow_type = 'neutral'
      and upper(regexp_replace(btrim(coalesce(a.bank, '')), '\s+', ' ', 'g')) = 'BNI'
      and lower(regexp_replace(btrim(coalesce(a.name, '')), '\s+', ' ', 'g')) = 'koperasi arutala'
      and regexp_replace(btrim(coalesce(a.account_number, '')), '\s+', '', 'g') = '1985322260'
    )
    or ('ops_real' = any(flow_types) and t.flow_type = 'expense' and t.category = 'OPS')
  )
  and (
    supplier_filter is null
    or (t.flow_type = 'income' and a.id::text = supplier_filter)
    or (t.flow_type = 'expense' and t.category = 'Supplier' and s.name = supplier_filter)
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
  ops_real boolean,
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
    coalesce(bool_or(t.flow_type = 'expense' and t.category = 'Supplier'), false) as expense,
    coalesce(bool_or(t.flow_type = 'expense' and t.category = 'OPS'), false) as ops_real,
    coalesce(bool_or(
      t.flow_type = 'neutral'
      and upper(regexp_replace(btrim(coalesce(a.bank, '')), '\s+', ' ', 'g')) = 'BNI'
      and lower(regexp_replace(btrim(coalesce(a.name, '')), '\s+', ' ', 'g')) = 'koperasi arutala'
      and regexp_replace(btrim(coalesce(a.account_number, '')), '\s+', '', 'g') = '1985322260'
    ), false) as gas,
    coalesce(bool_or(t.flow_type = 'ops_disbursement'), false) as operational
  from public.transactions t
  left join public.accounts a on a.id = t.account_id
  where t.transaction_date = p_selected_date
  group by t.kitchen_id
)
select
  k.id as kitchen_id,
  k.name as kitchen_name,
  coalesce(tf.income, false) as income,
  coalesce(tf.expense, false) as expense,
  coalesce(tf.ops_real, false) as ops_real,
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

CREATE OR REPLACE FUNCTION public.validate_transaction_flow()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  kitchen_name text;
begin
  if new.flow_type = 'income' then
    if new.category <> 'RAB'
       or new.account_id is null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow Pencairan / RAB tidak valid';
    end if;

  elsif new.flow_type = 'expense' then
    if new.category = 'Supplier' then
      if new.account_id is not null
         or new.supplier_id is null
         or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
        raise exception 'Flow Real / RAB tidak valid';
      end if;
    elsif new.category = 'OPS' then
      if new.account_id is not null
         or new.supplier_id is not null
         or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
        raise exception 'Flow OPS / Real tidak valid';
      end if;
    else
      raise exception 'Kategori flow expense tidak valid';
    end if;

  elsif new.flow_type = 'neutral' then
    if new.category not in ('GAS', 'LAIN_LAIN', 'OPS')
       or new.account_id is null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow neutral tidak valid';
    end if;

    select name
    into kitchen_name
    from public.kitchens
    where id = new.kitchen_id;

    if kitchen_name is null then
      raise exception 'Dapur transaksi tidak ditemukan';
    end if;

    if new.category = 'OPS' and not exists (
      select 1
      from public.kitchen_account_rules kar
      where kar.kitchen_id = new.kitchen_id
        and kar.account_id = new.account_id
        and kar.flow_type = 'neutral'
    ) then
      raise exception 'OPS netral harus memakai rekening yang dimapping netral untuk dapur ini';
    end if;

    if new.category = 'LAIN_LAIN' and not exists (
      select 1
      from public.kitchen_account_rules kar
      join public.accounts a on a.id = kar.account_id
      where kar.kitchen_id = new.kitchen_id
        and kar.account_id = new.account_id
        and kar.flow_type in ('income', 'neutral')
        and upper(regexp_replace(btrim(a.bank), '\s+', ' ', 'g')) = 'BNI'
        and lower(regexp_replace(btrim(a.name), '\s+', ' ', 'g')) = 'koperasi arutala'
    ) then
      raise exception 'Lain-lain hanya boleh masuk ke rekening Koperasi Arutala BNI, Akuntan, atau Aslap';
    end if;

    if new.category = 'GAS' and lower(trim(kitchen_name)) in ('sukaraja', 'cihaur') then
      raise exception 'GAS tidak tersedia untuk dapur Sukaraja dan Cihaur';
    end if;

  elsif new.flow_type = 'ops_disbursement' then
    if new.category <> 'OPS'
       or new.account_id is not null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is null then
      raise exception 'Flow Pencairan / Ops tidak valid';
    end if;

  elsif new.flow_type = 'operational_disbursement' then
    if new.category <> 'OPERATIONAL'
       or new.operational_type is null
       or new.account_id is not null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null
       or (new.note is not null and new.operational_type is distinct from 'vehicle_rent') then
      raise exception 'Flow Pencairan Operasional tidak valid';
    end if;

  else
    raise exception 'Flow transaksi tidak dikenali';
  end if;

  return new;
end;
$function$;

ALTER TABLE public.maker_import_batch_rows
  DROP CONSTRAINT IF EXISTS maker_import_batch_rows_no_real_ops_check;

DO $restore_ops_real_maker$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.import_maker_transactions(text,uuid,date,text,jsonb)'::regprocedure
  );

  v_updated := replace(
    v_definition,
    $old$'pic_posyandu','combined_pic_incentive','combined_payroll','vehicle_rent','lain_lain'
    ) then$old$,
    $new$'pic_posyandu','combined_pic_incentive','combined_payroll','vehicle_rent','lain_lain','real_ops'
    ) then$new$
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not add real_ops to the Maker source-kind allowlist.';
  END IF;
  v_definition := v_updated;

  v_updated := replace(
    v_definition,
    $old$      if position(':' in v_raw_line) = 0 then$old$,
    $new$      if btrim(v_raw_line) ~ '^_OPS Real_[[:space:]]*·[[:space:]]*[0-9]+(\.[0-9]{3})*$' then
        v_source_label := 'OPS Real';
        v_expected_kind := 'real_ops';
      else
      if position(':' in v_raw_line) = 0 then$new$
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not add OPS Real source-line recognition.';
  END IF;
  v_definition := v_updated;

  v_updated := replace(
    v_definition,
    $old$    if v_kind <> v_expected_kind then$old$,
    $new$      end if;
    if v_kind <> v_expected_kind then$new$
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not close the OPS Real source-line classification branch.';
  END IF;
  v_definition := v_updated;

  v_updated := replace(
    v_definition,
    $old$    if v_kind = 'lain_lain' and v_requested_disposition = 'excluded' then
      -- Explicitly Blocked Lain-lain rows are audit-only and do not need a bank/account identity in the source line.$old$,
    $new$    if v_kind = 'real_ops' or (v_kind = 'lain_lain' and v_requested_disposition = 'excluded') then
      -- OPS Real and explicitly Blocked Lain-lain rows do not need a bank/account identity in the source line.$new$
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not skip bank identity parsing for OPS Real.';
  END IF;
  v_definition := v_updated;

  v_updated := replace(
    v_definition,
    $old$    if v_disposition <> 'excluded' and
      (v_recipient = '' or v_bank = '' or v_account_number = '') then$old$,
    $new$    if v_disposition <> 'excluded' and v_kind <> 'real_ops' and
      (v_recipient = '' or v_bank = '' or v_account_number = '') then$new$
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not exempt OPS Real from recipient/bank/account checks.';
  END IF;
  v_definition := v_updated;

  v_updated := replace(
    v_definition,
    $old$          (v_flow in ('income','neutral') and t.account_id is not distinct from v_account_id)
          or (v_flow = 'ops_disbursement'$old$,
    $new$          (v_flow in ('income','neutral') and t.account_id is not distinct from v_account_id)
          or (v_flow = 'expense' and v_category = 'OPS' and t.account_id is null and t.supplier_id is null)
          or (v_flow = 'ops_disbursement'$new$
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not add OPS Real duplicate detection.';
  END IF;
  v_definition := v_updated;

  v_updated := replace(
    v_definition,
    $old$    elsif v_flow = 'ops_disbursement' then$old$,
    $new$    elsif v_flow = 'expense' then
      if v_kind <> 'real_ops'
         or v_category <> 'OPS'
         or v_account_id is not null
         or v_operational_type is not null
         or v_recipient <> ''
         or v_bank <> ''
         or v_account_number <> '' then
        raise exception 'Klasifikasi OPS / Real baris % tidak valid.', v_line_number;
      end if;
    elsif v_flow = 'ops_disbursement' then$new$
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Could not add OPS Real import validation.';
  END IF;
  v_definition := v_updated;

  IF position('real_ops' in lower(v_definition)) = 0
     OR position('OPS / Real' in v_definition) = 0 THEN
    RAISE EXCEPTION 'OPS Real Maker RPC restore did not pass its source verification.';
  END IF;

  EXECUTE v_definition;
END
$restore_ops_real_maker$;

NOTIFY pgrst, 'reload schema';
