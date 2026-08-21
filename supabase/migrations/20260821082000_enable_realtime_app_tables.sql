-- Keep the Supabase Realtime publication reproducible from source control.
-- The block is idempotent: existing publication/table memberships are left
-- untouched and only missing memberships are added.

do $$
declare
  table_name text;
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  foreach table_name in array array[
    'transactions',
    'bank_transactions',
    'kitchens',
    'accounts',
    'income_suppliers',
    'suppliers',
    'kitchen_account_rules',
    'disbursement_maker_items',
    'disbursement_checklists',
    'kitchen_vehicles'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;
