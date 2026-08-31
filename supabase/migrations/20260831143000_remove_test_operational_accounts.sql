-- Remove the three known test operational accounts.
-- Only accounts with no supplier, no transaction history, and no kitchen
-- operational rule are eligible. This keeps the cleanup safe if real accounts
-- are added later with different data.

delete from public.accounts a
where a.account_category = 'operational'
  and a.supplier_id is null
  and (
    (a.name = 'Pemilik Rekening 1 Edit' and a.bank = 'BCA' and a.account_number = '87654321')
    or (a.name = 'Pemilik Rekening 2' and a.bank = 'BNI' and a.account_number = '24681357')
    or (a.name = 'Pemilik Rekening 3' and a.bank = 'BCA' and a.account_number = '13572468')
  )
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
  )
  and not exists (
    select 1
    from public.kitchen_account_rules kar
    where kar.account_id = a.id
  );
