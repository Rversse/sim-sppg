-- Make neutral-flow Lain-lain routing data-driven across kitchens.
-- A row classified as Lain-lain/neutral must target an account mapped as neutral
-- for the selected kitchen. It remains category LAIN_LAIN, distinct from GAS and RAB.

do $migration$
declare
  v_definition text;
  v_old_ops text := $old$if v_kind <> 'ops_harian' or v_category <> 'OPS' then$old$;
  v_new_ops text := $new$if v_kind not in ('ops_harian', 'lain_lain') or v_category <> 'OPS' then$new$;
  v_old_neutral text := $old$if v_category <> 'GAS' or v_account_id is null or not exists ($old$;
  v_new_neutral text := $new$if not ((v_kind = 'gas' and v_category = 'GAS') or (v_kind = 'lain_lain' and v_category = 'LAIN_LAIN')) or v_account_id is null or not exists ($new$;
  v_old_gas_kitchen text := $old$if lower(v_kitchen.name) in ('cihaur','sukaraja') then$old$;
  v_new_gas_kitchen text := $new$if v_kind = 'gas' and lower(v_kitchen.name) in ('cihaur','sukaraja') then$new$;
  v_old_duplicate text := $old$where t.transaction_date = p_transaction_date
        and t.kitchen_id = p_kitchen_id
        and t.flow_type = v_flow
        and t.amount = v_amount$old$;
  v_new_duplicate text := $new$where t.transaction_date = p_transaction_date
        and t.kitchen_id = p_kitchen_id
        and t.flow_type = v_flow
        and t.category is not distinct from v_category
        and t.amount = v_amount$new$;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'import_maker_transactions'
    and pg_get_function_identity_arguments(p.oid) =
      'p_content_hash text, p_kitchen_id uuid, p_transaction_date date, p_source_text text, p_rows jsonb';

  if v_definition is null then
    raise exception 'Function public.import_maker_transactions tidak ditemukan.';
  end if;

  if position(v_old_ops in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_ops, v_new_ops);
  elsif position(v_new_ops in v_definition) = 0 then
    raise exception 'Validasi OPS/Lain-lain tidak dikenali; migrasi dibatalkan.';
  end if;

  if position(v_old_neutral in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_neutral, v_new_neutral);
  elsif position(v_new_neutral in v_definition) = 0 then
    raise exception 'Validasi flow neutral tidak dikenali; migrasi dibatalkan.';
  end if;

  if position(v_old_gas_kitchen in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_gas_kitchen, v_new_gas_kitchen);
  elsif position(v_new_gas_kitchen in v_definition) = 0 then
    raise exception 'Validasi pembatasan GAS tidak dikenali; migrasi dibatalkan.';
  end if;

  if position('Rekening GAS baris % tidak cocok dengan mapping bank/nomor rekening di database.' in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      'Rekening GAS baris % tidak cocok dengan mapping bank/nomor rekening di database.',
      'Rekening netral baris % tidak cocok dengan mapping bank/nomor rekening di database.'
    );
  end if;

  if position(v_old_duplicate in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_duplicate, v_new_duplicate);
  elsif position(v_new_duplicate in v_definition) = 0 then
    raise exception 'Pemeriksaan duplikat tidak dikenali; migrasi dibatalkan.';
  end if;

  execute v_definition;
end
$migration$;

-- The transaction guard allows a separate Lain-lain category on the neutral flow.
do $migration$
declare
  v_definition text;
  v_old_category text := $old$if new.category <> 'GAS'$old$;
  v_new_category text := $new$if new.category not in ('GAS', 'LAIN_LAIN')$new$;
  v_old_gas_kitchen text := $old$if lower(trim(kitchen_name)) in ('sukaraja', 'cihaur') then$old$;
  v_new_gas_kitchen text := $new$if new.category = 'GAS' and lower(trim(kitchen_name)) in ('sukaraja', 'cihaur') then$new$;
begin
  select pg_get_functiondef('public.validate_transaction_flow()'::regprocedure)
    into v_definition;

  if v_definition is null then
    raise exception 'Function public.validate_transaction_flow tidak ditemukan.';
  end if;

  if position(v_old_category in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_category, v_new_category);
  elsif position(v_new_category in v_definition) = 0 then
    raise exception 'Validasi kategori flow neutral tidak dikenali; migrasi dibatalkan.';
  end if;

  if position(v_old_gas_kitchen in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_gas_kitchen, v_new_gas_kitchen);
  elsif position(v_new_gas_kitchen in v_definition) = 0 then
    raise exception 'Pembatasan dapur GAS tidak dikenali; migrasi dibatalkan.';
  end if;

  v_definition := replace(v_definition, 'Flow GAS tidak valid', 'Flow neutral tidak valid');
  execute v_definition;
end
$migration$;

-- Do not count neutral Lain-lain transactions as GAS in the dashboard summary.
do $migration$
declare
  v_definition text;
  v_old_sum text := $old$case when t.flow_type = 'neutral' then t.amount else 0 end$old$;
  v_new_sum text := $new$case when t.flow_type = 'neutral' and t.category = 'GAS' then t.amount else 0 end$new$;
  v_old_filter text := $old$('gas' = any(flow_types) and t.flow_type = 'neutral')$old$;
  v_new_filter text := $new$('gas' = any(flow_types) and t.flow_type = 'neutral' and t.category = 'GAS')$new$;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_dashboard_summary'
  order by (pg_get_function_result(p.oid) like '%gas bigint%') desc
  limit 1;

  if v_definition is null then
    raise exception 'Function public.get_dashboard_summary tidak ditemukan.';
  end if;

  if position(v_old_sum in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_sum, v_new_sum);
  elsif position(v_new_sum in v_definition) = 0 then
    raise exception 'Agregasi GAS pada dashboard tidak dikenali; migrasi dibatalkan.';
  end if;

  if position(v_old_filter in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_filter, v_new_filter);
  end if;

  execute v_definition;
end
$migration$;
