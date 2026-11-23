-- Include the realization category so the UI can split RAB and OPS panels.

drop function if exists public.get_koperasi_real_history(date, uuid);

create function public.get_koperasi_real_history(
  p_transaction_date date,
  p_supplier_id uuid
)
returns table (
  id uuid,
  transaction_date date,
  kitchen_id uuid,
  amount bigint,
  note text,
  real_import_batch_id uuid,
  kitchen_name text,
  created_by uuid,
  creator_role text,
  category text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_user_id is null or v_role is distinct from 'koperasi' then
    raise exception using errcode = '42501',
      message = 'Akses hanya untuk akun Koperasi.';
  end if;

  if p_transaction_date is null then
    raise exception 'Tanggal riwayat wajib diisi.';
  end if;

  return query
  select
    t.id,
    t.transaction_date,
    t.kitchen_id,
    t.amount,
    t.note,
    t.real_import_batch_id,
    k.name as kitchen_name,
    t.created_by,
    creator.role as creator_role,
    t.category
  from public.transactions t
  join public.kitchens k on k.id = t.kitchen_id
  join public.profiles creator on creator.id = t.created_by
  where t.transaction_date = p_transaction_date
    and t.flow_type = 'expense'
    and creator.role in ('admin', 'koperasi')
    and (
      (
        t.category = 'Supplier'
        and p_supplier_id is not null
        and t.supplier_id = p_supplier_id
      )
      or (
        t.category = 'OPS'
        and t.account_id is null
        and t.supplier_id is null
      )
    )
  order by k.name, t.created_at, t.id;
end;
$function$;

revoke all on function public.get_koperasi_real_history(date, uuid)
  from public, anon;
grant execute on function public.get_koperasi_real_history(date, uuid)
  to authenticated;

notify pgrst, 'reload schema';
