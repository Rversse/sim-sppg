-- Secure, auditable import bridge from Maker-Pencairan into SIM-SPPG.
begin;

create table if not exists public.kitchen_operational_account_rules (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  rule_type text not null check (rule_type in (
    'ops_harian',
    'gaji_relawan',
    'pic_incentive_school',
    'pic_incentive_posyandu',
    'sppg_rent',
    'vehicle_rent'
  )),
  owner_name text not null check (length(btrim(owner_name)) > 0),
  bank text not null check (length(btrim(bank)) > 0),
  account_number text not null check (length(btrim(account_number)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kitchen_operational_account_rules_unique
    unique (kitchen_id, rule_type, bank, account_number)
);

create index if not exists kitchen_operational_account_rules_lookup_idx
  on public.kitchen_operational_account_rules
    (kitchen_id, rule_type, is_active);

alter table public.kitchen_operational_account_rules enable row level security;
drop policy if exists "operational account rules admin select" on public.kitchen_operational_account_rules;
create policy "operational account rules admin select"
  on public.kitchen_operational_account_rules for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));
drop policy if exists "operational account rules admin insert" on public.kitchen_operational_account_rules;
create policy "operational account rules admin insert"
  on public.kitchen_operational_account_rules for insert to authenticated
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));
drop policy if exists "operational account rules admin update" on public.kitchen_operational_account_rules;
create policy "operational account rules admin update"
  on public.kitchen_operational_account_rules for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));
drop policy if exists "operational account rules admin delete" on public.kitchen_operational_account_rules;
create policy "operational account rules admin delete"
  on public.kitchen_operational_account_rules for delete to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));
grant select, insert, update, delete on public.kitchen_operational_account_rules to authenticated;

-- Seed the account mappings that currently exist in Maker-Pencairan.
-- Protected operational rows are still gated by kitchens.operational_recipient_name below.
with explicit_rules(kitchen_name, rule_type, owner_name, bank, account_number) as (
  values
    ('Campakamulya','ops_harian','Melan Fitriani','BNI','2035516850'),
    ('Cihaur','ops_harian','Rizki Ginanjar','BRI','010501136046504'),
    ('Cikondang','ops_harian','Annisa Wulan Dari','BNI','2044709294'),
    ('Cipetir','ops_harian','Fairuz Hibatullah','SEABANK','901222967962'),
    ('Cisepat','ops_harian','Lia Ariska','BNI','1688603689'),
    ('Kertajadi','ops_harian','Rachmat Surya','BRI','407701032673505'),

    ('Campakamulya','gaji_relawan','Melan Fitriani','BNI','2035516850'),
    ('Cihaur','gaji_relawan','Taufik Hidayat','BRI','407701030044506'),
    ('Cikondang','gaji_relawan','Annisa Wulan Dari','BNI','2044709294'),
    ('Cipetir','gaji_relawan','Yusgar Anggara Dinata','BRI','1820018916205'),
    ('Cisepat','gaji_relawan','Robi Sulaeman','BNI','2025279933'),
    ('Kertajadi','gaji_relawan','Rachmat Surya','BRI','407701032673505'),
    ('Sukaraja','gaji_relawan','Ade Rohmat Hidayat','BRI','010501002303563'),

    ('Campakamulya','pic_incentive_school','Melan Fitriani','BNI','2035516850'),
    ('Cihaur','pic_incentive_school','Taufik Hidayat','BRI','407701030044506'),
    ('Cikondang','pic_incentive_school','Annisa Wulan Dari','BNI','2044709294'),
    ('Cipetir','pic_incentive_school','Yusgar Anggara Dinata','BRI','1820018916205'),
    ('Cisepat','pic_incentive_school','Robi Sulaeman','BNI','2025279933'),
    ('Kertajadi','pic_incentive_school','Rachmat Surya','BRI','407701032673505'),
    ('Sukaraja','pic_incentive_school','Riri Risa Amelia','BRI','406701011792501'),

    ('Campakamulya','pic_incentive_posyandu','Melan Fitriani','BNI','2035516850'),
    ('Cihaur','pic_incentive_posyandu','Taufik Hidayat','BRI','407701030044506'),
    ('Cikondang','pic_incentive_posyandu','Annisa Wulan Dari','BNI','2044709294'),
    ('Cipetir','pic_incentive_posyandu','Yusgar Anggara Dinata','BRI','1820018916205'),
    ('Cisepat','pic_incentive_posyandu','Robi Sulaeman','BNI','2025279933'),
    ('Kertajadi','pic_incentive_posyandu','Rachmat Surya','BRI','407701032673505'),
    ('Sukaraja','pic_incentive_posyandu','Riri Risa Amelia','BRI','406701011792501'),

    ('Campakamulya','sppg_rent','Enceng Kodir','BNI','2028813591'),
    ('Cihaur','sppg_rent','Taufik Hidayat','BRI','407701030044506'),
    ('Cisepat','sppg_rent','Robi Sulaeman','BNI','2025279933'),
    ('Cipetir','sppg_rent','Yusgar Anggara','BNI','885788718'),
    ('Kertajadi','sppg_rent','Rizki Ginanjar','BNI','2033626616'),
    ('Cikondang','sppg_rent','Aryana','BNI','1976811401'),
    ('Sukaraja','sppg_rent','Ade Rohmat Hidayat','BRI','010501002303563')
),
seed_rows as (
  select k.id as kitchen_id, r.rule_type, r.owner_name, r.bank, r.account_number
  from explicit_rules r
  join public.kitchens k on lower(k.name) = lower(r.kitchen_name)
  union all
  select k.id, 'vehicle_rent', 'Berkah Mandiri Putra', 'MANDIRI', '1820015963523'
  from public.kitchens k
  where k.is_active = true
)
insert into public.kitchen_operational_account_rules
  (kitchen_id, rule_type, owner_name, bank, account_number, is_active)
