-- Ensure the operational mapping selected for Lain-lain/OPS is itself Akuntan or Aslap.
-- This also protects destination_role selection when the mapping table contains duplicate
-- identity rows with different target roles.

do $migration$
declare
  v_definition text;
  v_rule_start integer;
  v_guard_end integer;
  v_rule_chunk text;
  v_old_guard text := $old$and r.is_active$old$;
  v_new_guard text := $new$and r.is_active
          and (v_kind <> 'lain_lain' or v_flow <> 'ops_disbursement' or lower(coalesce(r.target_role, '')) in ('akuntan', 'aslap'))$new$;
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

  v_rule_start := position('v_rule_type := case' in v_definition);
  v_guard_end := position('if v_disposition <> ''excluded'' and v_kind <> ''real_ops'' and' in v_definition);
  if v_rule_start = 0 or v_guard_end = 0 or v_rule_start >= v_guard_end then
    raise exception 'Blok resolusi mapping rekening Maker tidak dikenali; migrasi dibatalkan.';
  end if;

  v_rule_chunk := substring(v_definition from v_rule_start for v_guard_end - v_rule_start);
  if position(v_old_guard in v_rule_chunk) > 0 then
    v_rule_chunk := replace(v_rule_chunk, v_old_guard, v_new_guard);
  elsif position(v_new_guard in v_rule_chunk) = 0 then
    raise exception 'Guard role Akuntan/Aslap pada resolusi mapping tidak dikenali; migrasi dibatalkan.';
  end if;

  v_definition := substring(v_definition from 1 for v_rule_start - 1)
    || v_rule_chunk
    || substring(v_definition from v_guard_end);
  execute v_definition;
end
$migration$;
