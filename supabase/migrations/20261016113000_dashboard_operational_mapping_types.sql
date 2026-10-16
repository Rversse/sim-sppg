-- Return only active operational mapping types for dashboard status icons.
-- Do not expose recipient names, bank names, or account numbers to Operators.
create or replace function public.get_dashboard_operational_mapping_types()
returns table(kitchen_id uuid, rule_type text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select distinct r.kitchen_id, r.rule_type
  from public.kitchen_operational_account_rules r
  where r.is_active
    and r.mapping_status = 'active'
    and r.rule_type in (
      'ops_harian',
      'sppg_rent',
      'gaji_relawan',
      'pic_incentive_school',
      'pic_incentive_posyandu',
      'vehicle_rent'
    )
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'operator')
    );
$function$;

revoke all on function public.get_dashboard_operational_mapping_types() from public, anon;
grant execute on function public.get_dashboard_operational_mapping_types() to authenticated;
