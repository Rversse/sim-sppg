-- Allow Koperasi users to record OPS / Real with owner-scoped audit history.
-- RAB / Real remains on the existing Koperasi supplier flow.

alter table public.real_import_batches
  drop constraint if exists real_import_batches_source_type_check;

alter table public.real_import_batches
  add constraint real_import_batches_source_type_check
  check (
    source_type = any (
      array['cianjur', 'cidaun', 'koperasi', 'koperasi_ops_real']::text[]
    )
  );

create table if not exists public.koperasi_ops_real_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.real_import_batches(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  kitchen_id uuid references public.kitchens(id) on delete set null,
  kitchen_name text not null,
  amount bigint not null check (amount > 0),
  note text not null default 'OPS / Real',
  disposition text not null check (disposition in ('imported', 'excluded')),
  exclusion_reason text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint koperasi_ops_real_batch_rows_batch_line_key unique (batch_id, line_number)
);

create index if not exists koperasi_ops_real_batch_rows_batch_disposition_idx
  on public.koperasi_ops_real_batch_rows (batch_id, disposition);

create index if not exists koperasi_ops_real_batch_rows_transaction_idx
  on public.koperasi_ops_real_batch_rows (transaction_id)
  where transaction_id is not null;

alter table public.koperasi_ops_real_batch_rows enable row level security;

revoke all on table public.koperasi_ops_real_batch_rows from public, anon;
grant select on table public.koperasi_ops_real_batch_rows to authenticated;

drop policy if exists koperasi_ops_real_rows_admin_read
  on public.koperasi_ops_real_batch_rows;
create policy koperasi_ops_real_rows_admin_read
  on public.koperasi_ops_real_batch_rows
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );

drop policy if exists koperasi_ops_real_rows_koperasi_read_own
  on public.koperasi_ops_real_batch_rows;
create policy koperasi_ops_real_rows_koperasi_read_own
  on public.koperasi_ops_real_batch_rows
  for select to authenticated
  using (
    exists (
      select 1
      from public.real_import_batches b
      join public.profiles p on p.id = (select auth.uid())
      where b.id = koperasi_ops_real_batch_rows.batch_id
        and b.source_type = 'koperasi_ops_real'
        and b.created_by = (select auth.uid())
        and p.role = 'koperasi'
    )
  );

drop policy if exists real_import_batches_koperasi_ops_real_read_own
  on public.real_import_batches;
create policy real_import_batches_koperasi_ops_real_read_own
  on public.real_import_batches
  for select to authenticated
  using (
    source_type = 'koperasi_ops_real'
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'koperasi'
    )
  );

-- Preserve the existing roles while allowing Koperasi to read only its own
-- transactions backed by either the RAB or OPS Koperasi batch type.
drop policy if exists "transactions select" on public.transactions;
create policy "transactions select"
  on public.transactions
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and (
          p.role in ('admin', 'operator', 'viewer')
          or (
            p.role = 'koperasi'
            and transactions.created_by = (select auth.uid())
            and transactions.real_import_batch_id is not null
            and exists (
              select 1
              from public.real_import_batches b
              where b.id = transactions.real_import_batch_id
                and b.created_by = (select auth.uid())
                and b.source_type in ('koperasi', 'koperasi_ops_real')
            )
          )
        )
    )
  );

