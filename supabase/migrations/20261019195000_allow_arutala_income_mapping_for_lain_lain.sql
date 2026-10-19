-- Lain-lain can use the selected kitchen's mapped Koperasi Arutala BNI account
-- whether it is currently referenced by RAB/income or neutral/GAS. Its transaction
-- still stores flow_type=neutral and category=LAIN_LAIN.

do $migration$
declare
  v_definition text;
  v_neutral_start integer;
  v_ops_start integer;
  v_neutral_chunk text;
  v_old_mapping text := $old$where kar.kitchen_id = p_kitchen_id and kar.account_id = v_account_id and kar.flow_type = 'neutral'$old$;
  v_new_mapping text := $new$where kar.kitchen_id = p_kitchen_id and kar.account_id = v_account_id
          and (
            kar.flow_type = 'neutral'
            or (v_kind = 'lain_lain' and v_category = 'LAIN_LAIN' and kar.flow_type = 'income')
          )$new$;
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

  v_neutral_start := position('elsif v_flow = ''neutral'' then' in v_definition);
  v_ops_start := position('elsif v_flow = ''ops_disbursement'' then' in v_definition);
  if v_neutral_start = 0 or v_ops_start = 0 or v_neutral_start >= v_ops_start then
    raise exception 'Struktur flow neutral Maker tidak dikenali; migrasi dibatalkan.';
  end if;

  v_neutral_chunk := substring(v_definition from v_neutral_start for v_ops_start - v_neutral_start);
  if position(v_old_mapping in v_neutral_chunk) > 0 then
    v_neutral_chunk := replace(v_neutral_chunk, v_old_mapping, v_new_mapping);
  elsif position(v_new_mapping in v_neutral_chunk) = 0 then
    raise exception 'Mapping neutral/RAB untuk Lain-lain tidak dikenali; migrasi dibatalkan.';
  end if;

  v_definition := substring(v_definition from 1 for v_neutral_start - 1)
    || v_neutral_chunk
    || substring(v_definition from v_ops_start);
  execute v_definition;
end
$migration$;

do $migration$
declare
  v_definition text;
  v_old_mapping text := $old$and kar.flow_type = 'neutral'$old$;
  v_new_mapping text := $new$and kar.flow_type in ('income', 'neutral')$new$;
begin
  select pg_get_functiondef('public.validate_transaction_flow()'::regprocedure)
    into v_definition;

  if v_definition is null then
    raise exception 'Function public.validate_transaction_flow tidak ditemukan.';
  end if;

  if position(v_old_mapping in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_mapping, v_new_mapping);
  elsif position(v_new_mapping in v_definition) = 0 then
    raise exception 'Mapping neutral pada trigger transaksi tidak dikenali; migrasi dibatalkan.';
  end if;

  execute v_definition;
end
$migration$;
