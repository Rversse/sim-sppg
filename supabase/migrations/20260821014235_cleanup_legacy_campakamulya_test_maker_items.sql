-- Remove three legacy Maker test rows created during development.
-- These rows were confirmed to have no realized transaction and belong to
-- Campakamulya on 2026-08-19. Production transactions are intentionally untouched.

alter table public.disbursement_maker_items
  disable trigger trg_guard_disbursement_maker_item_transition;

delete from public.disbursement_maker_items
where id in (
  '63df9e32-f2c6-4c8d-92f7-939c430cfb47',
  '5606717f-c69c-4edf-b746-213555318ca3',
  '2409fa99-81a8-463f-941b-f22a39e6f538'
)
  and status = 'REALIZED'
  and realized_transaction_id is null;

alter table public.disbursement_maker_items
  enable trigger trg_guard_disbursement_maker_item_transition;
