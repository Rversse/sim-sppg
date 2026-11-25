DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'kitchen_operational_account_rules'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.kitchen_operational_account_rules;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'kitchen_salary_allocations'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.kitchen_salary_allocations;
  END IF;
END
$$;
