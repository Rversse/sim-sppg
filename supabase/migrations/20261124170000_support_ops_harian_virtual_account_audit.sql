-- Keep OPS HARIAN Virtual Account transfers in the Maker batch audit only.
-- VA payments have a bank/account number and source note, but no named recipient.
DO $migration$
DECLARE
  v_definition text;
  v_old_identity text := $old_identity$
    if v_kind = 'real_ops' or (v_kind = 'lain_lain' and v_requested_disposition = 'excluded') then
      -- OPS Real and explicitly Blocked Lain-lain rows do not need a bank/account identity in the source line.
      v_source_recipient := '';
      v_source_bank := '';
      v_source_account_number := '';
    else
      v_source_match := regexp_match(v_raw_line, ' - ([A-Za-z][A-Za-z0-9 ]*) / ([xX]{3,}[[:space:]]+[0-9]{4}|[^[:space:]·]+)');
      if v_source_match is null then
        raise exception 'Nama/bank/nomor rekening sumber pada baris % tidak terbaca.', v_line_number;
      end if;
      v_source_bank := upper(regexp_replace(btrim(v_source_match[1]), '\\s+', ' ', 'g'));
      v_source_account_number := regexp_replace(btrim(v_source_match[2]), '\\s+', '', 'g');
      v_source_body := btrim(substring(v_raw_line from position(':' in v_raw_line) + 1));
      v_source_prefix := btrim(regexp_replace(v_source_body, ' - [A-Za-z][A-Za-z0-9 ]* / ([xX]{3,}[[:space:]]+[0-9]{4}|[^[:space:]·]+).*$', ''));
      if v_kind = 'lain_lain' then
        v_source_recipient := btrim(regexp_replace(v_source_prefix, '^.* - ', ''));
      elsif v_kind = 'gas' then
        v_source_recipient := btrim(split_part(v_source_prefix, ' / ', 1));
      else
        v_source_recipient := v_source_prefix;
      end if;
      if v_source_recipient = '' then raise exception 'Nama penerima pada sumber baris % kosong.', v_line_number; end if;
    end if;
$old_identity$;
  v_new_identity text := $new_identity$
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
      v_source_bank := upper(regexp_replace(btrim(v_source_match[1]), '\\s+', ' ', 'g'));
      v_source_account_number := regexp_replace(btrim(v_source_match[2]), '\\s+', '', 'g');
      if upper(regexp_replace(btrim(v_bank), '\\s+', ' ', 'g')) <> v_source_bank
        or regexp_replace(btrim(v_account_number), '\\s+', '', 'g') <> v_source_account_number
        or btrim(v_recipient) <> '' then
        raise exception 'Bank/nomor Virtual Account preview baris % berbeda dari teks sumber.', v_line_number;
      end if;
    elsif v_kind = 'real_ops' or (v_kind = 'lain_lain' and v_requested_disposition = 'excluded') then
      -- OPS Real and explicitly Blocked Lain-lain rows do not need a bank/account identity in the source line.
      v_source_recipient := '';
      v_source_bank := '';
      v_source_account_number := '';
    else
      v_source_match := regexp_match(v_raw_line, ' - ([A-Za-z][A-Za-z0-9 ]*) / ([xX]{3,}[[:space:]]+[0-9]{4}|[^[:space:]·]+)');
      if v_source_match is null then
        raise exception 'Nama/bank/nomor rekening sumber pada baris % tidak terbaca.', v_line_number;
      end if;
      v_source_bank := upper(regexp_replace(btrim(v_source_match[1]), '\\s+', ' ', 'g'));
      v_source_account_number := regexp_replace(btrim(v_source_match[2]), '\\s+', '', 'g');
      v_source_body := btrim(substring(v_raw_line from position(':' in v_raw_line) + 1));
      v_source_prefix := btrim(regexp_replace(v_source_body, ' - [A-Za-z][A-Za-z0-9 ]* / ([xX]{3,}[[:space:]]+[0-9]{4}|[^[:space:]·]+).*$', ''));
      if v_kind = 'lain_lain' then
        v_source_recipient := btrim(regexp_replace(v_source_prefix, '^.* - ', ''));
      elsif v_kind = 'gas' then
        v_source_recipient := btrim(split_part(v_source_prefix, ' / ', 1));
      else
        v_source_recipient := v_source_prefix;
      end if;
      if v_source_recipient = '' then raise exception 'Nama penerima pada sumber baris % kosong.', v_line_number; end if;
    end if;
$new_identity$;
  v_old_exclusion text := $old_exclusion$
    -- Explicit Admin Block for Lain-lain is allowed even without a matching program mapping.
    -- The immutable source line remains in the audit batch; no SIM-SPPG transaction is created.
    if v_kind = 'lain_lain' and v_requested_disposition = 'excluded' then
      v_disposition := 'excluded';
      v_exclusion_reason := 'Diblokir manual oleh Admin. Baris hanya disimpan untuk audit dan tidak dibuat sebagai transaksi program.';
    end if;
$old_exclusion$;
  v_new_exclusion text := $new_exclusion$
    -- A Virtual Account OPS HARIAN is retained as audit only, without a transaction record.
    if v_kind = 'ops_harian'
      and v_requested_disposition = 'excluded'
      and v_raw_line ~* '(^|[·[:space:]])VA($|[·[:space:]])' then
      v_disposition := 'excluded';
      v_exclusion_reason := 'Pembayaran Virtual Account (VA) dikecualikan dari transaksi program dan disimpan hanya untuk audit sumber.';
    elsif v_kind = 'lain_lain' and v_requested_disposition = 'excluded' then
      -- Explicit Admin Block for Lain-lain is allowed even without a matching program mapping.
      -- The immutable source line remains in the audit batch; no SIM-SPPG transaction is created.
      v_disposition := 'excluded';
      v_exclusion_reason := 'Diblokir manual oleh Admin. Baris hanya disimpan untuk audit dan tidak dibuat sebagai transaksi program.';
    end if;
$new_exclusion$;
BEGIN
  SELECT pg_get_functiondef(
    'public.import_maker_transactions(text, uuid, date, text, jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Function public.import_maker_transactions tidak ditemukan.';
  END IF;

  IF position(v_old_identity IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old_identity, v_new_identity);
  ELSIF position(v_new_identity IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Blok validasi identitas Maker tidak dikenali; migrasi dibatalkan.';
  END IF;

  IF position(v_old_exclusion IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old_exclusion, v_new_exclusion);
  ELSIF position(v_new_exclusion IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Blok pengecualian Maker tidak dikenali; migrasi dibatalkan.';
  END IF;

  EXECUTE v_definition;
END
$migration$;
