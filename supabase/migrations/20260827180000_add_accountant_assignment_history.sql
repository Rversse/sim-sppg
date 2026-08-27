-- Persist accountant assignment periods for audit and staff changes.
-- This does not alter existing application columns or transaction data.

create table if not exists public.accountant_assignment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  kitchen_id uuid not null references public.kitchens(id) on delete restrict,
  operational_account_id uuid null references public.accounts(id) on delete restrict,
  accountant_name text not null,
  accountant_email text not null,
  kitchen_name text not null,
  operational_account_name text null,
  operational_bank text null,
  operational_account_number text null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz null,
  end_reason text null,
  created_at timestamptz not null default now(),
  constraint accountant_assignment_history_end_check
    check (ended_at is null or ended_at >= assigned_at),
  constraint accountant_assignment_history_reason_check
    check (ended_at is not null or end_reason is null)
);

create index if not exists idx_accountant_assignment_history_user
  on public.accountant_assignment_history(user_id, assigned_at desc);

create index if not exists idx_accountant_assignment_history_kitchen
  on public.accountant_assignment_history(kitchen_id, assigned_at desc);

create unique index if not exists uq_accountant_assignment_history_active_user
  on public.accountant_assignment_history(user_id)
  where ended_at is null;

create unique index if not exists uq_accountant_assignment_history_active_kitchen
  on public.accountant_assignment_history(kitchen_id)
  where ended_at is null;

alter table public.accountant_assignment_history enable row level security;

drop policy if exists "accountant_assignment_history admin select" on public.accountant_assignment_history;
create policy "accountant_assignment_history admin select"
on public.accountant_assignment_history
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

create or replace function public.admin_deactivate_accountant(
  p_user_id uuid,
  p_admin_id uuid,
  p_reason text default 'Resign'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kitchen_id uuid;
  v_kitchen_name text;
  v_account_id uuid;
  v_account_name text;
  v_account_bank text;
  v_account_number text;
  v_name text;
  v_email text;
  v_existing_history_count integer;
begin
  if p_user_id is null or p_admin_id is null then
    raise exception 'User tidak valid';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_admin_id
      and p.role = 'admin'
  ) then
    raise exception 'Akses admin diperlukan.';
  end if;

  select
    ap.kitchen_id,
    k.name,
    a.id,
    a.name,
    a.bank,
    a.account_number,
    au.raw_user_meta_data ->> 'full_name',
    au.email
  into
    v_kitchen_id,
    v_kitchen_name,
    v_account_id,
    v_account_name,
    v_account_bank,
    v_account_number,
    v_name,
    v_email
  from public.accountant_profiles ap
  join public.kitchens k on k.id = ap.kitchen_id
  left join public.kitchen_account_rules kar
    on kar.kitchen_id = ap.kitchen_id
   and kar.flow_type = 'operational'
  left join public.accounts a on a.id = kar.account_id
  join auth.users au on au.id = ap.user_id
  where ap.user_id = p_user_id;

  if v_kitchen_id is null then
    raise exception 'Akun tersebut tidak memiliki assignment aktif.';
  end if;

  select count(*)
    into v_existing_history_count
  from public.accountant_assignment_history h
  where h.user_id = p_user_id
    and h.ended_at is null;

  if v_existing_history_count > 0 then
    raise exception 'Assignment history aktif sudah ada untuk akun tersebut.';
  end if;

  insert into public.accountant_assignment_history (
    user_id,
    kitchen_id,
    operational_account_id,
    accountant_name,
    accountant_email,
    kitchen_name,
    operational_account_name,
    operational_bank,
    operational_account_number,
    assigned_at,
    ended_at,
    end_reason
  )
  select
    p_user_id,
    v_kitchen_id,
    v_account_id,
    coalesce(nullif(trim(v_name), ''), split_part(v_email, '@', 1)),
    v_email,
    v_kitchen_name,
    v_account_name,
    v_account_bank,
    v_account_number,
    ap.created_at,
    now(),
    nullif(trim(coalesce(p_reason, 'Resign')), '')
  from public.accountant_profiles ap
  where ap.user_id = p_user_id;

  delete from public.accountant_profiles
  where user_id = p_user_id;

  if not found then
    raise exception 'Assignment akun tidak ditemukan.';
  end if;
end;
$$;

revoke all on function public.admin_deactivate_accountant(uuid, uuid, text) from public;
revoke all on function public.admin_deactivate_accountant(uuid, uuid, text) from anon;
revoke all on function public.admin_deactivate_accountant(uuid, uuid, text) from authenticated;
grant execute on function public.admin_deactivate_accountant(uuid, uuid, text) to service_role;
