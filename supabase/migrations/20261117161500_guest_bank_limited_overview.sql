alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array['admin', 'operator', 'viewer', 'guest', 'koperasi']::text[]));

update public.profiles
set role = 'guest'
where lower(username) = 'guest';

create or replace function public.get_guest_bank_overview(
  p_start_date date,
  p_today date,
  p_income_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_role text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select p.role
    into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is distinct from 'guest' then
    raise exception using errcode = '42501', message = 'Guest role required';
  end if;

  with account_metrics as (
    select
      a.id,
      a.name,
      a.bank,
      a.account_number,
      a.opening_balance,
      a.account_category,
      a.is_holding_destination,
      a.supplier_id,
      s.business_name,
      s.owner_name,
      coalesce((
        select sum(t.amount)
        from public.transactions t
        where t.account_id = a.id
          and t.flow_type in ('income', 'gas', 'neutral')
          and t.transaction_date >= p_start_date
          and t.transaction_date <= p_income_end_date
      ), 0)::numeric as disbursement_income,
      coalesce((
        select sum(bt.transfer_amount)
        from public.bank_transactions bt
        where bt.recipient_account_id = a.id
          and bt.transaction_date >= p_start_date
          and bt.transaction_date <= p_today
      ), 0)::numeric as transfer_income,
      coalesce((
        select sum(bt.transfer_amount + coalesce(bt.admin_fee, 0))
        from public.bank_transactions bt
        where bt.account_id = a.id
          and bt.transaction_date >= p_start_date
          and bt.transaction_date <= p_today
      ), 0)::numeric as transfer_expense
    from public.accounts a
    left join public.income_suppliers s on s.id = a.supplier_id
  ),
  all_summaries as (
    select
      *,
      coalesce(opening_balance, 0)
        + disbursement_income
        + transfer_income
        - transfer_expense as balance
    from account_metrics
  ),
  visible_summaries as (
    select
      *,
      jsonb_build_object(
        'id', id,
        'name', name,
        'bank', bank,
        'account_number',
          nullif(right(regexp_replace(coalesce(account_number, ''), '\D', '', 'g'), 3), ''),
        'opening_balance', coalesce(opening_balance, 0),
        'account_category', account_category,
        'is_holding_destination', coalesce(is_holding_destination, false),
        'income_suppliers',
          case
            when supplier_id is null then null
            else jsonb_build_object(
              'business_name', business_name,
              'owner_name', owner_name
            )
          end
      ) as account_json
    from all_summaries
    where coalesce(is_holding_destination, false)
       or upper(trim(coalesce(owner_name, ''))) in (
         'DEDE JAELANI',
         'AYI SUHERLAN',
         'TAUFIK SUKALARANG'
       )
  )
  select jsonb_build_object(
    'accounts',
      coalesce(
        jsonb_agg(account_json order by bank, account_number),
        '[]'::jsonb
      ),
    'summaries',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'account', account_json,
            'disbursementIncome', disbursement_income,
            'transferIncome', transfer_income,
            'transferExpense', transfer_expense,
            'balance', balance
          )
          order by bank, account_number
        ),
        '[]'::jsonb
      ),
    'totals',
      (
        select jsonb_build_object(
          'balance', coalesce(sum(balance), 0),
          'disbursementIncome', coalesce(sum(disbursement_income), 0),
          'transferIncome', coalesce(sum(transfer_income), 0),
          'transferExpense', coalesce(sum(transfer_expense), 0)
        )
        from all_summaries
      )
  )
  into v_result
  from visible_summaries;

  return v_result;
end;
$function$;

revoke all on function public.get_guest_bank_overview(date, date, date) from public, anon, authenticated;
grant execute on function public.get_guest_bank_overview(date, date, date) to authenticated;
