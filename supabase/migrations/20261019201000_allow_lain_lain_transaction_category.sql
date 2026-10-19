-- Allow the Maker Lain-lain category stored by the neutral flow.
-- Keep all existing transaction categories unchanged.
alter table public.transactions
  drop constraint if exists transactions_category_check;

alter table public.transactions
  add constraint transactions_category_check
  check (
    category = any (array[
      'RAB'::text,
      'Supplier'::text,
      'KPWS'::text,
      'OPS'::text,
      'GAS'::text,
      'REAL_OPS'::text,
      'SEWA_SPPG'::text,
      'OPERATIONAL'::text,
      'LAIN_LAIN'::text
    ])
  );
