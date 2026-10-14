-- Shared Data Rekening policy for Maker-Pencairan and SIM-SPPG.
-- Existing account routes stay available to Maker-Pencairan; mapping_status governs
-- whether a matching row may become a SIM-SPPG transaction.

alter table public.kitchen_operational_account_rules
  add column if not exists mapping_status text not null default 'active',
  add column if not exists target_role text;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.kitchen_operational_account_rules'::regclass
      and conname = 'kitchen_operational_account_rules_mapping_status_check'
  ) then
    alter table public.kitchen_operational_account_rules
      add constraint kitchen_operational_account_rules_mapping_status_check
      check (mapping_status in ('active', 'excluded'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.kitchen_operational_account_rules'::regclass
      and conname = 'kitchen_operational_account_rules_target_role_check'
  ) then
    alter table public.kitchen_operational_account_rules
      add constraint kitchen_operational_account_rules_target_role_check
      check (
        target_role is null
        or target_role in ('aslap', 'akuntan', 'pic_yayasan', 'berkah_mandiri_putra', 'supplier', 'other')
      );
  end if;
end
$migration$;

create index if not exists kitchen_operational_account_rules_policy_lookup_idx
  on public.kitchen_operational_account_rules (kitchen_id, rule_type, mapping_status, is_active);

-- Seed the six explicitly classified OPS / Pencairan routes.
-- Sukaraja is deliberately left unclassified until its destination is confirmed.
update public.kitchen_operational_account_rules r
set target_role = case
  when lower(k.name) in ('cihaur', 'cipetir') then 'aslap'
  when lower(k.name) in ('campakamulya', 'cikondang', 'kertajadi', 'cisepat') then 'akuntan'
  else r.target_role
end
from public.kitchens k
where k.id = r.kitchen_id
  and r.rule_type = 'ops_harian'
  and lower(k.name) in ('cihaur', 'cipetir', 'campakamulya', 'cikondang', 'kertajadi', 'cisepat');

-- Sewa Kendaraan uses one fixed destination for every kitchen. Normalize the
-- current rows, keep one row per kitchen, and provision it for newly added kitchens.
delete from public.kitchen_operational_account_rules r
where r.rule_type = 'vehicle_rent'
  and exists (
    select 1
    from public.kitchen_operational_account_rules other
    where other.kitchen_id = r.kitchen_id
      and other.rule_type = 'vehicle_rent'
      and other.id < r.id
  );

update public.kitchen_operational_account_rules
set owner_name = 'Berkah Mandiri Putra',
    bank = 'MANDIRI',
    account_number = '1820015963523',
    is_active = true,
    mapping_status = 'active',
    target_role = 'berkah_mandiri_putra'
where rule_type = 'vehicle_rent';

insert into public.kitchen_operational_account_rules
  (kitchen_id, rule_type, owner_name, bank, account_number, is_active, mapping_status, target_role)
select k.id, 'vehicle_rent', 'Berkah Mandiri Putra', 'MANDIRI', '1820015963523',
       true, 'active', 'berkah_mandiri_putra'
from public.kitchens k
where not exists (
  select 1
  from public.kitchen_operational_account_rules r
  where r.kitchen_id = k.id and r.rule_type = 'vehicle_rent'
);

create or replace function public.ensure_shared_vehicle_rent_mapping()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.kitchen_operational_account_rules
    (kitchen_id, rule_type, owner_name, bank, account_number, is_active, mapping_status, target_role)
  values
    (new.id, 'vehicle_rent', 'Berkah Mandiri Putra', 'MANDIRI', '1820015963523',
     true, 'active', 'berkah_mandiri_putra')
  on conflict (kitchen_id, rule_type, bank, account_number)
  do update set
    owner_name = excluded.owner_name,
    is_active = true,
    mapping_status = 'active',
    target_role = 'berkah_mandiri_putra',
    updated_at = now();

  return new;
end;
$function$;

drop trigger if exists kitchens_ensure_shared_vehicle_rent_mapping on public.kitchens;
create trigger kitchens_ensure_shared_vehicle_rent_mapping
after insert on public.kitchens
for each row execute function public.ensure_shared_vehicle_rent_mapping();

-- Preserve the currently enforced payout exclusions as editable data policies.
update public.kitchen_operational_account_rules r
set mapping_status = 'excluded'
from public.kitchens k
where k.id = r.kitchen_id
  and lower(k.name) in ('campakamulya', 'cikondang', 'kertajadi')
  and r.rule_type in ('gaji_relawan', 'pic_incentive_school', 'pic_incentive_posyandu');

update public.kitchen_operational_account_rules r
set mapping_status = 'excluded'
from public.kitchens k
where k.id = r.kitchen_id
  and lower(k.name) = 'sukaraja'
  and r.rule_type in ('pic_incentive_school', 'pic_incentive_posyandu');

CREATE OR REPLACE FUNCTION public.import_maker_transactions(p_content_hash text, p_kitchen_id uuid, p_transaction_date date, p_source_text text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_kitchen public.kitchens%rowtype;
  v_batch_id uuid;
  v_row jsonb;
  v_line_number integer;
  v_kind text;
  v_flow text;
  v_category text;
  v_operational_type text;
  v_account_id uuid;
  v_amount bigint;
  v_amount_numeric numeric;
  v_recipient text;
  v_bank text;
  v_account_number text;
  v_details text;
  v_raw_line text;
  v_source_category text;
  v_disposition text;
  v_exclusion_reason text;
  v_verified boolean;
  v_note text;
  v_imported_count integer := 0;
  v_excluded_count integer := 0;
  v_imported_total bigint := 0;
  v_excluded_total bigint := 0;
  v_transaction_id uuid;
  v_rule_type text;
  v_mapping_status text;
  v_destination_role text;
  v_source_lines text[];
  v_expected_row_count integer;
  v_requested_disposition text;
  v_source_label text;
  v_expected_kind text;
  v_source_amount_text text;
  v_source_amount_numeric numeric;
  v_source_body text;
  v_source_prefix text;
  v_source_match text[];
  v_source_recipient text;
  v_source_bank text;
  v_source_account_number text;
  v_payload_amount_text text;
  v_header_match text[];
  v_header_month integer;
  v_header_date date;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Hanya Admin yang dapat menjalankan impor Maker.';
  end if;

  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash dokumen tidak valid.';
  end if;
  if p_source_text is null or length(p_source_text) = 0 or length(p_source_text) > 250000 then
    raise exception 'Teks sumber kosong atau terlalu panjang.';
  end if;
  if encode(extensions.digest(convert_to(replace(replace(btrim(p_source_text), chr(13) || chr(10), chr(10)), chr(13), chr(10)), 'UTF8'), 'sha256'), 'hex') <> p_content_hash then
    raise exception 'Hash sumber tidak cocok. Buat ulang preview sebelum menyimpan.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Daftar baris impor harus berupa array.';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 500 then
    raise exception 'Batch harus berisi 1 sampai 500 baris.';
  end if;
  v_source_lines := string_to_array(
    replace(replace(btrim(p_source_text), chr(13) || chr(10), chr(10)), chr(13), chr(10)),
    chr(10)
  );
  v_header_match := regexp_match(
    btrim(v_source_lines[1]),
    '^(.+),[[:space:]]*([0-9]{1,2})-([A-Za-z]{3})-([0-9]{4})$'
  );
  if v_header_match is null then
    raise exception 'Header Maker harus berformat NamaDapur, DD-Mon-YYYY.';
  end if;
  v_header_month := case lower(v_header_match[3])
    when 'jan' then 1 when 'feb' then 2 when 'mar' then 3 when 'apr' then 4
    when 'may' then 5 when 'jun' then 6 when 'jul' then 7 when 'aug' then 8
    when 'sep' then 9 when 'oct' then 10 when 'nov' then 11 when 'dec' then 12
    else null
  end;
  if v_header_month is null then
    raise exception 'Bulan pada header Maker tidak valid.';
  end if;
  begin
    v_header_date := make_date(v_header_match[4]::integer, v_header_month, v_header_match[2]::integer);
  exception when others then
    raise exception 'Tanggal pada header Maker tidak valid.';
  end;
  if v_header_date <> p_transaction_date then
    raise exception 'Tanggal pada header Maker berbeda dari tanggal transaksi preview.';
  end if;

  select count(*)::integer into v_expected_row_count
  from unnest(v_source_lines) with ordinality as src(line, ordinal)
  where src.ordinal > 1 and length(btrim(src.line)) > 0;
  if v_expected_row_count <> jsonb_array_length(p_rows) then
    raise exception 'Jumlah baris draft tidak sama dengan jumlah baris pada teks sumber. Buat ulang preview.';
  end if;
  if p_transaction_date is null then
    raise exception 'Tanggal transaksi wajib diisi.';
  end if;

  select * into v_kitchen
  from public.kitchens k
  where k.id = p_kitchen_id and k.is_active = true;
  if not found then
    raise exception 'Dapur tidak ditemukan atau tidak aktif.';
  end if;

  if lower(regexp_replace(btrim(v_header_match[1]), '\s+', ' ', 'g')) <>
     lower(regexp_replace(btrim(v_kitchen.name), '\s+', ' ', 'g')) then
    raise exception 'Nama dapur pada header Maker harus sama persis dengan dapur yang dipilih.';
  end if;

  -- Serialize Maker imports for the same kitchen/date to reduce race-condition duplicates.
  perform pg_advisory_xact_lock(
    hashtextextended(p_kitchen_id::text || '|' || p_transaction_date::text, 0)
  );

  insert into public.maker_import_batches
    (content_hash, kitchen_id, transaction_date, source_text, created_by)
  values
    (p_content_hash, p_kitchen_id, p_transaction_date,
     replace(replace(btrim(p_source_text), chr(13) || chr(10), chr(10)), chr(13), chr(10)), v_user_id)
  on conflict (content_hash) do nothing
  returning id into v_batch_id;

  if v_batch_id is null then
    return jsonb_build_object(
      'duplicate', true, 'inserted_count', 0, 'excluded_count', 0,
      'total_amount', 0, 'excluded_total_amount', 0, 'batch_id', null
    );
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) as t(value)
  loop
    v_line_number := nullif(v_row->>'line_number','')::integer;
    v_kind := coalesce(v_row->>'maker_kind','');
    v_flow := nullif(v_row->>'flow_type','');
    v_category := nullif(v_row->>'category','');
    v_operational_type := nullif(v_row->>'operational_type','');
    v_account_id := nullif(v_row->>'account_id','')::uuid;
    v_recipient := btrim(coalesce(v_row->>'maker_recipient_name',''));
    v_bank := upper(regexp_replace(btrim(coalesce(v_row->>'maker_bank','')), '\s+', ' ', 'g'));
    v_account_number := regexp_replace(btrim(coalesce(v_row->>'maker_account_number','')), '\s+', '', 'g');
    v_details := nullif(btrim(coalesce(v_row->>'maker_details','')), '');
    v_raw_line := coalesce(v_row->>'maker_source_line','');
    v_source_category := coalesce(nullif(v_row->>'maker_source_category',''), 'Lain-lain');
    v_requested_disposition := coalesce(v_row->>'disposition','import');
    v_disposition := 'import';
    v_exclusion_reason := nullif(btrim(coalesce(v_row->>'excluded_reason','')), '');
    v_verified := coalesce((v_row->>'maker_manual_verified')::boolean, false);
    v_amount := null;

    if v_line_number is null or v_line_number < 2 or length(v_raw_line) = 0 or
      v_line_number > cardinality(v_source_lines) or
      btrim(v_source_lines[v_line_number]) <> btrim(v_raw_line) then
      raise exception 'Nomor baris atau teks sumber tidak cocok pada baris %.', coalesce(v_line_number, 0);
    end if;
    if v_kind not in (
      'rab','gas','ops_harian','sppg_rent','relawan_salary','pic_school',
      'pic_posyandu','combined_payroll','vehicle_rent','lain_lain'
    ) then
      raise exception 'Jenis sumber tidak dikenal pada baris %.', v_line_number;
    end if;
    if v_disposition not in ('import','excluded') then
      raise exception 'Status baris tidak dikenal pada baris %.', v_line_number;
    end if;

    if v_requested_disposition not in ('import','excluded') then
      raise exception 'Status baris tidak dikenal pada baris %.', v_line_number;
    end if;
    if position(':' in v_raw_line) = 0 then
      raise exception 'Label kategori sumber pada baris % tidak dikenali.', v_line_number;
    end if;
    v_source_label := btrim(substring(v_raw_line from 1 for position(':' in v_raw_line) - 1));
    if v_source_label = 'RAB' then v_expected_kind := 'rab';
    elsif v_source_label = 'GAS' then v_expected_kind := 'gas';
    elsif v_source_label = 'Ops Harian' then v_expected_kind := 'ops_harian';
    elsif v_source_label = 'Sewa SPPG' then v_expected_kind := 'sppg_rent';
    elsif v_source_label = 'Gaji Relawan' then v_expected_kind := 'relawan_salary';
    elsif v_source_label = 'Insentif PIC Sekolah' then v_expected_kind := 'pic_school';
    elsif v_source_label = 'Insentif PIC Posyandu' then v_expected_kind := 'pic_posyandu';
    elsif v_source_label ~* '^Sewa Kendaraan (Mobil|Motor) \(.+\)$' then v_expected_kind := 'vehicle_rent';
    elsif lower(v_source_label) like '%gaji relawan%' and lower(v_source_label) like '%insentif pic%' then v_expected_kind := 'combined_payroll';
    elsif v_source_label = 'Lain-lain' then v_expected_kind := 'lain_lain';
    else raise exception 'Kategori sumber "%" pada baris % tidak didukung.', v_source_label, v_line_number;
    end if;
    if v_kind <> v_expected_kind then
      raise exception 'Klasifikasi baris % berbeda dari label sumber Maker. Buat ulang preview.', v_line_number;
    end if;
    v_source_category := v_source_label;

    -- The server canonicalizes Ops Harian even if an older browser sends the legacy REAL_OPS flow.
    if v_kind = 'ops_harian' then
      v_flow := 'ops_disbursement';
      v_category := 'OPS';
      v_operational_type := null;
    end if;

    v_source_amount_text := btrim(regexp_replace(v_raw_line, '^.*·[[:space:]]*', ''));
    if v_source_amount_text !~ '^[0-9]+(\.[0-9]{3})*$' then
      raise exception 'Nominal sumber baris % tidak valid. Perbaiki di Maker.', v_line_number;
    end if;
    v_source_amount_numeric := replace(v_source_amount_text, '.', '')::numeric;
    if v_source_amount_numeric <= 0 or v_source_amount_numeric > 9223372036854775807 then
      raise exception 'Nominal sumber baris % berada di luar rentang integer database.', v_line_number;
    end if;
    -- Keep the original Maker line/hash as immutable audit evidence, but allow an Admin
    -- to correct the draft amount before saving. The corrected value is still range-checked.
    v_payload_amount_text := coalesce(v_row->>'amount','');
    if v_payload_amount_text !~ '^[0-9]+$'
      or v_payload_amount_text::numeric <= 0
      or v_payload_amount_text::numeric > 9223372036854775807 then
      raise exception 'Nominal draft baris % tidak valid. Gunakan bilangan bulat IDR positif.', v_line_number;
    end if;
    v_amount := v_payload_amount_text::numeric::bigint;

    v_source_match := regexp_match(v_raw_line, ' - ([A-Za-z][A-Za-z0-9 ]*) / ([^[:space:]·]+)');
    if v_source_match is null then
      raise exception 'Nama/bank/nomor rekening sumber pada baris % tidak terbaca.', v_line_number;
    end if;
    v_source_bank := upper(regexp_replace(btrim(v_source_match[1]), '\s+', ' ', 'g'));
    v_source_account_number := regexp_replace(btrim(v_source_match[2]), '\s+', '', 'g');
    v_source_body := btrim(substring(v_raw_line from position(':' in v_raw_line) + 1));
    v_source_prefix := btrim(regexp_replace(v_source_body, ' - [A-Za-z][A-Za-z0-9 ]* / [^[:space:]·]+.*$', ''));
    if v_kind = 'lain_lain' then
      v_source_recipient := btrim(regexp_replace(v_source_prefix, '^.* - ', ''));
    else
      v_source_recipient := v_source_prefix;
    end if;
    if v_source_recipient = '' then raise exception 'Nama penerima pada sumber baris % kosong.', v_line_number; end if;


    if v_kind = 'combined_payroll' then
      v_disposition := 'excluded';
      v_exclusion_reason := 'Maker menggabungkan beberapa jenis gaji/insentif dalam satu nominal. Pecah per jenis sebelum memasukkan sebagai transaksi program.';
    end if;

    -- Resolve every operational target from Data Rekening. This is the single source of truth
    -- for import eligibility; mismatches block save rather than being silently excluded.
    v_rule_type := case
      when v_kind = 'ops_harian' then 'ops_harian'
      when v_kind = 'sppg_rent' then 'sppg_rent'
      when v_kind = 'relawan_salary' then 'gaji_relawan'
      when v_kind = 'pic_school' then 'pic_incentive_school'
      when v_kind = 'pic_posyandu' then 'pic_incentive_posyandu'
      when v_kind = 'vehicle_rent' then 'vehicle_rent'
      when v_kind = 'lain_lain' and v_flow = 'ops_disbursement' then 'ops_harian'
      when v_kind = 'lain_lain' and v_flow = 'operational_disbursement' then
        case
          when v_operational_type = 'sppg_rent' then 'sppg_rent'
          when v_operational_type = 'relawan_salary' then 'gaji_relawan'
          when v_operational_type = 'pic_incentive' and v_source_label = 'Insentif PIC Posyandu' then 'pic_incentive_posyandu'
          when v_operational_type = 'pic_incentive' then 'pic_incentive_school'
          when v_operational_type = 'vehicle_rent' then 'vehicle_rent'
          else null
        end
      else null
    end;

    v_mapping_status := null;
    v_destination_role := null;
    if v_rule_type is not null and v_disposition <> 'excluded' then
      select coalesce(r.mapping_status, 'active'), r.target_role
        into v_mapping_status, v_destination_role
      from public.kitchen_operational_account_rules r
      where r.kitchen_id = p_kitchen_id
        and (
          r.rule_type = v_rule_type
          or (v_kind = 'lain_lain' and v_operational_type = 'pic_incentive'
              and r.rule_type in ('pic_incentive_school', 'pic_incentive_posyandu'))
        )
        and r.is_active
        and lower(regexp_replace(btrim(r.owner_name), '\s+', ' ', 'g')) =
            lower(regexp_replace(btrim(v_recipient), '\s+', ' ', 'g'))
        and upper(regexp_replace(btrim(r.bank), '\s+', ' ', 'g')) = v_bank
        and regexp_replace(btrim(r.account_number), '\s+', '', 'g') = v_account_number
      order by case when coalesce(r.mapping_status, 'active') = 'active' then 0 else 1 end
      limit 1;

      if found then
        if v_mapping_status = 'excluded' then
          v_disposition := 'excluded';
          v_exclusion_reason := 'Mapping Data Rekening ditandai Dikecualikan. Baris tetap tercatat untuk audit, tetapi tidak dibuat sebagai transaksi SIM-SPPG.';
        end if;
      else
        if not exists (
          select 1
          from public.kitchen_operational_account_rules r
          where r.kitchen_id = p_kitchen_id
            and (
              r.rule_type = v_rule_type
              or (v_kind = 'lain_lain' and v_operational_type = 'pic_incentive'
                  and r.rule_type in ('pic_incentive_school', 'pic_incentive_posyandu'))
            )
            and r.is_active
        ) then
          raise exception 'Mapping % untuk dapur % belum diatur di Data Rekening. Impor diblokir sampai mapping dibuat.',
            v_rule_type, v_kitchen.name;
        else
          raise exception 'Nama penerima, bank, atau nomor rekening pada baris % tidak cocok dengan Data Rekening untuk jenis %. Koreksi mapping atau sumber Maker sebelum menyimpan.',
            v_line_number, v_rule_type;
        end if;
      end if;
    end if;

    if v_disposition <> 'excluded' and
      (v_recipient = '' or v_bank = '' or v_account_number = '') then
      raise exception 'Identitas rekening draft pada baris % belum lengkap.', v_line_number;
    end if;

    if v_requested_disposition = 'excluded' and v_disposition <> 'excluded' then
      raise exception 'Baris % tidak memenuhi aturan pengecualian yang diizinkan.', v_line_number;
    end if;
    if v_disposition = 'excluded' then
      if v_amount is not null then
        v_excluded_total := v_excluded_total + v_amount;
      end if;
      v_excluded_count := v_excluded_count + 1;
      insert into public.maker_import_batch_rows (
        batch_id, line_number, raw_line, maker_kind, source_category,
        recipient_name, bank, account_number, amount, details,
        flow_type, category, operational_type, disposition, exclusion_reason,
        manual_verified, account_id
      ) values (
        v_batch_id, v_line_number, v_raw_line, v_kind, v_source_category,
        nullif(v_recipient,''), nullif(v_bank,''), nullif(v_account_number,''),
        v_amount, v_details, v_flow, v_category, v_operational_type,
        'excluded', coalesce(v_exclusion_reason, 'Dikecualikan dari impor atas pemeriksaan Admin.'),
        v_verified, v_account_id
      );
      continue;
    end if;

    if v_amount is null then
      raise exception 'Nominal baris % tidak valid. Format nominal harus bilangan bulat IDR.', v_line_number;
    end if;
    if v_kind = 'lain_lain' and not v_verified then
      raise exception 'Baris Lain-lain nomor % wajib diverifikasi manual.', v_line_number;
    end if;

    -- Prevent a changed whitespace/hash or a repeated row from bypassing the existing duplicate policy.
    if exists (
      select 1 from public.transactions t
      where t.transaction_date = p_transaction_date
        and t.kitchen_id = p_kitchen_id
        and t.flow_type = v_flow
        and t.amount = v_amount
        and (
          (v_flow in ('income','neutral') and t.account_id is not distinct from v_account_id)
          or (v_flow = 'real_ops' and t.account_id is null)
          or (v_flow = 'ops_disbursement' and t.account_id is null and t.destination_label in ('Akuntan ' || v_kitchen.name, 'Aslap ' || v_kitchen.name, 'PIC Yayasan ' || v_kitchen.name, 'Pihak Luar ' || v_kitchen.name, 'OPS ' || v_kitchen.name))
          or (v_flow = 'operational_disbursement' and t.operational_type is not distinct from v_operational_type)
        )
        -- Do not flag a previous row inserted by this same batch as an existing duplicate.
        and not exists (
          select 1
          from public.maker_import_batch_rows previous_row
          where previous_row.batch_id = v_batch_id
            and previous_row.transaction_id = t.id
        )
    ) then
      raise exception 'Transaksi serupa sudah ada di database (baris %). Periksa tanggal, dapur, jenis, rekening, dan nominal.', v_line_number;
    end if;

    if v_kind = 'rab' and (v_flow <> 'income' or v_category <> 'RAB') then
      raise exception 'Klasifikasi RAB pada baris % tidak konsisten.', v_line_number;
    elsif v_kind = 'gas' and (v_flow <> 'neutral' or v_category <> 'GAS') then
      raise exception 'Klasifikasi GAS pada baris % tidak konsisten.', v_line_number;
    elsif v_kind = 'ops_harian' and (v_flow <> 'ops_disbursement' or v_category <> 'OPS') then
      raise exception 'Klasifikasi Ops Harian pada baris % tidak konsisten.', v_line_number;
    elsif v_kind = 'sppg_rent' and (v_flow <> 'operational_disbursement' or v_operational_type <> 'sppg_rent') then
      raise exception 'Klasifikasi Sewa SPPG pada baris % tidak konsisten.', v_line_number;
    elsif v_kind = 'relawan_salary' and (v_flow <> 'operational_disbursement' or v_operational_type <> 'relawan_salary') then
      raise exception 'Klasifikasi Gaji Relawan pada baris % tidak konsisten.', v_line_number;
    elsif v_kind in ('pic_school','pic_posyandu') and (v_flow <> 'operational_disbursement' or v_operational_type <> 'pic_incentive') then
      raise exception 'Klasifikasi Insentif PIC pada baris % tidak konsisten.', v_line_number;
    elsif v_kind = 'vehicle_rent' and (v_flow <> 'operational_disbursement' or v_operational_type <> 'vehicle_rent') then
      raise exception 'Klasifikasi Sewa Kendaraan pada baris % tidak konsisten.', v_line_number;
    end if;

    if v_flow = 'income' then
      if v_category <> 'RAB' or v_account_id is null or not exists (
        select 1 from public.kitchen_account_rules kar
        join public.accounts a on a.id = kar.account_id
        where kar.kitchen_id = p_kitchen_id and kar.account_id = v_account_id and kar.flow_type = 'income'
          and upper(regexp_replace(btrim(a.bank), '\s+', ' ', 'g')) = v_bank
          and regexp_replace(btrim(coalesce(a.account_number,'')), '\s+', '', 'g') = v_account_number
      ) then
        raise exception 'Rekening RAB baris % tidak cocok dengan mapping bank/nomor rekening di database.', v_line_number;
      end if;
    elsif v_flow = 'neutral' then
      if v_category <> 'GAS' or v_account_id is null or not exists (
        select 1 from public.kitchen_account_rules kar
        join public.accounts a on a.id = kar.account_id
        where kar.kitchen_id = p_kitchen_id and kar.account_id = v_account_id and kar.flow_type = 'neutral'
          and upper(regexp_replace(btrim(a.bank), '\s+', ' ', 'g')) = v_bank
          and regexp_replace(btrim(coalesce(a.account_number,'')), '\s+', '', 'g') = v_account_number
      ) then
        raise exception 'Rekening GAS baris % tidak cocok dengan mapping bank/nomor rekening di database.', v_line_number;
      end if;
      if lower(v_kitchen.name) in ('cihaur','sukaraja') then
        raise exception 'GAS tidak tersedia untuk dapur %.', v_kitchen.name;
      end if;
    elsif v_flow = 'ops_disbursement' then
      if v_kind <> 'ops_harian' or v_category <> 'OPS' then
        raise exception 'Klasifikasi OPS / Pencairan baris % tidak valid.', v_line_number;
      end if;
      if not exists (
        select 1 from public.kitchen_operational_account_rules r
        where r.kitchen_id = p_kitchen_id and r.rule_type = 'ops_harian' and r.is_active and coalesce(r.mapping_status, 'active') = 'active'
          and lower(regexp_replace(btrim(r.owner_name), '\s+', ' ', 'g')) = lower(regexp_replace(v_recipient, '\s+', ' ', 'g'))
          and upper(regexp_replace(btrim(r.bank), '\s+', ' ', 'g')) = v_bank
          and regexp_replace(btrim(r.account_number), '\s+', '', 'g') = v_account_number
      ) then
        raise exception 'Mapping Ops Harian baris % tidak cocok persis dengan database.', v_line_number;
      end if;
    elsif v_flow = 'real_ops' then
      if v_category <> 'REAL_OPS' then
        raise exception 'Kategori realisasi operasional baris % tidak valid.', v_line_number;
      end if;
      if not exists (
        select 1 from public.kitchen_operational_account_rules r
        where r.kitchen_id = p_kitchen_id and r.rule_type = 'ops_harian' and r.is_active and coalesce(r.mapping_status, 'active') = 'active'
          and lower(regexp_replace(btrim(r.owner_name), '\s+', ' ', 'g')) = lower(regexp_replace(v_recipient, '\s+', ' ', 'g'))
          and upper(regexp_replace(btrim(r.bank), '\s+', ' ', 'g')) = v_bank
          and regexp_replace(btrim(r.account_number), '\s+', '', 'g') = v_account_number
      ) then
        raise exception 'Mapping Ops Harian baris % tidak cocok persis dengan database.', v_line_number;
      end if;
    elsif v_flow = 'operational_disbursement' then
      if v_category <> 'OPERATIONAL' or v_operational_type not in ('relawan_salary','pic_incentive','vehicle_rent','sppg_rent') then
        raise exception 'Klasifikasi pencairan operasional baris % tidak valid.', v_line_number;
      end if;

      v_rule_type := case
        when v_operational_type = 'sppg_rent' then 'sppg_rent'
        when v_operational_type = 'relawan_salary' then 'gaji_relawan'
        when v_operational_type = 'vehicle_rent' then 'vehicle_rent'
        when v_operational_type = 'pic_incentive' and v_kind = 'pic_posyandu' then 'pic_incentive_posyandu'
        when v_operational_type = 'pic_incentive' then 'pic_incentive_school'
        else null
      end;

      if not exists (
        select 1 from public.kitchen_operational_account_rules r
        where r.kitchen_id = p_kitchen_id and r.is_active and coalesce(r.mapping_status, 'active') = 'active'
          and (
            r.rule_type = v_rule_type
            or (v_kind = 'lain_lain' and v_operational_type = 'pic_incentive' and r.rule_type in ('pic_incentive_school','pic_incentive_posyandu'))
          )
          and lower(regexp_replace(btrim(r.owner_name), '\s+', ' ', 'g')) = lower(regexp_replace(v_recipient, '\s+', ' ', 'g'))
          and upper(regexp_replace(btrim(r.bank), '\s+', ' ', 'g')) = v_bank
          and regexp_replace(btrim(r.account_number), '\s+', '', 'g') = v_account_number
      ) then
        raise exception 'Mapping rekening operasional baris % tidak cocok persis dengan database.', v_line_number;
      end if;
    else
      raise exception 'Jenis transaksi baris % belum ditentukan atau tidak didukung.', v_line_number;
    end if;

    v_note := case
      when v_flow = 'income' then v_details
      when v_flow = 'ops_disbursement' then 'Ops Harian'
      when v_flow = 'operational_disbursement' and v_kind = 'vehicle_rent' then v_source_label
      else null
    end;

    insert into public.transactions (
      transaction_date, kitchen_id, flow_type, category, amount, note,
      account_id, supplier_id, destination_label, operational_type, created_by
    ) values (
      p_transaction_date, p_kitchen_id, v_flow, v_category, v_amount, v_note,
      case when v_flow in ('income','neutral') then v_account_id else null end,
      null, case when v_flow = 'ops_disbursement' then
        case v_destination_role
          when 'aslap' then 'Aslap ' || v_kitchen.name
          when 'akuntan' then 'Akuntan ' || v_kitchen.name
          when 'pic_yayasan' then 'PIC Yayasan ' || v_kitchen.name
          when 'berkah_mandiri_putra' then 'Berkah Mandiri Putra ' || v_kitchen.name
          when 'supplier' then 'Pihak Luar ' || v_kitchen.name
          when 'other' then 'OPS ' || v_kitchen.name
          else 'Akuntan ' || v_kitchen.name
        end
      else null end,
      case when v_flow = 'operational_disbursement' then v_operational_type else null end,
      v_user_id
    ) returning id into v_transaction_id;

    insert into public.maker_import_batch_rows (
      batch_id, line_number, raw_line, maker_kind, source_category,
      recipient_name, bank, account_number, amount, details,
      flow_type, category, operational_type, disposition, exclusion_reason,
      manual_verified, account_id, transaction_id
    ) values (
      v_batch_id, v_line_number, v_raw_line, v_kind, v_source_category,
      nullif(v_recipient,''), nullif(v_bank,''), nullif(v_account_number,''),
      v_amount, v_details, v_flow, v_category, v_operational_type,
      'imported', null, v_verified,
      case when v_flow in ('income','neutral') then v_account_id else null end,
      v_transaction_id
    );

    v_imported_count := v_imported_count + 1;
    v_imported_total := v_imported_total + v_amount;
  end loop;

  -- A batch containing only excluded rows is kept for audit; it creates no program transactions.

  update public.maker_import_batches
  set imported_count = v_imported_count,
      excluded_count = v_excluded_count,
      imported_total_amount = v_imported_total,
      excluded_total_amount = v_excluded_total
  where id = v_batch_id;

  return jsonb_build_object(
    'duplicate', false,
    'batch_id', v_batch_id,
    'inserted_count', v_imported_count,
    'excluded_count', v_excluded_count,
    'total_amount', v_imported_total,
    'excluded_total_amount', v_excluded_total
  );
end;
$function$;
revoke all on function public.import_maker_transactions(text, uuid, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_maker_transactions(text, uuid, date, text, jsonb) to authenticated;

-- Expose only destination role labels to authenticated operators/admins.
-- Bank/account identities remain admin-only in kitchen_operational_account_rules.
create or replace function public.get_operational_destination_roles()
returns table(kitchen_id uuid, target_role text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select r.kitchen_id, r.target_role
  from public.kitchen_operational_account_rules r
  where r.rule_type = 'ops_harian'
    and r.is_active
    and r.mapping_status = 'active'
    and r.target_role is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'operator')
    );
$function$;

revoke all on function public.get_operational_destination_roles() from public, anon;
grant execute on function public.get_operational_destination_roles() to authenticated;
