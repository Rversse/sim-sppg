-- Remove obsolete partial unique indexes for the retired
-- flow_type = 'operational' configuration.

drop index if exists public.kitchen_account_rules_operational_account_uidx;
drop index if exists public.kitchen_account_rules_operational_kitchen_uidx;