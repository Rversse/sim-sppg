-- SIM SPPG: operational destination support
-- Adds a temporary destination label for Pencairan / Ops rows whose real
-- accountant/bank account is not yet mapped. Real / Ops remains non-bank.

alter table public.transactions
  add column if not exists destination_label text;

comment on column public.transactions.destination_label is
  'Temporary/non-bank operational destination label used when Pencairan / Ops does not yet have an account mapping.';

create index if not exists transactions_operational_destination_idx
  on public.transactions (transaction_date, kitchen_id, flow_type, destination_label);
