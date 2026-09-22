-- Split GAS from the operational disbursement flow while keeping
-- legacy neutral rows readable during rollout.

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
        'gas'::text,
        'ops_disbursement'::text,
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
        'GAS'::text,
        'REAL_OPS'::text
      ]
    )
  );

alter table public.transactions
  add column if not exists destination_label text null;

comment on column public.transactions.destination_label is
  'Operational destination label for non-bank operational disbursements.';

-- The old neutral mapping is the original GAS mapping. Keep the old
-- neutral rows intact for compatibility while exposing the same mappings
-- under the new gas flow.
insert into public.kitchen_account_rules (kitchen_id, account_id, flow_type)
select
  source.kitchen_id,
  source.account_id,
  'gas'
from public.kitchen_account_rules source
where source.flow_type = 'neutral'
  and not exists (
    select 1
    from public.kitchen_account_rules existing
    where existing.kitchen_id = source.kitchen_id
      and existing.account_id = source.account_id
      and existing.flow_type = 'gas'
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
  gas bigint,
  operational bigint,
  real_operational bigint
)
language sql
set search_path to 'public', 'pg_temp'
as $function$
select
  coalesce(sum(case when t.flow_type = 'income' then t.amount else 0 end), 0)::bigint as income,
  coalesce(sum(case when t.flow_type = 'expense' then t.amount else 0 end), 0)::bigint as expense,
  coalesce(
    sum(
      case
        when t.flow_type in ('gas', 'neutral') then t.amount
        else 0
      end
    ),
    0
  )::bigint as gas,
  coalesce(
    sum(
      case
        when t.flow_type = 'ops_disbursement' then t.amount
        else 0
      end
    ),
    0
  )::bigint as operational,
  coalesce(
    sum(
      case
        when t.flow_type = 'real_ops' then t.amount
        else 0
      end
    ),
    0
  )::bigint as real_operational
from public.transactions t
left join public.accounts a on a.id = t.account_id
left join public.suppliers s on s.id = t.supplier_id
where t.transaction_date between start_date and end_date
  and (kitchen_uuid is null or t.kitchen_id = kitchen_uuid)
  and (
    flow_types is null
    or t.flow_type = any(flow_types)
    or ('gas' = any(flow_types) and t.flow_type = 'neutral')
  )
  and (
    supplier_filter is null
    or (t.flow_type = 'income' and a.id::text = supplier_filter)
    or (t.flow_type = 'expense' and s.name = supplier_filter)
    or (t.flow_type in ('gas', 'neutral') and a.id::text = supplier_filter)
    or (
      t.flow_type = 'ops_disbursement'
      and t.destination_label = supplier_filter
    )
  );
$function$;
