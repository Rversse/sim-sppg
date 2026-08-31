-- Remove retired Accountant Management and Disbursement Maker features.
-- Historical migrations remain in source control; this migration removes only
-- the retired runtime objects from the live database.

-- ---------------------------------------------------------------------------
-- 1. Remove RLS policies depending on the retired accountant helper.
-- ---------------------------------------------------------------------------

drop policy if exists "disbursement_maker_items accountant update"
  on public.disbursement_maker_items;

drop policy if exists "disbursement_maker_items accountant delete"
  on public.disbursement_maker_items;

drop policy if exists "kitchens accountant select own"
  on public.kitchens;

drop policy if exists "kitchen_account_rules accountant select own"
  on public.kitchen_account_rules;

drop policy if exists "income_suppliers accountant select own"
  on public.income_suppliers;

drop policy if exists "disbursement_maker_items accountant insert"
  on public.disbursement_maker_items;

drop policy if exists "disbursement_maker_items accountant select"
  on public.disbursement_maker_items;

drop policy if exists "accounts accountant select own"
  on public.accounts;

-- ---------------------------------------------------------------------------
-- 2. Remove triggers that depend on retired functions.
-- ---------------------------------------------------------------------------

drop trigger if exists trg_record_accountant_assignment_history
  on public.accountant_profiles;

drop trigger if exists trg_guard_disbursement_maker_item_transition
  on public.disbursement_maker_items;

drop trigger if exists trg_disbursement_maker_items_updated_at
  on public.disbursement_maker_items;
-- ---------------------------------------------------------------------------
-- 3. Remove retired functions.
-- ---------------------------------------------------------------------------

drop function if exists public.get_accountant_realized_amounts(uuid[]);
drop function if exists public.get_accountant_kitchen_id();
drop function if exists public.record_accountant_assignment_history();

drop function if exists public.realize_disbursement_maker(date, uuid, uuid);
drop function if exists public.guard_disbursement_maker_item_transition();
drop function if exists public.set_disbursement_maker_items_updated_at();
drop function if exists public.claim_disbursement_notification(uuid, date, uuid);

-- ---------------------------------------------------------------------------
-- 4. Remove retired runtime tables.
-- ---------------------------------------------------------------------------

drop table if exists public.disbursement_notification_daily cascade;
drop table if exists public.disbursement_maker_items cascade;
drop table if exists public.accountant_assignment_history cascade;
drop table if exists public.accountant_profiles cascade;