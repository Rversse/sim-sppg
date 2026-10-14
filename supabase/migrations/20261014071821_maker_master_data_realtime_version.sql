-- Notify Maker-Pencairan that shared master data changed without exposing account data.
-- Only the singleton revision timestamp is readable by browser clients.

create table if not exists public.maker_master_data_version (
  id integer primary key check (id = 1),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.maker_master_data_version (id, updated_at)
values (1, clock_timestamp())
on conflict (id) do nothing;

alter table public.maker_master_data_version enable row level security;

revoke all on table public.maker_master_data_version from public, anon, authenticated;
grant select on table public.maker_master_data_version to anon, authenticated;

drop policy if exists maker_master_data_version_read on public.maker_master_data_version;
create policy maker_master_data_version_read
  on public.maker_master_data_version
  for select
  to anon, authenticated
  using (true);

create or replace function public.bump_maker_master_data_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.maker_master_data_version (id, updated_at)
  values (1, clock_timestamp())
  on conflict (id) do update
    set updated_at = excluded.updated_at;

  return null;
end;
$$;

revoke all on function public.bump_maker_master_data_version() from public, anon, authenticated;

do $$
declare
  source_table text;
begin
  foreach source_table in array array[
    'kitchen_operational_account_rules',
    'kitchens',
    'accounts',
    'kitchen_account_rules',
    'income_suppliers',
    'suppliers'
  ]
  loop
    if to_regclass('public.' || source_table) is not null then
      execute format(
        'drop trigger if exists bump_maker_master_data_version on public.%I',
        source_table
      );
      execute format(
        'create trigger bump_maker_master_data_version after insert or update or delete on public.%I for each statement execute function public.bump_maker_master_data_version()',
        source_table
      );
    end if;
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'maker_master_data_version'
  ) then
    alter publication supabase_realtime add table public.maker_master_data_version;
  end if;
end;
$$;