select kitchen_id, rule_type, owner_name, bank, account_number, true
from seed_rows
on conflict (kitchen_id, rule_type, bank, account_number)
do update set owner_name = excluded.owner_name, is_active = true, updated_at = now();

create table if not exists public.maker_import_batches (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  kitchen_id uuid not null references public.kitchens(id),
  transaction_date date not null,
  source_text text not null check (length(source_text) <= 250000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  imported_count integer not null default 0 check (imported_count >= 0),
  excluded_count integer not null default 0 check (excluded_count >= 0),
  imported_total_amount bigint not null default 0 check (imported_total_amount >= 0),
  excluded_total_amount bigint not null default 0 check (excluded_total_amount >= 0)
);

create table if not exists public.maker_import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.maker_import_batches(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  raw_line text not null,
  maker_kind text not null,
  source_category text not null,
  recipient_name text,
  bank text,
  account_number text,
  amount bigint check (amount is null or amount > 0),
  details text,
  flow_type text,
  category text,
  operational_type text,
  disposition text not null check (disposition in ('imported','excluded')),
  exclusion_reason text,
  manual_verified boolean not null default false,
  account_id uuid references public.accounts(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint maker_import_batch_rows_batch_line_unique unique(batch_id, line_number)
);

create index if not exists maker_import_batch_rows_transaction_idx
  on public.maker_import_batch_rows(transaction_id)
  where transaction_id is not null;
create index if not exists maker_import_batches_date_idx
  on public.maker_import_batches(kitchen_id, transaction_date desc);

alter table public.maker_import_batches enable row level security;
alter table public.maker_import_batch_rows enable row level security;

drop policy if exists "maker import batches admin select" on public.maker_import_batches;
create policy "maker import batches admin select"
  on public.maker_import_batches for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));
drop policy if exists "maker import rows admin select" on public.maker_import_batch_rows;
create policy "maker import rows admin select"
  on public.maker_import_batch_rows for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));
grant select on public.maker_import_batches, public.maker_import_batch_rows to authenticated;
revoke insert, update, delete on public.maker_import_batches, public.maker_import_batch_rows from anon, authenticated;

