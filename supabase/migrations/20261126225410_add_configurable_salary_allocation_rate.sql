-- Add a configurable per-kitchen percentage for the remaining RAB salary allocation.
alter table public.kitchen_salary_allocations
  add column if not exists allocation_rate numeric(5,2) not null default 30.00;

alter table public.kitchen_salary_allocations
  drop constraint if exists kitchen_salary_allocations_allocation_rate_check;

alter table public.kitchen_salary_allocations
  add constraint kitchen_salary_allocations_allocation_rate_check
  check (allocation_rate between 0 and 100);
