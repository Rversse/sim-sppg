-- Aggregate dashboard status per kitchen in the database.
-- This replaces the client-side scan of every transaction row for a date.

create or replace function public.get_dashboard_daily_status(
  p_selected_date date
)
returns table(
  kitchen_id uuid,
  kitchen_name text,
  income boolean,
  expense boolean,
  gas boolean,
  operational boolean,
  real_operational boolean,
  stored_disbursed boolean
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with transaction_flags as (
  select
    t.kitchen_id,
    coalesce(bool_or(t.flow_type = 'income'), false) as income,
    coalesce(bool_or(t.flow_type = 'expense'), false) as expense,
    coalesce(
      bool_or(t.flow_type in ('gas', 'neutral')),
      false
    ) as gas,
    coalesce(
      bool_or(t.flow_type = 'ops_disbursement'),
      false
    ) as operational,
    coalesce(
      bool_or(t.flow_type = 'real_ops'),
      false
    ) as real_operational
  from public.transactions t
  where t.transaction_date = p_selected_date
  group by t.kitchen_id
)
select
  k.id as kitchen_id,
  k.name as kitchen_name,
  coalesce(tf.income, false) as income,
  coalesce(tf.expense, false) as expense,
  coalesce(tf.gas, false) as gas,
  coalesce(tf.operational, false) as operational,
  coalesce(tf.real_operational, false) as real_operational,
  coalesce(ds.is_disbursed, false) as stored_disbursed
from public.kitchens k
left join transaction_flags tf
  on tf.kitchen_id = k.id
left join public.kitchen_disbursement_statuses ds
  on ds.kitchen_id = k.id
 and ds.status_date = p_selected_date
where k.is_active = true
order by k.name;
$function$;

comment on function public.get_dashboard_daily_status(date) is
  'Returns one aggregated dashboard status row per active kitchen for the selected date.';

revoke all on function public.get_dashboard_daily_status(date) from public;
revoke all on function public.get_dashboard_daily_status(date) from anon;
grant execute on function public.get_dashboard_daily_status(date) to authenticated;
