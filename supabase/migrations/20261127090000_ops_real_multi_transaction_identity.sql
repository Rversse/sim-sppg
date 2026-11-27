-- Allow multiple OPS - Pencairan Real records per kitchen/date.
-- A duplicate is only the same date, kitchen, amount, and normalized note.
drop index if exists public.transactions_ops_real_kitchen_date_unique;

create unique index if not exists transactions_ops_real_identity_unique
  on public.transactions (
    kitchen_id,
    transaction_date,
    amount,
    lower(btrim(coalesce(note, '')))
  )
  where flow_type = 'ops_disbursement_real' and category = 'OPS';

notify pgrst, 'reload schema';
