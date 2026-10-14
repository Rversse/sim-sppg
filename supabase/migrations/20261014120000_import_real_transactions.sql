-- Multi-kitchen Import RAB / Real: audited batch and atomic insert RPC.
create table if not exists public.real_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('cianjur','cidaun')),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  transaction_date date not null,
  source_text text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  imported_count integer not null default 0 check (imported_count >= 0),
  excluded_count integer not null default 0 check (excluded_count >= 0),
  imported_total_amount bigint not null default 0 check (imported_total_amount >= 0),
  excluded_total_amount bigint not null default 0 check (excluded_total_amount >= 0),
  unique (source_type, content_hash)
);

create table if not exists public.real_import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.real_import_batches(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  source_line_number integer not null check (source_line_number > 0),
  source_type text not null check (source_type in ('cianjur','cidaun')),
  raw_line text not null,
  kitchen_id uuid references public.kitchens(id) on delete set null,
  kitchen_name text not null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  amount bigint not null check (amount > 0),
  note text not null,
  disposition text not null check (disposition in ('import','excluded')),
  exclusion_reason text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (batch_id, line_number)
);

create index if not exists real_import_batches_date_idx
  on public.real_import_batches (transaction_date, source_type, created_at desc);
create index if not exists real_import_rows_transaction_idx
  on public.real_import_batch_rows (transaction_id);
create index if not exists real_import_rows_source_kitchen_idx
  on public.real_import_batch_rows (source_type, kitchen_id, amount);

alter table public.real_import_batches enable row level security;
alter table public.real_import_batch_rows enable row level security;
revoke all on table public.real_import_batches from public, anon, authenticated;
revoke all on table public.real_import_batch_rows from public, anon, authenticated;
grant select on table public.real_import_batches to authenticated;
grant select on table public.real_import_batch_rows to authenticated;

drop policy if exists real_import_batches_admin_read on public.real_import_batches;
create policy real_import_batches_admin_read
  on public.real_import_batches for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists real_import_rows_admin_read on public.real_import_batch_rows;
