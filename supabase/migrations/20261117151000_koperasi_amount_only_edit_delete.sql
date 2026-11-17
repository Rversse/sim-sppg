-- Koperasi can correct only the amount and delete only its own entries.
-- Deleted entries remain in the audit batch as excluded rows.

create or replace function public.save_koperasi_real_transactions(
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
  v_supplier_id uuid;
  v_batch_id uuid;
  v_row jsonb;
  v_line_number integer;
  v_kitchen_id uuid;
  v_kitchen_name text;
  v_db_kitchen_name text;
  v_source_type text;
  v_amount bigint;
  v_note text;
  v_transaction_id uuid;
  v_inserted_count integer := 0;
  v_total_amount bigint := 0;
begin
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_user_id is null or v_role <> 'koperasi' then
    raise exception using errcode = '42501', message = 'Akses hanya untuk akun Koperasi.';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
    or p_transaction_date is null or nullif(btrim(p_source_text), '') is null
    or p_rows is null or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) = 0 then
    raise exception 'Tanggal, identitas batch, dan daftar nominal wajib valid.';
  end if;

  perform pg_advisory_xact_lock(hashtext('koperasi:' || p_transaction_date::text || ':' || p_content_hash)::bigint);
  if exists (select 1 from public.real_import_batches b where b.source_type = 'koperasi' and b.content_hash = p_content_hash) then
    raise exception 'Pengiriman data yang sama sudah pernah disimpan.';
  end if;

  select s.id into v_supplier_id from public.suppliers s
  where lower(btrim(s.name)) = 'koperasi arutala' and s.is_active
  order by s.created_at nulls last limit 1;
  if v_supplier_id is null then raise exception 'Supplier aktif Koperasi Arutala tidak ditemukan.'; end if;

  insert into public.real_import_batches (source_type, content_hash, transaction_date, source_text, created_by)
  values ('koperasi', p_content_hash, p_transaction_date, p_source_text, v_user_id)
  returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows) as t(value) loop
    v_line_number := nullif(v_row->>'line_number', '')::integer;
    v_kitchen_id := nullif(v_row->>'kitchen_id', '')::uuid;
    v_kitchen_name := btrim(coalesce(v_row->>'kitchen_name', ''));
    v_amount := nullif(v_row->>'amount', '')::bigint;
    v_source_type := coalesce(v_row->>'source_type', 'umum');

    if v_line_number is null or v_line_number < 1 or v_kitchen_id is null
      or v_amount is null or v_amount <= 0 or v_source_type not in ('umum', 'cianjur', 'cidaun') then
      raise exception 'Dapur, sumber, atau nominal pada baris % tidak valid.', coalesce(v_line_number, 0);
    end if;

    select k.name into v_db_kitchen_name from public.kitchens k where k.id = v_kitchen_id and k.is_active;
    if v_db_kitchen_name is null or lower(btrim(v_db_kitchen_name)) <> lower(btrim(v_kitchen_name)) then
      raise exception 'Dapur pada baris % tidak cocok dengan data dapur aktif.', v_line_number;
    end if;
    if lower(btrim(v_db_kitchen_name)) in ('cisepat', 'kertajadi') and v_source_type = 'umum' then
      raise exception 'Asal Arutala wajib dipilih untuk dapur %.', v_db_kitchen_name;
    end if;
    if lower(btrim(v_db_kitchen_name)) not in ('cisepat', 'kertajadi') and v_source_type <> 'umum' then
      raise exception 'Asal khusus hanya berlaku untuk Cisepat dan Kertajadi.';
    end if;

    v_note := case when v_source_type = 'cidaun' then 'Arutala Cidaun' else 'Arutala Cianjur' end;

    if exists (
      select 1 from public.real_import_batch_rows prior_row
      join public.real_import_batches prior_batch on prior_batch.id = prior_row.batch_id
      where prior_batch.transaction_date = p_transaction_date and prior_row.kitchen_id = v_kitchen_id
        and prior_row.supplier_id = v_supplier_id and prior_row.amount = v_amount
        and prior_row.source_type = v_source_type and prior_row.disposition = 'imported'
    ) then
      raise exception 'Duplikat: tanggal, dapur, asal koperasi, dan nominal yang sama sudah tercatat.';
    end if;
    if exists (
      select 1 from public.transactions t
      where t.transaction_date = p_transaction_date and t.kitchen_id = v_kitchen_id
        and t.flow_type = 'expense' and t.category = 'Supplier' and t.supplier_id = v_supplier_id
        and t.amount = v_amount and coalesce(t.note, '') = v_note
    ) then
      raise exception 'Transaksi dengan tanggal, dapur, asal koperasi, dan nominal yang sama sudah ada.';
    end if;

    insert into public.transactions (
      transaction_date, kitchen_id, flow_type, category, amount, note,
      supplier_id, created_by, real_import_batch_id, real_import_line_number
    ) values (
      p_transaction_date, v_kitchen_id, 'expense', 'Supplier', v_amount, v_note,
      v_supplier_id, v_user_id, v_batch_id, v_line_number
    ) returning id into v_transaction_id;

    insert into public.real_import_batch_rows (
      batch_id, line_number, source_line_number, source_type, raw_line,
      kitchen_id, kitchen_name, supplier_id, amount, note, disposition, transaction_id
    ) values (
      v_batch_id, v_line_number, v_line_number, v_source_type,
      v_db_kitchen_name || ' | ' || v_note || ' | ' || v_amount,
      v_kitchen_id, v_db_kitchen_name, v_supplier_id, v_amount, v_note, 'imported', v_transaction_id
    );

    v_inserted_count := v_inserted_count + 1;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update public.real_import_batches set imported_count = v_inserted_count,
    imported_total_amount = v_total_amount where id = v_batch_id;
  return jsonb_build_object('batch_id', v_batch_id, 'inserted_count', v_inserted_count, 'total_amount', v_total_amount);
