-- Allow an Admin to route an OPS HARIAN Virtual Account to generic OPS disbursement,
-- or keep it in the Maker audit trail only. No Akuntan/Aslap identity mapping is required.
DO $migration$
DECLARE
  v_definition text;
  v_old_identity text := $old_identity$
    if v_kind = 'ops_harian'
      and v_requested_disposition = 'excluded'
      and v_raw_line ~* '(^|[·[:space:]])VA($|[·[:space:]])' then
      -- An excluded VA line has no named recipient. Preserve and validate its bank and VA number.
      v_source_match := regexp_match(
        v_raw_line,
        '^[^:]+:[[:space:]]*([A-Za-z][A-Za-z0-9 ]*)[[:space:]]*/[[:space:]]*([0-9]+)[[:space:]]*·'
      );
      if v_source_match is null then
        raise exception 'Bank/nomor Virtual Account pada baris % tidak terbaca.', v_line_number;
      end if;
      v_source_recipient := '';
      v_source_bank := upper(btrim(v_source_match[1]));
      v_source_account_number := replace(btrim(v_source_match[2]), ' ', '');
      if upper(btrim(v_bank)) <> v_source_bank
        or replace(btrim(v_account_number), ' ', '') <> v_source_account_number
        or btrim(v_recipient) <> '' then
        raise exception 'Bank/nomor Virtual Account preview baris % berbeda dari teks sumber.', v_line_number;
      end if;
    elsif v_kind = 'real_ops' or (v_kind = 'lain_lain' and v_requested_disposition = 'excluded') then
$old_identity$;
  v_new_identity text := $new_identity$
    if v_kind = 'ops_harian'
      and v_raw_line ~* '(^|[·[:space:]])VA($|[·[:space:]])' then
      -- VA can carry an optional account-holder prefix, but that name is not its program destination.
      -- Only bank and VA number are verified; the original full source line remains in the audit batch.
      v_source_match := regexp_match(
        v_raw_line,
        '^[^:]+:[[:space:]]*(?:.*[[:space:]]-[[:space:]])?([A-Za-z][A-Za-z0-9 ]*)[[:space:]]*/[[:space:]]*([0-9]+)[[:space:]]*·'
      );
      if v_source_match is null then
        raise exception 'Bank/nomor Virtual Account pada baris % tidak terbaca.', v_line_number;
      end if;
      v_source_recipient := '';
      v_source_bank := upper(btrim(v_source_match[1]));
      v_source_account_number := replace(btrim(v_source_match[2]), ' ', '');
      v_recipient := '';
      if upper(btrim(v_bank)) <> v_source_bank
        or replace(btrim(v_account_number), ' ', '') <> v_source_account_number then
        raise exception 'Bank/nomor Virtual Account preview baris % berbeda dari teks sumber.', v_line_number;
      end if;
    elsif v_kind = 'real_ops' or (v_kind = 'lain_lain' and v_requested_disposition = 'excluded') then
$new_identity$;
  v_old_rule_case text := $old_rule_case$
    v_rule_type := case
      when v_kind = 'ops_harian' and v_flow = 'ops_disbursement'
        then 'ops_harian'
$old_rule_case$;
  v_new_rule_case text := $new_rule_case$
    v_rule_type := case
      -- An OPS HARIAN VA is an explicit generic OPS destination, not a mapped person/account.
      when v_kind = 'ops_harian'
        and v_raw_line ~* '(^|[·[:space:]])VA($|[·[:space:]])' then null
      when v_kind = 'ops_harian' and v_flow = 'ops_disbursement'
        then 'ops_harian'
$new_rule_case$;
  v_old_completeness text := $old_completeness$
    if v_disposition <> 'excluded' and v_kind <> 'real_ops' and
      (v_recipient = '' or v_bank = '' or v_account_number = '') then