create policy real_import_rows_admin_read
  on public.real_import_batch_rows for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create or replace function public.import_real_transactions(
  p_source_type text,
  p_content_hash text,
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
  v_supplier_id uuid;
  v_batch_id uuid;
  v_row jsonb;
  v_row_number integer;
  v_source_line_number integer;
  v_kitchen_id uuid;
  v_kitchen_name text;
  v_db_kitchen_name text;
  v_amount bigint;
  v_note text;
  v_raw_line text;
  v_disposition text;
  v_exclusion_reason text;
  v_transaction_id uuid;
  v_imported_count integer := 0;
  v_excluded_count integer := 0;
  v_imported_total bigint := 0;
  v_excluded_total bigint := 0;
  v_source_label text;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Hanya Admin yang boleh mengimpor RAB / Real.';
  end if;

  if p_source_type is null or p_source_type not in ('cianjur','cidaun') then
    raise exception 'Sumber laporan tidak dikenali.';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Hash sumber tidak valid.';
  end if;
  if p_transaction_date is null or nullif(btrim(p_source_text),'') is null then
    raise exception 'Tanggal dan teks sumber wajib diisi.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Format baris impor tidak valid.';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'Tidak ada baris transaksi untuk disimpan.';
  end if;

  -- Serialize duplicate submissions for a source document.
  perform pg_advisory_xact_lock(hashtext(p_source_type || ':' || p_content_hash)::bigint);

  if exists (
    select 1 from public.real_import_batches b
    where b.source_type = p_source_type and b.content_hash = p_content_hash
  ) then
    raise exception 'Dokumen sumber yang sama sudah pernah diimpor. Batch dibatalkan untuk mencegah input ganda.';
  end if;

  select s.id into v_supplier_id
  from public.suppliers s
  where lower(btrim(s.name)) = 'koperasi arutala' and s.is_active
  order by s.created_at nulls last
  limit 1;

  if v_supplier_id is null then
    raise exception 'Supplier aktif Koperasi Arutala tidak ditemukan.';
  end if;

  v_source_label := case p_source_type when 'cianjur' then 'Belanja Cianjur' else 'Belanja Cidaun' end;

  insert into public.real_import_batches (
    source_type, content_hash, transaction_date, source_text, created_by
  ) values (
    p_source_type, p_content_hash, p_transaction_date,
    p_source_text, v_user_id
  ) returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows) as t(value)
  loop
    v_row_number := nullif(v_row->>'line_number','')::integer;
    v_source_line_number := nullif(v_row->>'source_line_number','')::integer;
    v_kitchen_id := nullif(v_row->>'kitchen_id','')::uuid;
    v_kitchen_name := btrim(coalesce(v_row->>'kitchen_name',''));
    v_amount := nullif(v_row->>'amount','')::bigint;
    v_raw_line := coalesce(v_row->>'raw_line','');
    v_disposition := coalesce(v_row->>'disposition','import');
    v_exclusion_reason := nullif(btrim(coalesce(v_row->>'exclusion_reason','')),'');
    v_note := btrim(coalesce(v_row->>'note', v_source_label));

    if v_row_number is null or v_row_number < 1
      or v_source_line_number is null or v_source_line_number < 1
      or v_kitchen_id is null
      or v_amount is null or v_amount <= 0
      or nullif(v_kitchen_name,'') is null
      or nullif(btrim(v_raw_line),'') is null then
      raise exception 'Identitas dapur, baris sumber, atau nominal tidak valid pada baris impor %.', coalesce(v_row_number,0);
    end if;
    if v_disposition not in ('import','excluded') then
      raise exception 'Status baris impor % tidak valid.', v_row_number;
    end if;

    select k.name into v_db_kitchen_name
    from public.kitchens k
    where k.id = v_kitchen_id and k.is_active;
    if v_db_kitchen_name is null or lower(btrim(v_db_kitchen_name)) <> lower(btrim(v_kitchen_name)) then
      raise exception 'Dapur pada baris % tidak cocok dengan data dapur aktif.', v_row_number;
    end if;

    if exists (
      select 1
      from public.real_import_batch_rows prior
      where prior.batch_id = v_batch_id
        and prior.line_number = v_row_number
    ) then
      raise exception 'Nomor baris impor % terduplikasi.', v_row_number;
    end if;

    if v_disposition = 'import' then
      -- Refuse matching transactions already present, except a matching row
      -- explicitly audited as the other source (Cianjur vs Cidaun).
      if exists (
        select 1
        from public.transactions t
        where t.transaction_date = p_transaction_date
          and t.kitchen_id = v_kitchen_id
          and t.flow_type = 'expense'
          and t.category = 'Supplier'
          and t.supplier_id = v_supplier_id
          and t.amount = v_amount
          and not exists (
            select 1
            from public.real_import_batch_rows prior_row
            join public.real_import_batches prior_batch on prior_batch.id = prior_row.batch_id
            where prior_row.transaction_id = t.id
              and prior_batch.source_type <> p_source_type
          )
      ) then
        raise exception 'Duplikat terdeteksi pada baris %: tanggal, dapur, supplier Koperasi Arutala, dan nominal sudah ada. Baris ini tidak disimpan.', v_row_number;
      end if;
    end if;

    if v_disposition = 'import' then
      insert into public.transactions (
        transaction_date, kitchen_id, flow_type, category,
        amount, note, supplier_id, created_by
      ) values (
        p_transaction_date, v_kitchen_id, 'expense', 'Supplier',
        v_amount, left(coalesce(nullif(v_note,''),v_source_label), 500),
        v_supplier_id, v_user_id
      ) returning id into v_transaction_id;

      v_imported_count := v_imported_count + 1;
      v_imported_total := v_imported_total + v_amount;
    else
      v_transaction_id := null;
      v_excluded_count := v_excluded_count + 1;
      v_excluded_total := v_excluded_total + v_amount;
    end if;

    insert into public.real_import_batch_rows (
      batch_id, line_number, source_line_number, source_type,
      raw_line, kitchen_id, kitchen_name, supplier_id, amount, note,
      disposition, exclusion_reason, transaction_id
    ) values (
      v_batch_id, v_row_number, v_source_line_number, p_source_type,
      v_raw_line, v_kitchen_id, v_db_kitchen_name, v_supplier_id, v_amount,
      left(coalesce(nullif(v_note,''),v_source_label), 500),
      case when v_disposition = 'import' then 'imported' else 'excluded' end,
      case when v_disposition = 'import' then null else coalesce(v_exclusion_reason,'Dikecualikan saat verifikasi Admin.') end,
      v_transaction_id
    );
  end loop;

  update public.real_import_batches
  set imported_count = v_imported_count,
      excluded_count = v_excluded_count,
      imported_total_amount = v_imported_total,
      excluded_total_amount = v_excluded_total
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'inserted_count', v_imported_count,
    'excluded_count', v_excluded_count,
    'total_amount', v_imported_total,
    'excluded_total_amount', v_excluded_total
  );
end;
$function$;

revoke all on function public.import_real_transactions(text,text,date,text,jsonb) from public, anon;
grant execute on function public.import_real_transactions(text,text,date,text,jsonb) to authenticated;