create or replace function public.import_maker_transactions(
  p_content_hash text,
  p_kitchen_id uuid,
  p_transaction_date date,
  p_source_text text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
  v_protected boolean;
  v_expected_pic text;
  v_source_lines text[];
  v_expected_row_count integer;
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
    v_disposition := coalesce(v_row->>'disposition','import');
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

    if coalesce(v_row->>'amount','') ~ '^\d+$' then
      v_amount_numeric := (v_row->>'amount')::numeric;
      if v_amount_numeric > 0 and v_amount_numeric <= 9223372036854775807 then
        v_amount := v_amount_numeric::bigint;
      end if;
    end if;

    if v_kind = 'combined_payroll' then
      v_disposition := 'excluded';
      v_exclusion_reason := 'Maker menggabungkan beberapa jenis gaji/insentif dalam satu nominal. Pecah per jenis sebelum memasukkan sebagai transaksi program.';
    end if;

    v_protected := (
      (v_flow = 'operational_disbursement' and v_operational_type in ('relawan_salary','pic_incentive','sppg_rent'))
      or (v_kind in ('sppg_rent','relawan_salary','pic_school','pic_posyandu'))
    );

    if v_protected then
      v_expected_pic := btrim(coalesce(v_kitchen.operational_recipient_name, ''));
      if v_expected_pic = '' or
        lower(regexp_replace(v_expected_pic, '\s+', ' ', 'g')) <>
        lower(regexp_replace(v_recipient, '\s+', ' ', 'g')) then
        v_disposition := 'excluded';
        if v_expected_pic = '' then
          v_exclusion_reason := 'PIC Yayasan belum diisi pada master dapur. Tidak masuk transaksi database program; serahkan ke akuntan.';
        else
          v_exclusion_reason := 'Nama penerima bukan PIC Yayasan ' || v_expected_pic || '. Dikecualikan dari database program; serahkan ke akuntan.';
        end if;
      else
        v_rule_type := case
          when v_kind = 'sppg_rent' or v_operational_type = 'sppg_rent' then 'sppg_rent'
          when v_kind = 'relawan_salary' or v_operational_type = 'relawan_salary' then 'gaji_relawan'
          when v_kind = 'pic_school' then 'pic_incentive_school'
          when v_kind = 'pic_posyandu' then 'pic_incentive_posyandu'
          when v_operational_type = 'pic_incentive' then 'pic_incentive_school'
          else null
        end;

        if v_rule_type is null or not exists (
          select 1 from public.kitchen_operational_account_rules r
          where r.kitchen_id = p_kitchen_id and r.is_active
            and (
              r.rule_type = v_rule_type
              or (v_kind = 'lain_lain' and v_operational_type = 'pic_incentive'
                  and r.rule_type in ('pic_incentive_school','pic_incentive_posyandu'))
            )
            and lower(regexp_replace(btrim(r.owner_name), '\\s+', ' ', 'g')) =
                lower(regexp_replace(v_expected_pic, '\\s+', ' ', 'g'))
            and upper(regexp_replace(btrim(r.bank), '\\s+', ' ', 'g')) = v_bank
            and regexp_replace(btrim(r.account_number), '\\s+', '', 'g') = v_account_number
        ) then
          v_disposition := 'excluded';
          v_exclusion_reason := 'Bank/nomor rekening pada teks asli tidak cocok dengan mapping rekening PIC Yayasan. Dikecualikan dari database program; serahkan ke akuntan.';
        end if;
      end if;
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
          or (v_flow = 'operational_disbursement' and t.operational_type is not distinct from v_operational_type)
        )
    ) then
      raise exception 'Transaksi serupa sudah ada di database (baris %). Periksa tanggal, dapur, jenis, rekening, dan nominal.', v_line_number;
    end if;

    if v_kind = 'rab' and (v_flow <> 'income' or v_category <> 'RAB') then
      raise exception 'Klasifikasi RAB pada baris % tidak konsisten.', v_line_number;
    elsif v_kind = 'gas' and (v_flow <> 'neutral' or v_category <> 'GAS') then
      raise exception 'Klasifikasi GAS pada baris % tidak konsisten.', v_line_number;
    elsif v_kind = 'ops_harian' and (v_flow <> 'real_ops' or v_category <> 'REAL_OPS') then
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
    elsif v_flow = 'real_ops' then
      if v_category <> 'REAL_OPS' then
        raise exception 'Kategori realisasi operasional baris % tidak valid.', v_line_number;
      end if;
      if v_kind = 'ops_harian' and not exists (
        select 1 from public.kitchen_operational_account_rules r
        where r.kitchen_id = p_kitchen_id and r.rule_type = 'ops_harian' and r.is_active
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
      if (lower(v_kitchen.name) in ('campakamulya','cikondang','kertajadi') and v_operational_type not in ('vehicle_rent','sppg_rent'))
        or (lower(v_kitchen.name) in ('cipetir','cihaur') and p_transaction_date < date '2026-10-12' and v_operational_type in ('relawan_salary','pic_incentive'))
        or (lower(v_kitchen.name) = 'sukaraja' and v_operational_type = 'pic_incentive') then
        raise exception 'Jenis operasional baris % tidak diizinkan untuk dapur/tanggal tersebut.', v_line_number;
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
        where r.kitchen_id = p_kitchen_id and r.is_active
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

    v_note := case when v_flow = 'income' then v_details else null end;

    insert into public.transactions (
      transaction_date, kitchen_id, flow_type, category, amount, note,
      account_id, supplier_id, destination_label, operational_type, created_by
    ) values (
      p_transaction_date, p_kitchen_id, v_flow, v_category, v_amount, v_note,
      case when v_flow in ('income','neutral') then v_account_id else null end,
      null, null,
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

  if v_imported_count < 1 then
    raise exception 'Tidak ada baris yang lolos validasi untuk disimpan ke database program.';
  end if;

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

revoke all on function public.import_maker_transactions(text, uuid, date, text, jsonb) from public, anon;
grant execute on function public.import_maker_transactions(text, uuid, date, text, jsonb) to authenticated;

commit;
