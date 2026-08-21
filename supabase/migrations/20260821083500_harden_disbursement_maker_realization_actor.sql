-- Prevent the client from supplying a different actor UUID during Maker realization.
-- Keep the function invoker-based so transactions RLS remains authoritative.
-- Pin the function search_path and fully qualify database objects.

create or replace function public.realize_disbursement_maker(
  p_transaction_date date,
  p_kitchen_id uuid,
  p_user_id uuid
)
returns table (
  maker_item_id uuid,
  transaction_id uuid
)
language plpgsql
set search_path = ''
as $$
declare
  v_item record;
  v_transaction_id uuid;
  v_pending_count integer;
  v_processed_count integer;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'User tidak terautentikasi';
  end if;

  if p_user_id is null or p_user_id <> v_actor_id then
    raise exception 'User tidak valid';
  end if;

  if p_transaction_date is null then
    raise exception 'Tanggal wajib diisi';
  end if;

  if p_kitchen_id is null then
    raise exception 'Dapur wajib dipilih';
  end if;

  select count(*)
  into v_pending_count
  from public.disbursement_maker_items
  where transaction_date = p_transaction_date
    and kitchen_id = p_kitchen_id
    and status <> 'REALIZED';

  if v_pending_count = 0 then
    raise exception 'Tidak ada pencairan Maker yang belum direalisasikan untuk tanggal dan dapur yang dipilih';
  end if;

  select count(*)
  into v_processed_count
  from public.disbursement_maker_items
  where transaction_date = p_transaction_date
    and kitchen_id = p_kitchen_id
    and status = 'PROCESSED';

  if v_processed_count <> v_pending_count then
    raise exception 'Semua pencairan yang belum direalisasikan harus berstatus PROCESSED sebelum direalisasikan';
  end if;

  for v_item in
    select
      id,
      transaction_date,
      kitchen_id,
      account_id,
      amount,
      flow_type
    from public.disbursement_maker_items
    where transaction_date = p_transaction_date
      and kitchen_id = p_kitchen_id
      and status = 'PROCESSED'
    order by created_at asc, id asc
    for update
  loop
    insert into public.transactions (
      transaction_date,
      kitchen_id,
      flow_type,
      category,
      account_id,
      supplier_id,
      amount,
      note,
      created_by
    )
    values (
      v_item.transaction_date,
      v_item.kitchen_id,
      v_item.flow_type,
      case
        when v_item.flow_type = 'income' then 'RAB'
        when v_item.flow_type = 'neutral' then 'OPS'
        else null
      end,
      v_item.account_id,
      null,
      v_item.amount,
      null,
      v_actor_id
    )
    returning id into v_transaction_id;

    update public.disbursement_maker_items
    set
      status = 'REALIZED',
      realized_transaction_id = v_transaction_id,
      updated_by = v_actor_id,
      updated_at = now()
    where id = v_item.id;

    maker_item_id := v_item.id;
    transaction_id := v_transaction_id;
    return next;
  end loop;
end;
$$;