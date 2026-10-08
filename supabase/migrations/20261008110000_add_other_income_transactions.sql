-- Transfer Lainnya is an independent incoming transaction source.
-- It is deliberately separate from public.transactions because it does not belong
-- to a kitchen or to the existing RAB/OPS/GAS transaction flows.

create table if not exists public.other_income_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  account_id uuid not null references public.accounts(id) on delete restrict,
  amount bigint not null check (amount > 0),
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now()
);

create index if not exists other_income_transactions_date_idx
  on public.other_income_transactions (transaction_date desc, created_at desc);

create index if not exists other_income_transactions_account_idx
  on public.other_income_transactions (account_id, transaction_date desc, created_at desc);

alter table public.other_income_transactions enable row level security;

drop policy if exists "other income select" on public.other_income_transactions;
create policy "other income select"
on public.other_income_transactions
for select
to authenticated
using (true);

drop policy if exists "other income admin insert" on public.other_income_transactions;
create policy "other income admin insert"
on public.other_income_transactions
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

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'other_income_transactions'
  ) then
    alter publication supabase_realtime
      add table public.other_income_transactions;
  end if;
end;
$$;

comment on table public.other_income_transactions is
  'Admin-only incoming transactions that go directly to a bank account and are not tied to a kitchen or existing transaction flow.';
