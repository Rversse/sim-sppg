-- Disbursement Maker current-state migration snapshot.
--
-- This repository previously did not track the Maker migrations even though
-- production already contains them. This migration is intentionally idempotent
-- so it can be applied to an existing database without altering existing data.
-- It documents the current Maker schema, RLS, atomic realization function, and
-- status hardening in one source-controlled place.

create table if not exists public.disbursement_maker_items (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null,
  transaction_date date not null,
  account_id uuid not null,
  amount bigint not null,
  status text not null default 'READY',
  realized_transaction_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  flow_type text not null default 'income'
);

alter table public.disbursement_maker_items
  add column if not exists flow_type text not null default 'income';

alter table public.disbursement_maker_items
  drop constraint if exists disbursement_maker_items_amount_check;

alter table public.disbursement_maker_items
  add constraint disbursement_maker_items_amount_check
  check (amount > 0);

alter table public.disbursement_maker_items
  drop constraint if exists disbursement_maker_items_status_check;

alter table public.disbursement_maker_items
  add constraint disbursement_maker_items_status_check
  check (status in ('READY', 'PROCESSED', 'REALIZED'));

alter table public.disbursement_maker_items
  drop constraint if exists disbursement_maker_items_flow_type_check;

alter table public.disbursement_maker_items
  add constraint disbursement_maker_items_flow_type_check
  check (flow_type in ('income', 'neutral'));

alter table public.disbursement_maker_items
  drop constraint if exists disbursement_maker_items_kitchen_id_fkey;

alter table public.disbursement_maker_items
  add constraint disbursement_maker_items_kitchen_id_fkey
  foreign key (kitchen_id) references public.kitchens(id);

alter table public.disbursement_maker_items
  drop constraint if exists disbursement_maker_items_account_id_fkey;

alter table public.disbursement_maker_items
  add constraint disbursement_maker_items_account_id_fkey
  foreign key (account_id) references public.accounts(id);

alter table public.disbursement_maker_items
  drop constraint if exists disbursement_maker_items_realized_transaction_id_fkey;

alter table public.disbursement_maker_items
  add constraint disbursement_maker_items_realized_transaction_id_fkey
  foreign key (realized_transaction_id) references public.transactions(id);

create index if not exists idx_disbursement_maker_items_account
  on public.disbursement_maker_items(account_id);

create index if not exists idx_disbursement_maker_items_status
  on public.disbursement_maker_items(status);

create index if not exists idx_disbursement_maker_items_kitchen_flow_date
  on public.disbursement_maker_items(kitchen_id, flow_type, transaction_date);

alter table public.disbursement_maker_items enable row level security;

drop policy if exists "disbursement_maker_items admin select" on public.disbursement_maker_items;
create policy "disbursement_maker_items admin select"
on public.disbursement_maker_items
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "disbursement_maker_items admin insert" on public.disbursement_maker_items;
create policy "disbursement_maker_items admin insert"
on public.disbursement_maker_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "disbursement_maker_items admin update" on public.disbursement_maker_items;
create policy "disbursement_maker_items admin update"
on public.disbursement_maker_items
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "disbursement_maker_items admin delete" on public.disbursement_maker_items;
create policy "disbursement_maker_items admin delete"
on public.disbursement_maker_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

create or replace function public.guard_disbursement_maker_item_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'REALIZED' then
      raise exception 'Maker yang sudah direalisasikan tidak dapat dihapus';
    end if;
    return old;
  end if;

  if old.status = 'REALIZED' then
    raise exception 'Maker yang sudah direalisasikan tidak dapat diubah';
  end if;

  if new.status = 'REALIZED' and new.realized_transaction_id is null then
    raise exception 'Maker REALIZED wajib memiliki realized_transaction_id';
  end if;

  if new.status in ('READY', 'PROCESSED')
     and new.realized_transaction_id is not null then
    raise exception 'Maker READY/PROCESSED tidak boleh memiliki realized_transaction_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_disbursement_maker_item_transition
on public.disbursement_maker_items;

create trigger trg_guard_disbursement_maker_item_transition
before insert or update or delete
on public.disbursement_maker_items
for each row
execute function public.guard_disbursement_maker_item_transition();

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
set search_path = public
as $$
declare
  v_item record;
  v_transaction_id uuid;
  v_pending_count integer;
  v_processed_count integer;
begin
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
      p_user_id
    )
    returning id into v_transaction_id;

    update public.disbursement_maker_items
    set
      status = 'REALIZED',
      realized_transaction_id = v_transaction_id,
      updated_by = p_user_id,
      updated_at = now()
    where id = v_item.id;

    maker_item_id := v_item.id;
    transaction_id := v_transaction_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.realize_disbursement_maker(date, uuid, uuid) from public;
revoke all on function public.realize_disbursement_maker(date, uuid, uuid) from anon;
grant execute on function public.realize_disbursement_maker(date, uuid, uuid) to authenticated;
