-- Remove the manual approval checkbox from Dashboard > Status Pencairan.
-- Transaction presence and category flags remain available to the dashboard.

drop function if exists public.get_dashboard_daily_status(date);
drop function if exists public.set_kitchen_disbursement_status(uuid, date, boolean);
drop function if exists public.set_transaction_disbursed(uuid, boolean);

drop table if exists public.kitchen_disbursement_statuses;

alter table public.transactions
  drop column if exists is_disbursed;

create function public.get_dashboard_daily_status(
  p_selected_date date
)
returns table(
  kitchen_id uuid,
  kitchen_name text,
  income boolean,
  expense boolean,
  gas boolean,
  operational boolean,
  real_operational boolean
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
  coalesce(tf.real_operational, false) as real_operational
from public.kitchens k
left join transaction_flags tf
  on tf.kitchen_id = k.id
where k.is_active = true
order by k.name;
$function$;

comment on function public.get_dashboard_daily_status(date) is
  'Returns transaction-presence flags per active kitchen for the selected date.';

revoke all on function public.get_dashboard_daily_status(date) from public;
revoke all on function public.get_dashboard_daily_status(date) from anon;
grant execute on function public.get_dashboard_daily_status(date) to authenticated;
