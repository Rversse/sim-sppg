-- Normalize OPS Real notes consistently across SIM-SPPG and Maker.
-- This keeps distinct amounts or notes valid on the same kitchen/date,
-- while treating casing and repeated whitespace as equivalent.
drop index if exists public.transactions_ops_real_identity_unique;

create unique index transactions_ops_real_identity_unique
  on public.transactions (
    kitchen_id,
    transaction_date,
    amount,
    lower(regexp_replace(btrim(coalesce(note, '')), '[[:space:]]+', ' ', 'g'))
  )
  where flow_type = 'ops_disbursement_real' and category = 'OPS';

notify pgrst, 'reload schema';
