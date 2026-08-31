-- Remove retired Accountant Management and Disbursement Maker features.
-- Historical migrations are intentionally kept in the repository for migration
-- history integrity. This migration tears down the now-unused runtime schema.

drop function if exists public.get_accountant_realized_amounts(uuid[]);
drop function if exists public.realize_disbursement_maker(date, uuid, uuid);
drop function if exists public.guard_disbursement_maker_item_transition();
drop function if exists public.set_disbursement_maker_items_updated_at();
drop function if exists public.get_accountant_kitchen_id();
drop function if exists public.record_accountant_assignment_history();

drop table if exists public.disbursement_maker_items cascade;
drop table if exists public.accountant_assignment_history cascade;
drop table if exists public.accountant_profiles cascade;
