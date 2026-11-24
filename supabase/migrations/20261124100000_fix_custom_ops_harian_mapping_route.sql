-- OPS HARIAN custom notes are operational details, not a separate payroll classification.
-- Keep OPS HARIAN on the active ops_harian mapping and OPS / Pencairan route.
do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.import_maker_transactions(text,uuid,date,text,jsonb)'::regprocedure
  ) into v_definition;

  v_old := $old$      if lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) <> 'ops harian'
        and not v_ops_harian_arutala
        and not v_verified
        and v_requested_disposition <> 'excluded' then
        raise exception 'Catatan OPS HARIAN custom yang belum divalidasi hanya boleh disimpan untuk audit.';
      end if;
$old$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Custom OPS HARIAN validation gate was not found; migration aborted.';
  end if;
  v_definition := replace(v_definition, v_old, '');

  v_old := $old$    if v_kind = 'ops_harian'
      and lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) <> 'ops harian'
      and not v_verified
      and v_requested_disposition = 'excluded' then
      v_disposition := 'excluded';
      v_exclusion_reason := coalesce(v_exclusion_reason,
        'Deskripsi OPS HARIAN berbeda dari Ops Harian dan belum divalidasi. Audit saja.');
    end if;
$old$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Custom OPS HARIAN audit-only disposition gate was not found; migration aborted.';
  end if;
  v_definition := replace(v_definition, v_old, '');

  v_old := $old$      when v_kind = 'ops_harian' and v_flow = 'ops_disbursement'
        and lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) = 'ops harian'
        then 'ops_harian'
      when v_kind = 'ops_harian' and v_flow = 'ops_disbursement'
        and v_verified
        and position('gaji pengawas keuangan' in lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g'))) > 0
        then 'gaji_akuntan'
      when v_kind = 'ops_harian' and v_flow = 'ops_disbursement'
        and v_verified
        and position('gaji pengawas gizi' in lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g'))) > 0
        then 'gaji_ahli_gizi'
      when v_kind = 'ops_harian' and v_flow = 'ops_disbursement' and v_verified
        then 'ops_harian'$old$;
  v_new := $new$      when v_kind = 'ops_harian' and v_flow = 'ops_disbursement'
        then 'ops_harian'$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'OPS HARIAN rule-type resolution block was not found; migration aborted.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$    if v_kind = 'ops_harian'
      and lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) not in ('ops harian', 'gas')
      and not v_ops_harian_arutala
      and not v_verified then
      raise exception 'Catatan custom pada OPS Harian baris % wajib diverifikasi manual.', v_line_number;
    end if;
$old$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Final custom OPS HARIAN verification guard was not found; migration aborted.';
  end if;
  v_definition := replace(v_definition, v_old, '');

  v_old := $old$      or (
        lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) <> 'ops harian'
        and v_flow <> 'neutral'
      )$old$;
  v_new := $new$      or (
        lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) <> 'ops harian'
        and v_flow <> 'ops_disbursement'
        and not (v_flow = 'neutral' and v_ops_harian_arutala)
      )$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'OPS HARIAN flow consistency rule was not found; migration aborted.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end
$migration$;
