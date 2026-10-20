-- A manually Blocked Maker Lain-lain row is audit-only and must not need
-- recipient/bank/account parsing to succeed. This is generic across kitchens.
-- Keep strict identity parsing for rows that are allowed into the program.
do $migration$
declare
  v_definition text;
  v_old text := $old$if v_kind = 'real_ops' then
      -- OPS Real has no payee, bank or account identity by design.
      v_source_recipient := '';
      v_source_bank := '';
      v_source_account_number := '';
    else
      v_source_match := regexp_match(v_raw_line,$old$;
  v_new text := $new$if v_kind = 'real_ops'
      or (v_kind = 'lain_lain' and v_requested_disposition = 'excluded') then
      -- OPS Real and explicitly Blocked Lain-lain rows are audit-only and do not
      -- need a bank/account identity in the source line.
      v_source_recipient := '';
      v_source_bank := '';
      v_source_account_number := '';
    else
      v_source_match := regexp_match(v_raw_line,$new$;
begin
  select pg_get_functiondef('public.import_maker_transactions(text, uuid, date, text, jsonb)'::regprocedure)
    into v_definition;

  if v_definition is null then
    raise exception 'Function public.import_maker_transactions tidak ditemukan.';
  end if;

  if position(v_old in v_definition) > 0 then
    v_definition := replace(v_definition, v_old, v_new);
  elsif position(v_new in v_definition) = 0 then
    raise exception 'Blok parsing identitas sumber Maker tidak dikenali; migrasi dibatalkan.';
  end if;

  execute v_definition;
end
$migration$;
