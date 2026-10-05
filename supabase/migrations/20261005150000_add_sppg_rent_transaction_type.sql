alter table public.transactions
  drop constraint if exists transactions_flow_type_check;

alter table public.transactions
  add constraint transactions_flow_type_check
  check (
    flow_type = any (
      array[
        'income'::text,
        'expense'::text,
        'neutral'::text,
        'ops_disbursement'::text,
        'real_ops'::text,
        'sppg_rent'::text
      ]
    )
  );

alter table public.transactions
  drop constraint if exists transactions_category_check;

alter table public.transactions
  add constraint transactions_category_check
  check (
    category = any (
      array[
        'RAB'::text,
        'Supplier'::text,
        'KPWS'::text,
        'OPS'::text,
        'GAS'::text,
        'REAL_OPS'::text,
        'SEWA_SPPG'::text
      ]
    )
  );
