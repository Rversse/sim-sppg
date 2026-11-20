do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.import_maker_transactions(text,uuid,date,text,jsonb)'::regprocedure
  ) into v_definition;

  v_updated := replace(v_definition, $old$      if lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) = 'ops harian' then
        if v_flow <> 'ops_disbursement' then
          raise exception 'Catatan "Ops Harian" harus memakai flow pencairan OPS.';
        end if;
      else
        if v_flow = 'neutral' then
          select exists (
            select 1
            from public.accounts a
            join public.kitchen_account_rules kar
              on kar.account_id = a.id
             and kar.kitchen_id = p_kitchen_id
             and kar.flow_type = 'neutral'
            where a.id = v_account_id
              and upper(regexp_replace(btrim(a.bank), '\s+', ' ', 'g')) = 'BNI'
              and lower(regexp_replace(btrim(a.name), '\s+', ' ', 'g')) = 'koperasi arutala'
              and regexp_replace(btrim(coalesce(a.account_number, '')), '\s+', '', 'g') = '1985322260'
              and upper(regexp_replace(btrim(v_bank), '\s+', ' ', 'g')) = 'BNI'
              and regexp_replace(btrim(v_account_number), '\s+', '', 'g') = '1985322260'
              and lower(regexp_replace(btrim(v_recipient), '\s+', ' ', 'g')) = 'koperasi arutala'
          ) into v_ops_harian_arutala;
          if not v_ops_harian_arutala then
            raise exception 'OPS HARIAN hanya boleh memakai flow netral untuk rekening Koperasi Arutala BNI 1985322260 yang terpetakan pada dapur ini.';
          end if;
        elsif v_flow <> 'ops_disbursement' then
          raise exception 'Catatan OPS HARIAN custom harus memakai flow OPS / Pencairan atau rekening Koperasi Arutala yang valid.';
        end if;
        if not v_ops_harian_arutala and not v_verified and v_requested_disposition <> 'excluded' then
          raise exception 'Catatan OPS HARIAN custom yang belum divalidasi hanya boleh disimpan untuk audit.';
        end if;
      end if;$old$, $new$      if v_flow = 'neutral' then
        select exists (
          select 1
          from public.accounts a
          join public.kitchen_account_rules kar
            on kar.account_id = a.id
           and kar.kitchen_id = p_kitchen_id
           and kar.flow_type = 'neutral'
          where a.id = v_account_id
            and upper(regexp_replace(btrim(a.bank), '\s+', ' ', 'g')) = 'BNI'
            and lower(regexp_replace(btrim(a.name), '\s+', ' ', 'g')) = 'koperasi arutala'
            and regexp_replace(btrim(coalesce(a.account_number, '')), '\s+', '', 'g') = '1985322260'
            and upper(regexp_replace(btrim(v_bank), '\s+', ' ', 'g')) = 'BNI'
            and regexp_replace(btrim(v_account_number), '\s+', '', 'g') = '1985322260'
            and lower(regexp_replace(btrim(v_recipient), '\s+', ' ', 'g')) = 'koperasi arutala'
        ) into v_ops_harian_arutala;
        if not v_ops_harian_arutala then
          raise exception 'OPS HARIAN hanya boleh memakai flow netral untuk rekening Koperasi Arutala BNI 1985322260 yang terpetakan pada dapur ini.';
        end if;
      elsif v_flow <> 'ops_disbursement' then
        if lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) = 'ops harian' then
          raise exception 'Catatan "Ops Harian" harus memakai flow OPS / Pencairan atau rekening Netral Arutala yang valid.';
        end if;
        raise exception 'Catatan OPS HARIAN custom harus memakai flow OPS / Pencairan atau rekening Koperasi Arutala yang valid.';
      end if;
      if lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) <> 'ops harian'
        and not v_ops_harian_arutala
        and not v_verified
        and v_requested_disposition <> 'excluded' then
        raise exception 'Catatan OPS HARIAN custom yang belum divalidasi hanya boleh disimpan untuk audit.';
      end if;$new$);
  if v_updated = v_definition then
    raise exception 'Expected OPS HARIAN routing block was not found exactly.';
  end if;
  v_definition := v_updated;

  v_updated := replace(v_definition, $old$        lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) = 'ops harian'
        and v_flow <> 'ops_disbursement'$old$, $new$        lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) = 'ops harian'
        and v_flow <> 'ops_disbursement'
        and not (v_flow = 'neutral' and v_ops_harian_arutala)$new$);
  if v_updated = v_definition then
    raise exception 'Expected Ops Harian classification guard was not found exactly.';
  end if;
  v_definition := v_updated;

  v_updated := replace(v_definition, $old$          and lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) <> 'ops harian'$old$, $new$          and (
            lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) <> 'ops harian'
            or v_ops_harian_arutala
          )$new$);
  if v_updated = v_definition then
    raise exception 'Expected neutral OPS HARIAN account guard was not found exactly.';
  end if;
  v_definition := v_updated;

  v_updated := replace(v_definition, $old$      when v_flow = 'neutral' then coalesce(v_details, 'Gas')$old$, $new$      when v_flow = 'neutral' and v_category = 'OPS' then v_details
      when v_flow = 'neutral' then coalesce(v_details, 'Gas')$new$);
  if v_updated = v_definition then
    raise exception 'Expected neutral note fallback was not found exactly.';
  end if;
  v_definition := v_updated;

  execute v_definition;
end
$migration$;