create or replace function public.save_koperasi_ops_real_transactions(
  p_content_hash text,
  p_transaction_date date,
  p_source_text text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
  v_row jsonb;
  v_line_number integer;
  v_kitchen_id uuid;
  v_kitchen_name text;
  v_db_kitchen_name text;
  v_amount bigint;
  v_transaction_id uuid;
  v_inserted_count integer := 0;
  v_total_amount bigint := 0;
  v_seen_kitchens uuid[] := array[]::uuid[];
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_user_id is null or v_role is distinct from 'koperasi' then
    raise exception using errcode = '42501',
      message = 'Akses hanya untuk akun Koperasi.';
  end if;

  if p_content_hash is null
    or p_content_hash !~ '^[a-f0-9]{64}$'
    or p_transaction_date is null
    or nullif(btrim(p_source_text), '') is null
    or p_rows is null
    or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) = 0 then
    raise exception 'Tanggal, identitas batch, dan daftar nominal OPS / Real wajib valid.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('koperasi_ops_real:' || v_user_id::text || ':' ||
      p_transaction_date::text || ':' || p_content_hash)::bigint
  );

  if exists (
    select 1
    from public.real_import_batches b
    where b.source_type = 'koperasi_ops_real'
      and b.content_hash = p_content_hash
  ) then
    raise exception 'Pengiriman data OPS / Real yang sama sudah pernah disimpan.';
  end if;

  insert into public.real_import_batches (
    source_type,
    content_hash,
    transaction_date,
    source_text,
    created_by
  ) values (
    'koperasi_ops_real',
    p_content_hash,
    p_transaction_date,
    p_source_text,
    v_user_id
  )
  returning id into v_batch_id;

  for v_row in
    select value
    from jsonb_array_elements(p_rows) as t(value)
  loop
    v_line_number := nullif(v_row->>'line_number', '')::integer;
    v_kitchen_id := nullif(v_row->>'kitchen_id', '')::uuid;
    v_kitchen_name := btrim(coalesce(v_row->>'kitchen_name', ''));
    v_amount := nullif(v_row->>'amount', '')::bigint;

    if v_line_number is null
      or v_line_number < 1
      or v_kitchen_id is null
      or v_kitchen_name = ''
      or v_amount is null
      or v_amount <= 0 then
      raise exception 'Dapur dan nominal OPS / Real pada baris % tidak valid.',
        coalesce(v_line_number, 0);
    end if;

    if v_kitchen_id = any(v_seen_kitchens) then
      raise exception 'Dapur % muncul lebih dari sekali pada input OPS / Real.',
        v_kitchen_name;
    end if;
    v_seen_kitchens := array_append(v_seen_kitchens, v_kitchen_id);

    select k.name into v_db_kitchen_name
    from public.kitchens k
    where k.id = v_kitchen_id
      and k.is_active;

    if v_db_kitchen_name is null
      or lower(btrim(v_db_kitchen_name)) <> lower(btrim(v_kitchen_name)) then
      raise exception 'Dapur pada baris % tidak cocok dengan data dapur aktif.',
        v_line_number;
    end if;

    -- One daily OPS / Real entry per kitchen. This also prevents a new
    -- Koperasi batch from duplicating an OPS / Real transaction already
    -- recorded through the existing Admin flow.
    if exists (
      select 1
      from public.transactions t
      where t.transaction_date = p_transaction_date
        and t.kitchen_id = v_kitchen_id
        and t.flow_type = 'expense'
        and t.category = 'OPS'
    ) then
      raise exception 'OPS / Real untuk dapur % sudah tercatat pada tanggal ini. Periksa transaksi yang ada agar laporan tidak terhitung dua kali.',
        v_db_kitchen_name;
    end if;

    insert into public.transactions (
      transaction_date,
      kitchen_id,
      flow_type,
      category,
      account_id,
      supplier_id,
      amount,
      note,
      created_by,
      real_import_batch_id,
      real_import_line_number
    ) values (
      p_transaction_date,
      v_kitchen_id,
      'expense',
      'OPS',
      null,
      null,
      v_amount,
      'OPS / Real',
      v_user_id,
      v_batch_id,
      v_line_number
    )
    returning id into v_transaction_id;

    insert into public.koperasi_ops_real_batch_rows (
      batch_id,
      line_number,
      kitchen_id,
      kitchen_name,
      amount,
      note,
      disposition,
      transaction_id
    ) values (
      v_batch_id,
      v_line_number,
      v_kitchen_id,
      v_db_kitchen_name,
      v_amount,
      'OPS / Real',
      'imported',
      v_transaction_id
    );

    v_inserted_count := v_inserted_count + 1;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update public.real_import_batches
  set imported_count = v_inserted_count,
      imported_total_amount = v_total_amount
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'inserted_count', v_inserted_count,
    'total_amount', v_total_amount
  );
end;
$function$;

