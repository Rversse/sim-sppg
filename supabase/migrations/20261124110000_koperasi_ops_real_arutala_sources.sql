-- Allow Kertajadi and Cisepat OPS / Real to be split by Arutala source.
-- Each source remains a separate expense+OPS transaction, distinguished by note.

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
 v_user_id uuid:=auth.uid();
 v_role text;
 v_batch_id uuid;
 v_row jsonb;
 v_line_number integer;
 v_kitchen_id uuid;
 v_kitchen_name text;
 v_db_kitchen_name text;
 v_source_type text;
 v_note text;
 v_amount bigint;
 v_transaction_id uuid;
 v_inserted_count integer:=0;
 v_total_amount bigint:=0;
 v_seen_keys text[]:=array[]::text[];
 v_row_key text;
 v_is_special boolean;
begin
 select p.role into v_role from public.profiles p where p.id=v_user_id;
 if v_user_id is null or v_role is distinct from 'koperasi' then
  raise exception using errcode='42501',message='Akses hanya untuk akun Koperasi.';
 end if;

 if p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
  or p_transaction_date is null or nullif(btrim(p_source_text),'') is null
  or p_rows is null or jsonb_typeof(p_rows) is distinct from 'array'
  or jsonb_array_length(p_rows)=0 then
  raise exception 'Tanggal, identitas batch, dan daftar nominal OPS / Real wajib valid.';
 end if;

 perform pg_advisory_xact_lock(hashtext('koperasi_ops_real:'||v_user_id::text||':'||
  p_transaction_date::text||':'||p_content_hash)::bigint);

 if exists(select 1 from public.real_import_batches b
  where b.source_type='koperasi_ops_real' and b.content_hash=p_content_hash) then
  raise exception 'Pengiriman data OPS / Real yang sama sudah pernah disimpan.';
 end if;

 insert into public.real_import_batches(source_type,content_hash,transaction_date,source_text,created_by)
 values('koperasi_ops_real',p_content_hash,p_transaction_date,p_source_text,v_user_id)
 returning id into v_batch_id;

 for v_row in select value from jsonb_array_elements(p_rows) as t(value) loop
  v_line_number:=nullif(v_row->>'line_number','')::integer;
  v_kitchen_id:=nullif(v_row->>'kitchen_id','')::uuid;
  v_kitchen_name:=btrim(coalesce(v_row->>'kitchen_name',''));
  v_source_type:=coalesce(nullif(v_row->>'source_type',''),'umum');
  v_amount:=nullif(v_row->>'amount','')::bigint;

  if v_line_number is null or v_line_number<1 or v_kitchen_id is null
   or v_kitchen_name='' or v_amount is null or v_amount<=0
   or v_source_type not in ('umum','cianjur','cidaun') then
   raise exception 'Dapur, asal koperasi, atau nominal OPS / Real pada baris % tidak valid.',coalesce(v_line_number,0);
  end if;

  select k.name into v_db_kitchen_name from public.kitchens k
  where k.id=v_kitchen_id and k.is_active;

  if v_db_kitchen_name is null or lower(btrim(v_db_kitchen_name))<>lower(btrim(v_kitchen_name)) then
   raise exception 'Dapur pada baris % tidak cocok dengan data dapur aktif.',v_line_number;
  end if;

  v_is_special:=lower(btrim(v_db_kitchen_name)) in ('cisepat','kertajadi');

  if v_is_special and v_source_type='umum' then
   raise exception 'Asal Arutala wajib dipilih untuk dapur %.',v_db_kitchen_name;
  end if;
  if not v_is_special and v_source_type<>'umum' then
   raise exception 'Asal khusus hanya berlaku untuk Cisepat dan Kertajadi.';
  end if;

  v_row_key:=v_kitchen_id::text||':'||v_source_type;
  if v_row_key=any(v_seen_keys) then
   raise exception 'Asal koperasi yang sama muncul lebih dari sekali untuk dapur %.',v_db_kitchen_name;
  end if;
  v_seen_keys:=array_append(v_seen_keys,v_row_key);

  v_note:=case
   when v_source_type='cianjur' then 'Arutala Cianjur'
   when v_source_type='cidaun' then 'Arutala Cidaun'
   else 'OPS / Real'
  end;

  -- Existing transactions from an earlier batch still block duplicate entry.
  -- Rows already inserted by this same batch are allowed for the other source.
  if exists(select 1 from public.transactions t
   where t.transaction_date=p_transaction_date and t.kitchen_id=v_kitchen_id
    and t.flow_type='expense' and t.category='OPS'
    and t.real_import_batch_id is distinct from v_batch_id) then
   raise exception 'OPS / Real untuk dapur % sudah tercatat pada tanggal ini. Periksa transaksi yang ada agar laporan tidak terhitung dua kali.',v_db_kitchen_name;
  end if;

  insert into public.transactions(transaction_date,kitchen_id,flow_type,category,account_id,supplier_id,
    amount,note,created_by,real_import_batch_id,real_import_line_number)
  values(p_transaction_date,v_kitchen_id,'expense','OPS',null,null,v_amount,v_note,
    v_user_id,v_batch_id,v_line_number) returning id into v_transaction_id;

  insert into public.koperasi_ops_real_batch_rows(batch_id,line_number,kitchen_id,kitchen_name,amount,note,disposition,transaction_id)
  values(v_batch_id,v_line_number,v_kitchen_id,v_db_kitchen_name,v_amount,v_note,'imported',v_transaction_id);

  v_inserted_count:=v_inserted_count+1;
  v_total_amount:=v_total_amount+v_amount;
 end loop;

 update public.real_import_batches set imported_count=v_inserted_count,imported_total_amount=v_total_amount
 where id=v_batch_id;

 return jsonb_build_object('batch_id',v_batch_id,'inserted_count',v_inserted_count,'total_amount',v_total_amount);
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
 v_user_id uuid:=auth.uid();
 v_role text;
 v_batch_id uuid;
 v_line_number integer;
 v_transaction_date date;
 v_kitchen_id uuid;
 v_kitchen_name text;
 v_note text;
