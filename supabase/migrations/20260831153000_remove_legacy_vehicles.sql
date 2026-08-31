-- Remove the legacy vehicles table.
-- The active vehicle model is public.kitchen_vehicles.

drop table if exists public.vehicles cascade;