create or replace function public.update_koperasi_ops_real_transaction(
  p_transaction_id uuid,
  p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
  v_line_number integer;
  v_transaction_date date;
  v_kitchen_id uuid;
  v_kitchen_name text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_user_id is null or v_role is distinct from 'koperasi' then
    raise exception using errcode = '42501',
      message = 'Akses hanya untuk akun Koperasi.';
  end if;

  if p_transaction_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'ID transaksi dan nominal OPS / Real positif wajib diisi.';
  end if;

  select
    t.real_import_batch_id,
    t.real_import_line_number,
    t.transaction_date,
    t.kitchen_id,
    r.kitchen_name
  into
    v_batch_id,
    v_line_number,
    v_transaction_date,
    v_kitchen_id,
    v_kitchen_name
  from public.transactions t
  join public.real_import_batches b
    on b.id = t.real_import_batch_id
  join public.koperasi_ops_real_batch_rows r
    on r.transaction_id = t.id
   and r.batch_id = b.id
  where t.id = p_transaction_id
    and t.created_by = v_user_id
    and t.flow_type = 'expense'
    and t.category = 'OPS'
    and b.source_type = 'koperasi_ops_real'
    and b.created_by = v_user_id
    and r.disposition = 'imported'
  for update of t, b, r;

  if v_batch_id is null then
    raise exception using errcode = '42501',
      message = 'Transaksi OPS / Real ini bukan milik akun Koperasi Anda.';
  end if;

  if exists (
    select 1
    from public.transactions t
    where t.id <> p_transaction_id
      and t.transaction_date = v_transaction_date
      and t.kitchen_id = v_kitchen_id
      and t.flow_type = 'expense'
      and t.category = 'OPS'
  ) then
    raise exception 'Ada transaksi OPS / Real lain untuk dapur % pada tanggal tersebut. Periksa agar tidak terjadi pencatatan ganda.',
      v_kitchen_name;
  end if;

  update public.transactions
  set amount = p_amount
  where id = p_transaction_id;

  update public.koperasi_ops_real_batch_rows
  set amount = p_amount,
      note = 'OPS / Real'
  where transaction_id = p_transaction_id
    and batch_id = v_batch_id
    and line_number = v_line_number
    and disposition = 'imported';

  update public.real_import_batches b
  set imported_total_amount = coalesce((
    select sum(r.amount)
    from public.koperasi_ops_real_batch_rows r
    where r.batch_id = v_batch_id
      and r.disposition = 'imported'
  ), 0)
  where b.id = v_batch_id;

  return jsonb_build_object(
    'updated', true,
    'transaction_id', p_transaction_id,
    'batch_id', v_batch_id
  );
end;
$function$;

create or replace function public.delete_koperasi_ops_real_transaction(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
  v_line_number integer;
  v_amount bigint;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_user_id is null or v_role is distinct from 'koperasi' then
    raise exception using errcode = '42501',
      message = 'Akses hanya untuk akun Koperasi.';
  end if;

  if p_transaction_id is null then
    raise exception 'ID transaksi OPS / Real wajib diisi.';
  end if;

  select
    t.real_import_batch_id,
    t.real_import_line_number,
    r.amount
  into
    v_batch_id,
    v_line_number,
    v_amount
  from public.transactions t
  join public.real_import_batches b
    on b.id = t.real_import_batch_id
  join public.koperasi_ops_real_batch_rows r
    on r.transaction_id = t.id
   and r.batch_id = b.id
  where t.id = p_transaction_id
    and t.created_by = v_user_id
    and t.flow_type = 'expense'
    and t.category = 'OPS'
    and b.source_type = 'koperasi_ops_real'
    and b.created_by = v_user_id
    and r.disposition = 'imported'
  for update of t, b, r;

  if v_batch_id is null then
    raise exception using errcode = '42501',
      message = 'Transaksi OPS / Real ini bukan transaksi aktif milik akun Koperasi Anda.';
  end if;

  update public.koperasi_ops_real_batch_rows
  set disposition = 'excluded',
      exclusion_reason = 'Dihapus oleh akun Koperasi',
      transaction_id = null
  where transaction_id = p_transaction_id
    and batch_id = v_batch_id
    and line_number = v_line_number
    and disposition = 'imported';

  delete from public.transactions
  where id = p_transaction_id;

  update public.real_import_batches b
  set imported_count = (
        select count(*)
        from public.koperasi_ops_real_batch_rows r
        where r.batch_id = v_batch_id
          and r.disposition = 'imported'
      ),
      excluded_count = (
        select count(*)
        from public.koperasi_ops_real_batch_rows r
        where r.batch_id = v_batch_id
          and r.disposition = 'excluded'
      ),
      imported_total_amount = coalesce((
        select sum(r.amount)
        from public.koperasi_ops_real_batch_rows r
        where r.batch_id = v_batch_id
          and r.disposition = 'imported'
      ), 0),
      excluded_total_amount = coalesce((
        select sum(r.amount)
        from public.koperasi_ops_real_batch_rows r
        where r.batch_id = v_batch_id
          and r.disposition = 'excluded'
      ), 0)
  where b.id = v_batch_id;

  return jsonb_build_object(
    'deleted', true,
    'transaction_id', p_transaction_id,
    'batch_id', v_batch_id,
    'excluded_amount', v_amount
  );
end;
$function$;

-- The existing Koperasi RPCs also perform writes through SECURITY DEFINER.
-- Keep them available to signed-in Koperasi users, but not anonymous callers.
revoke all on function public.save_koperasi_real_transactions(text, date, text, jsonb)
  from public, anon;
grant execute on function public.save_koperasi_real_transactions(text, date, text, jsonb)
  to authenticated;

revoke all on function public.update_koperasi_real_transaction(uuid, bigint)
  from public, anon;
grant execute on function public.update_koperasi_real_transaction(uuid, bigint)
  to authenticated;

revoke all on function public.delete_koperasi_real_transaction(uuid)
  from public, anon;
grant execute on function public.delete_koperasi_real_transaction(uuid)
  to authenticated;

revoke all on function public.save_koperasi_ops_real_transactions(text, date, text, jsonb)
  from public, anon;
grant execute on function public.save_koperasi_ops_real_transactions(text, date, text, jsonb)
  to authenticated;

revoke all on function public.update_koperasi_ops_real_transaction(uuid, bigint)
  from public, anon;
grant execute on function public.update_koperasi_ops_real_transaction(uuid, bigint)
  to authenticated;

revoke all on function public.delete_koperasi_ops_real_transaction(uuid)
  from public, anon;
grant execute on function public.delete_koperasi_ops_real_transaction(uuid)
  to authenticated;

notify pgrst, 'reload schema';
