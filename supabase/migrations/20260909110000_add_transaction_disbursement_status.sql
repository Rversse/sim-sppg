-- Track whether a dashboard transaction has been approved/disbursed.
-- Transactions dated before 2026-09-09 are treated as already disbursed by the UI/service rule.

alter table public.transactions
  add column if not exists is_disbursed boolean not null default false;

create or replace function public.set_transaction_disbursed(
  p_transaction_id uuid,
  p_is_disbursed boolean
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions;
begin
  if auth.uid() is null then
    raise exception 'User tidak terautentikasi';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Hanya admin yang dapat mengubah status pencairan';
  end if;

  update public.transactions
  set is_disbursed = coalesce(p_is_disbursed, false)
  where id = p_transaction_id
  returning * into v_transaction;

  if not found then
    raise exception 'Transaksi tidak ditemukan';
  end if;

  return v_transaction;
end;
$$;

revoke all on function public.set_transaction_disbursed(uuid, boolean) from public;
revoke all on function public.set_transaction_disbursed(uuid, boolean) from anon;
grant execute on function public.set_transaction_disbursed(uuid, boolean) to authenticated;
