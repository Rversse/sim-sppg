-- Accountant assignment history.
-- Active assignment lives in public.accountant_profiles.
-- Deleting an active assignment automatically snapshots the assignment here.
-- This preserves the old accountant identity without storing passwords.

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

  assigned_at timestamptz not null,
  ended_at timestamptz not null default now(),
  end_reason text not null default 'Resign',
  created_at timestamptz not null default now(),

  constraint accountant_assignment_history_period_check
    check (ended_at >= assigned_at)
);

create index if not exists idx_accountant_assignment_history_user
  on public.accountant_assignment_history(user_id, assigned_at desc);

create index if not exists idx_accountant_assignment_history_kitchen
  on public.accountant_assignment_history(kitchen_id, assigned_at desc);

alter table public.accountant_assignment_history enable row level security;

drop policy if exists "accountant_assignment_history admin select"
  on public.accountant_assignment_history;

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

create or replace function public.record_accountant_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_email text;
  v_kitchen_name text;
  v_account_id uuid;
  v_account_name text;
  v_account_bank text;
  v_account_number text;
begin
  select
    au.raw_user_meta_data ->> 'full_name',
    au.email
  into v_name, v_email
  from auth.users au
  where au.id = old.user_id;

  select k.name
  into v_kitchen_name
  from public.kitchens k
  where k.id = old.kitchen_id;

  select
    kar.account_id,
    a.name,
    a.bank,
    a.account_number
  into
    v_account_id,
    v_account_name,
    v_account_bank,
    v_account_number
  from public.kitchen_account_rules kar
  left join public.accounts a on a.id = kar.account_id
  where kar.kitchen_id = old.kitchen_id
    and kar.flow_type = 'operational'
  limit 1;

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
  values (
    old.user_id,
    old.kitchen_id,
    v_account_id,
    coalesce(
      nullif(trim(v_name), ''),
      split_part(coalesce(v_email, ''), '@', 1),
      'Akuntan'
    ),
    coalesce(v_email, ''),
    coalesce(v_kitchen_name, 'Dapur'),
    v_account_name,
    v_account_bank,
    v_account_number,
    old.created_at,
    now(),
    'Resign'
  );

  return old;
end;
$$;

drop trigger if exists trg_record_accountant_assignment_history
  on public.accountant_profiles;

create trigger trg_record_accountant_assignment_history
before delete on public.accountant_profiles
for each row
execute function public.record_accountant_assignment_history();

revoke all on function public.record_accountant_assignment_history()
  from public, anon, authenticated;

grant execute on function public.record_accountant_assignment_history()
  to service_role;
