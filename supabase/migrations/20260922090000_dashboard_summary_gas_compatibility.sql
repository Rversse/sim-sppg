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
  operational_disbursement bigint,
  real_operational bigint
)
language sql
set search_path to 'public', 'pg_temp'
as $function$
select
  coalesce(
    sum(case when t.flow_type = 'income' then t.amount else 0 end),
    0
  )::bigint as income,

  coalesce(
    sum(case when t.flow_type = 'expense' then t.amount else 0 end),
    0
  )::bigint as expense,

  coalesce(
    sum(
      case
        when t.flow_type in ('gas', 'neutral') then t.amount
        else 0
      end
    ),
    0
  )::bigint as gas,

  -- Backward-compatible operational total for the legacy dashboard.
  -- The new app reads operational_disbursement for Pencairan / Ops.
  coalesce(
    sum(
      case
        when t.flow_type in ('neutral', 'ops_disbursement') then t.amount
        else 0
      end
    ),
    0
  )::bigint as operational,

  coalesce(
    sum(
      case
        when t.flow_type = 'ops_disbursement' then t.amount
        else 0
      end
    ),
    0
  )::bigint as operational_disbursement,

  coalesce(
    sum(case when t.flow_type = 'real_ops' then t.amount else 0 end),
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
    or (
      t.flow_type in ('gas', 'neutral')
      and a.id::text = supplier_filter
    )
    or (
      t.flow_type = 'ops_disbursement'
      and t.destination_label = supplier_filter
    )
  );
$function$;