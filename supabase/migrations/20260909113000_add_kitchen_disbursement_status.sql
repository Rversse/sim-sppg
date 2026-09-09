-- Track disbursement/approval state once per kitchen and period.
-- A kitchen period is considered disbursed by the UI/service rule before 2026-09-09.

create table if not exists public.kitchen_disbursement_statuses (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  status_date date not null,
  is_disbursed boolean not null default false,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (kitchen_id, status_date)
);

alter table public.kitchen_disbursement_statuses enable row level security;

drop policy if exists "kitchen_disbursement_statuses authenticated select"
  on public.kitchen_disbursement_statuses;
create policy "kitchen_disbursement_statuses authenticated select"
on public.kitchen_disbursement_statuses
for select
to authenticated
using (true);

drop policy if exists "kitchen_disbursement_statuses admin insert"
  on public.kitchen_disbursement_statuses;
create policy "kitchen_disbursement_statuses admin insert"
on public.kitchen_disbursement_statuses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "kitchen_disbursement_statuses admin update"
  on public.kitchen_disbursement_statuses;
create policy "kitchen_disbursement_statuses admin update"
on public.kitchen_disbursement_statuses
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "kitchen_disbursement_statuses admin delete"
  on public.kitchen_disbursement_statuses;
create policy "kitchen_disbursement_statuses admin delete"
on public.kitchen_disbursement_statuses
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

create or replace function public.set_kitchen_disbursement_status(
  p_kitchen_id uuid,
  p_status_date date,
  p_is_disbursed boolean
)
returns public.kitchen_disbursement_statuses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.kitchen_disbursement_statuses;
begin
  if auth.uid() is null then
    raise exception 'User tidak terautentikasi';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Hanya admin yang dapat mengubah status pencairan';
  end if;

  if p_kitchen_id is null then
    raise exception 'Dapur wajib dipilih';
  end if;

  if p_status_date is null then
    raise exception 'Tanggal wajib diisi';
  end if;

  if p_status_date < date '2026-09-09' then
    raise exception 'Status pencairan sebelum 09-09-2026 bersifat otomatis';
  end if;

  insert into public.kitchen_disbursement_statuses (
    kitchen_id,
    status_date,
    is_disbursed,
    updated_by,
    updated_at
  )
  values (
    p_kitchen_id,
    p_status_date,
    coalesce(p_is_disbursed, false),
    auth.uid(),
    now()
  )
  on conflict (kitchen_id, status_date)
  do update set
    is_disbursed = excluded.is_disbursed,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.set_kitchen_disbursement_status(uuid, date, boolean) from public;
revoke all on function public.set_kitchen_disbursement_status(uuid, date, boolean) from anon;
grant execute on function public.set_kitchen_disbursement_status(uuid, date, boolean) to authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'kitchen_disbursement_statuses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_disbursement_statuses;
  END IF;
END;
$$;