begin
 select p.role into v_role from public.profiles p where p.id=v_user_id;
 if v_user_id is null or v_role is distinct from 'koperasi' then
  raise exception using errcode='42501',message='Akses hanya untuk akun Koperasi.';
 end if;
 if p_transaction_id is null or p_amount is null or p_amount<=0 then
  raise exception 'ID transaksi dan nominal OPS / Real positif wajib diisi.';
 end if;

 select t.real_import_batch_id,t.real_import_line_number,t.transaction_date,t.kitchen_id,
  r.kitchen_name,r.note
 into v_batch_id,v_line_number,v_transaction_date,v_kitchen_id,v_kitchen_name,v_note
 from public.transactions t
 join public.real_import_batches b on b.id=t.real_import_batch_id
 join public.koperasi_ops_real_batch_rows r on r.transaction_id=t.id and r.batch_id=b.id
 where t.id=p_transaction_id and t.created_by=v_user_id and t.flow_type='expense' and t.category='OPS'
  and b.source_type='koperasi_ops_real' and b.created_by=v_user_id and r.disposition='imported'
 for update of t,b,r;

 if v_batch_id is null then
  raise exception using errcode='42501',message='Transaksi OPS / Real ini bukan milik akun Koperasi Anda.';
 end if;

 if exists(select 1 from public.transactions t where t.id<>p_transaction_id
  and t.transaction_date=v_transaction_date and t.kitchen_id=v_kitchen_id
  and t.flow_type='expense' and t.category='OPS'
  and t.real_import_batch_id is distinct from v_batch_id) then
  raise exception 'Ada transaksi OPS / Real lain untuk dapur % pada tanggal tersebut. Periksa agar tidak terjadi pencatatan ganda.',v_kitchen_name;
 end if;

 update public.transactions set amount=p_amount,note=v_note where id=p_transaction_id;
 update public.koperasi_ops_real_batch_rows set amount=p_amount
 where transaction_id=p_transaction_id and batch_id=v_batch_id
  and line_number=v_line_number and disposition='imported';

 update public.real_import_batches b set imported_total_amount=coalesce((
  select sum(r.amount) from public.koperasi_ops_real_batch_rows r
  where r.batch_id=v_batch_id and r.disposition='imported'
 ),0) where b.id=v_batch_id;

 return jsonb_build_object('updated',true,'transaction_id',p_transaction_id,'batch_id',v_batch_id);
end;
$function$;

notify pgrst, 'reload schema';
