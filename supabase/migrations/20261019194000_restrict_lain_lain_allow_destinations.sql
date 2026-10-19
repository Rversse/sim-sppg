-- Restrict Allow for Maker Lain-lain to supported, detected destinations.
-- Accepted destinations are:
--   1) a mapped Akuntan operational account,
--   2) a mapped Aslap operational account, or
--   3) the selected kitchen's mapped Koperasi Arutala BNI neutral account.
-- Any other Lain-lain destination remains audit-only via Block; Allow is rejected.

do $migration$
declare
  v_definition text;
  v_neutral_start integer;
  v_ops_start integer;
  v_real_start integer;
  v_neutral_chunk text;
  v_ops_chunk text;
  v_old_bank_guard text := $old$and upper(regexp_replace(btrim(a.bank), '\s+', ' ', 'g')) = v_bank$old$;
  v_new_bank_guard text := $new$and upper(regexp_replace(btrim(a.bank), '\s+', ' ', 'g')) = v_bank
          and upper(regexp_replace(btrim(a.bank), '\s+', ' ', 'g')) = 'BNI'
          and lower(regexp_replace(btrim(a.name), '\s+', ' ', 'g')) = 'koperasi arutala'
          and lower(regexp_replace(btrim(v_recipient), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(a.name), '\s+', ' ', 'g'))$new$;
  v_old_ops_match text := $old$and lower(regexp_replace(btrim(r.owner_name), '\s+', ' ', 'g')) = lower(regexp_replace(v_recipient, '\s+', ' ', 'g'))$old$;
  v_new_ops_match text := $new$and (v_kind <> 'lain_lain' or lower(coalesce(r.target_role, '')) in ('akuntan', 'aslap'))
          and lower(regexp_replace(btrim(r.owner_name), '\s+', ' ', 'g')) = lower(regexp_replace(v_recipient, '\s+', ' ', 'g'))$new$;
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
  v_real_start := position('elsif v_flow = ''real_ops'' then' in v_definition);

  if v_neutral_start = 0 or v_ops_start = 0 or v_real_start = 0 or v_neutral_start >= v_ops_start or v_ops_start >= v_real_start then
    raise exception 'Struktur flow import Maker tidak dikenali; migrasi dibatalkan.';
  end if;

  v_neutral_chunk := substring(v_definition from v_neutral_start for v_ops_start - v_neutral_start);
  if position(v_old_bank_guard in v_neutral_chunk) > 0 then
    v_neutral_chunk := replace(v_neutral_chunk, v_old_bank_guard, v_new_bank_guard);
  elsif position(v_new_bank_guard in v_neutral_chunk) = 0 then
    raise exception 'Validasi akun neutral tidak dikenali; migrasi dibatalkan.';
  end if;
  v_definition := substring(v_definition from 1 for v_neutral_start - 1)
    || v_neutral_chunk
    || substring(v_definition from v_ops_start);

  -- Recalculate boundaries after replacing the neutral chunk.
  v_ops_start := position('elsif v_flow = ''ops_disbursement'' then' in v_definition);
  v_real_start := position('elsif v_flow = ''real_ops'' then' in v_definition);
  v_ops_chunk := substring(v_definition from v_ops_start for v_real_start - v_ops_start);
  if position(v_old_ops_match in v_ops_chunk) > 0 then
    v_ops_chunk := replace(v_ops_chunk, v_old_ops_match, v_new_ops_match);
  elsif position(v_new_ops_match in v_ops_chunk) = 0 then
    raise exception 'Validasi rekening Akuntan/Aslap tidak dikenali; migrasi dibatalkan.';
  end if;
  v_definition := substring(v_definition from 1 for v_ops_start - 1)
    || v_ops_chunk
    || substring(v_definition from v_real_start);

  execute v_definition;
end
$migration$;

-- Also protect direct inserts: neutral/LAIN_LAIN must point to a neutral-mapped
-- Koperasi Arutala BNI account. Akuntan/Aslap Lain-lain rows are separately
-- restricted by the import RPC above through Data Rekening target_role.
do $migration$
declare
  v_definition text;
  v_old_guard text := $old$if new.category = 'GAS' and lower(trim(kitchen_name)) in ('sukaraja', 'cihaur') then$old$;
  v_new_guard text := $new$if new.category = 'LAIN_LAIN' and not exists (
      select 1
      from public.kitchen_account_rules kar
      join public.accounts a on a.id = kar.account_id
      where kar.kitchen_id = new.kitchen_id
        and kar.account_id = new.account_id
        and kar.flow_type = 'neutral'
        and upper(regexp_replace(btrim(a.bank), '\s+', ' ', 'g')) = 'BNI'
        and lower(regexp_replace(btrim(a.name), '\s+', ' ', 'g')) = 'koperasi arutala'
    ) then
      raise exception 'Lain-lain hanya boleh masuk ke rekening Koperasi Arutala BNI, Akuntan, atau Aslap';
    end if;

    if new.category = 'GAS' and lower(trim(kitchen_name)) in ('sukaraja', 'cihaur') then$new$;
begin
  select pg_get_functiondef('public.validate_transaction_flow()'::regprocedure)
    into v_definition;

  if v_definition is null then
    raise exception 'Function public.validate_transaction_flow tidak ditemukan.';
  end if;

  if position(v_old_guard in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_guard, v_new_guard);
  elsif position(v_new_guard in v_definition) = 0 then
    raise exception 'Guard kategori GAS/LAIN_LAIN tidak dikenali; migrasi dibatalkan.';
  end if;

  execute v_definition;
end
$migration$;
