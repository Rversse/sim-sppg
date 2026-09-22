-- Add a separate Real / Ops transaction flow.
-- Existing neutral transactions remain Pencairan / Ops.

alter table public.transactions
  drop constraint if exists transactions_flow_type_check;

alter table public.transactions
  add constraint transactions_flow_type_check
  check (
    flow_type = any (
      array[
        'income'::text,
        'expense'::text,
        'neutral'::text,
        'real_ops'::text
      ]
    )
  );

alter table public.transactions
  drop constraint if exists transactions_category_check;

alter table public.transactions
  add constraint transactions_category_check
  check (
    category = any (
      array[
        'RAB'::text,
        'Supplier'::text,
        'KPWS'::text,
        'OPS'::text,
        'REAL_OPS'::text
      ]
    )
  );

drop function if exists public.get_dashboard_summary(date, date, uuid, text[], text);

create function public.get_dashboard_summary(
  start_date date,
  end_date date,
  kitchen_uuid uuid,
  flow_types text[] default null,
  supplier_filter text default null
)
returns table(
  income bigint,
  expense bigint,
  operational bigint,
  real_operational bigint
)
language sql
set search_path = public, pg_temp
as $$
select
  coalesce(sum(case when t.flow_type = 'income' then t.amount else 0 end), 0)::bigint as income,
  coalesce(sum(case when t.flow_type = 'expense' then t.amount else 0 end), 0)::bigint as expense,
  coalesce(sum(case when t.flow_type = 'neutral' then t.amount else 0 end), 0)::bigint as operational,
  coalesce(sum(case when t.flow_type = 'real_ops' then t.amount else 0 end), 0)::bigint as real_operational
from public.transactions t
left join public.accounts a on a.id = t.account_id
left join public.suppliers s on s.id = t.supplier_id
where t.transaction_date between start_date and end_date
  and (kitchen_uuid is null or t.kitchen_id = kitchen_uuid)
  and (flow_types is null or t.flow_type = any(flow_types))
  and (
    supplier_filter is null
    or (t.flow_type = 'income' and a.id::text = supplier_filter)
    or (t.flow_type = 'expense' and s.name = supplier_filter)
    or (t.flow_type in ('neutral', 'real_ops') and a.id::text = supplier_filter)
  );
$$;

revoke all on function public.get_dashboard_summary(date, date, uuid, text[], text) from public;
grant execute on function public.get_dashboard_summary(date, date, uuid, text[], text) to authenticated;
grant execute on function public.get_dashboard_summary(date, date, uuid, text[], text) to service_role;