$old_completeness$;
  v_new_completeness text := $new_completeness$
    if v_disposition <> 'excluded' and v_kind <> 'real_ops'
      and not (
        v_kind = 'ops_harian'
        and v_raw_line ~* '(^|[·[:space:]])VA($|[·[:space:]])'
      )
      and (v_recipient = '' or v_bank = '' or v_account_number = '') then
$new_completeness$;
  v_old_duplicate text := $old_duplicate$
          or (v_flow = 'ops_disbursement' and t.account_id is null and t.destination_label in ('Akuntan ' || v_kitchen.name, 'Aslap ' || v_kitchen.name, 'PIC Yayasan ' || v_kitchen.name, 'Pihak Luar ' || v_kitchen.name, 'OPS ' || v_kitchen.name))
$old_duplicate$;
  v_new_duplicate text := $new_duplicate$
          or (
            v_flow = 'ops_disbursement'
            and t.account_id is null
            and t.destination_label in ('Akuntan ' || v_kitchen.name, 'Aslap ' || v_kitchen.name, 'PIC Yayasan ' || v_kitchen.name, 'Pihak Luar ' || v_kitchen.name, 'OPS ' || v_kitchen.name)
            and (
              v_kind <> 'ops_harian'
              or v_raw_line !~* '(^|[·[:space:]])VA($|[·[:space:]])'
              or (
                t.destination_label = 'OPS ' || v_kitchen.name
                and t.note is not distinct from coalesce(v_details, 'Ops Harian')
              )
            )
          )
$new_duplicate$;
  v_old_destination text := $old_destination$
      null, case when v_flow = 'ops_disbursement' then
        case v_destination_role
$old_destination$;
  v_new_destination text := $new_destination$
      null, case when v_flow = 'ops_disbursement' then
        case
          when v_kind = 'ops_harian'
            and v_raw_line ~* '(^|[·[:space:]])VA($|[·[:space:]])'
            then 'OPS ' || v_kitchen.name
          else case v_destination_role
$new_destination$;
BEGIN
  SELECT pg_get_functiondef(
    'public.import_maker_transactions(text, uuid, date, text, jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Function public.import_maker_transactions tidak ditemukan.';
  END IF;

  IF position(v_old_identity IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Blok validasi identitas VA lama tidak ditemukan; migrasi dibatalkan.';
  END IF;
  v_definition := replace(v_definition, v_old_identity, v_new_identity);

  IF position(v_old_rule_case IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Blok resolusi mapping Maker tidak ditemukan; migrasi dibatalkan.';
  END IF;
  v_definition := replace(v_definition, v_old_rule_case, v_new_rule_case);

  IF position(v_old_completeness IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Blok kelengkapan identitas Maker tidak ditemukan; migrasi dibatalkan.';
  END IF;
  v_definition := replace(v_definition, v_old_completeness, v_new_completeness);

  IF position(v_old_duplicate IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Blok pemeriksaan duplikat OPS Maker tidak ditemukan; migrasi dibatalkan.';
  END IF;
  v_definition := replace(v_definition, v_old_duplicate, v_new_duplicate);

  IF position(v_old_destination IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Blok tujuan transaksi Maker tidak ditemukan; migrasi dibatalkan.';
  END IF;
  v_definition := replace(v_definition, v_old_destination, v_new_destination);

  -- The VA branch above opens an outer CASE for its generic destination.
  -- Close that CASE before preserving the existing destination-role mapping.
  v_definition := replace(
    v_definition,
    $destination_tail$
          else case
            when v_rule_type = 'gaji_ahli_gizi' then 'Pengawas Gizi ' || v_kitchen.name
            else 'Akuntan ' || v_kitchen.name
          end
        end
      else null end,
$destination_tail$,
    $destination_tail_new$
          else case
            when v_rule_type = 'gaji_ahli_gizi' then 'Pengawas Gizi ' || v_kitchen.name
            else 'Akuntan ' || v_kitchen.name
          end
        end
        end
      else null end,
$destination_tail_new$
  );

  EXECUTE v_definition;
END
$migration$;
