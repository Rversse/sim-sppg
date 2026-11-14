-- Store the editable salary allocation split independently for each kitchen.
create table if not exists public.kitchen_salary_allocations (
  kitchen_id uuid primary key references public.kitchens(id) on delete cascade,
  accountant_percent numeric(5,2) not null default 25.00,
  nutritionist_percent numeric(5,2) not null default 25.00,
  aslap_percent numeric(5,2) not null default 25.00,
  head_percent numeric(5,2) not null default 25.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kitchen_salary_allocations_percent_range_check check (
    accountant_percent between 0 and 100
    and nutritionist_percent between 0 and 100
    and aslap_percent between 0 and 100
    and head_percent between 0 and 100
  ),
  constraint kitchen_salary_allocations_percent_total_check check (
    accountant_percent + nutritionist_percent + aslap_percent + head_percent = 100
  )
);

alter table public.kitchen_salary_allocations enable row level security;

drop policy if exists kitchen_salary_allocations_admin_all
  on public.kitchen_salary_allocations;

create policy kitchen_salary_allocations_admin_all
  on public.kitchen_salary_allocations
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

revoke all privileges on table public.kitchen_salary_allocations from anon;
grant select, insert, update, delete
  on table public.kitchen_salary_allocations
  to authenticated;
