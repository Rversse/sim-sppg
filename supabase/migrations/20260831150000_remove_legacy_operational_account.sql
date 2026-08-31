-- Remove the last operational-account configuration left by the retired
-- Accountant / Disbursement Maker feature.

do $$
declare
  v_account_id uuid;
begin
  select a.id
  into v_account_id
  from public.accounts a
  where a.name = 'Pemilik Rekening 3'
    and a.bank = 'BCA'
    and a.account_number = '13572468'
    and a.account_category = 'operational'
    and not exists (
      select 1
      from public.bank_transactions bt
      where bt.account_id = a.id
         or bt.recipient_account_id = a.id
    )
    and not exists (
      select 1
      from public.transactions t
      where t.account_id = a.id
    );

  if v_account_id is null then
    return;
  end if;

  -- Remove the retired operational assignment first.
  delete from public.kitchen_account_rules
  where account_id = v_account_id
    and flow_type = 'operational';

  -- Remove the legacy operational account itself.
  delete from public.accounts
  where id = v_account_id
    and account_category = 'operational';
end;
$$;