end;
$function$;

drop function if exists public.update_koperasi_real_transaction(uuid, bigint, text);
create or replace function public.update_koperasi_real_transaction(
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
  v_note text;
  v_kitchen_name text;
begin
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_user_id is null or v_role <> 'koperasi' then
    raise exception using errcode = '42501', message = 'Akses hanya untuk akun Koperasi.';
  end if;
  if p_transaction_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'ID transaksi dan nominal positif wajib diisi.';
  end if;

  select t.real_import_batch_id, t.real_import_line_number, r.note, r.kitchen_name
    into v_batch_id, v_line_number, v_note, v_kitchen_name
  from public.transactions t
  join public.real_import_batches b on b.id = t.real_import_batch_id
  join public.real_import_batch_rows r on r.transaction_id = t.id and r.batch_id = b.id
  where t.id = p_transaction_id and t.created_by = v_user_id
    and t.flow_type = 'expense' and t.category = 'Supplier'
    and b.source_type = 'koperasi' and b.created_by = v_user_id
    and r.disposition = 'imported';
  if v_batch_id is null then
    raise exception using errcode = '42501',
      message = 'Transaksi ini bukan transaksi Belanja Harian aktif milik akun Koperasi Anda.';
  end if;

  if exists (
    select 1 from public.real_import_batch_rows r
    join public.real_import_batches b on b.id = r.batch_id
    where b.transaction_date = (select transaction_date from public.transactions where id = p_transaction_id)
      and r.kitchen_id = (select kitchen_id from public.transactions where id = p_transaction_id)
      and r.supplier_id = (select supplier_id from public.transactions where id = p_transaction_id)
      and r.note = v_note and r.amount = p_amount and r.disposition = 'imported'
      and r.transaction_id <> p_transaction_id
  ) then
    raise exception 'Nominal yang sama untuk dapur dan asal koperasi ini sudah tercatat pada tanggal tersebut.';
  end if;

  update public.transactions set amount = p_amount where id = p_transaction_id;
  update public.real_import_batch_rows set amount = p_amount,
    raw_line = v_kitchen_name || ' | ' || v_note || ' | ' || p_amount
  where transaction_id = p_transaction_id and batch_id = v_batch_id and line_number = v_line_number;
  update public.real_import_batches b set imported_total_amount = coalesce((
    select sum(r.amount) from public.real_import_batch_rows r
    where r.batch_id = v_batch_id and r.disposition = 'imported'
  ), 0) where b.id = v_batch_id;
  return jsonb_build_object('updated', true, 'transaction_id', p_transaction_id);
end;
$function$;

create or replace function public.delete_koperasi_real_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
begin
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_user_id is null or v_role <> 'koperasi' then
    raise exception using errcode = '42501', message = 'Akses hanya untuk akun Koperasi.';
  end if;
  if p_transaction_id is null then raise exception 'ID transaksi wajib diisi.'; end if;

  select b.id into v_batch_id
  from public.transactions t
  join public.real_import_batches b on b.id = t.real_import_batch_id
  join public.real_import_batch_rows r on r.transaction_id = t.id and r.batch_id = b.id
  where t.id = p_transaction_id and t.created_by = v_user_id
    and t.flow_type = 'expense' and t.category = 'Supplier'
    and b.source_type = 'koperasi' and b.created_by = v_user_id
    and r.disposition = 'imported'
  for update of b, t, r;
  if v_batch_id is null then
    raise exception using errcode = '42501',
      message = 'Transaksi ini bukan transaksi aktif milik akun Koperasi Anda.';
  end if;

  update public.real_import_batch_rows set disposition = 'excluded', transaction_id = null
  where transaction_id = p_transaction_id and batch_id = v_batch_id;
  delete from public.transactions where id = p_transaction_id;

  update public.real_import_batches b set
    imported_count = (select count(*) from public.real_import_batch_rows r
      where r.batch_id = v_batch_id and r.disposition = 'imported'),
    imported_total_amount = coalesce((select sum(r.amount) from public.real_import_batch_rows r
      where r.batch_id = v_batch_id and r.disposition = 'imported'), 0)
  where b.id = v_batch_id;
  return jsonb_build_object('deleted', true, 'transaction_id', p_transaction_id, 'batch_id', v_batch_id);
end;
$function$;

revoke all on function public.update_koperasi_real_transaction(uuid, bigint) from public;
grant execute on function public.update_koperasi_real_transaction(uuid, bigint) to authenticated;
revoke all on function public.delete_koperasi_real_transaction(uuid) from public;
grant execute on function public.delete_koperasi_real_transaction(uuid) to authenticated;
