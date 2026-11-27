create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.transactions
  add column if not exists source_system text not null default 'sim',
  add column if not exists source_record_id uuid,
  add column if not exists source_created_by uuid,
  add column if not exists source_created_role text,
  add column if not exists edited_by uuid,
  add column if not exists edited_role text,
  add column if not exists edited_source text,
  add column if not exists edited_at timestamptz,
  add column if not exists version bigint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='transactions_source_system_check' and conrelid='public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_source_system_check
      check (source_system in ('sim', 'maker')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='transactions_edited_source_check' and conrelid='public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_edited_source_check
      check (edited_source is null or edited_source in ('sim', 'maker')) not valid;
  end if;
end $$;

alter table public.transactions validate constraint transactions_source_system_check;
alter table public.transactions validate constraint transactions_edited_source_check;

create unique index if not exists transactions_source_record_unique
  on public.transactions (source_system, source_record_id)
  where source_record_id is not null;

create index if not exists transactions_ops_real_source_lookup
  on public.transactions (kitchen_id, transaction_date)
  where flow_type = 'ops_disbursement_real' and category = 'OPS';

create table if not exists public.ops_real_audit (
  id bigint generated always as identity primary key,
  transaction_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  actor_role text,
  actor_source text not null check (actor_source in ('sim', 'maker', 'system')),
  transaction_version bigint,
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now()
);
alter table public.ops_real_audit enable row level security;
revoke all on public.ops_real_audit from anon, authenticated;
grant select, insert on public.ops_real_audit to service_role;
grant usage, select on sequence public.ops_real_audit_id_seq to service_role;

update public.transactions t
set source_system = 'maker', source_record_id = m.id
from public.maker_ops_real m
where t.flow_type = 'ops_disbursement_real'
  and t.category = 'OPS'
  and t.kitchen_id = m.kitchen_id
  and t.transaction_date = m.transaction_date
  and t.source_record_id is null;

create or replace function private.capture_ops_real_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'INSERT' then
    if new.flow_type <> 'ops_disbursement_real' or new.category <> 'OPS' then
      return new;
    end if;
    insert into public.ops_real_audit (
      transaction_id, action, actor_id, actor_role, actor_source,
      transaction_version, old_data, new_data
    ) values (
      new.id, 'INSERT', coalesce(new.edited_by, new.created_by, new.source_created_by),
      coalesce(new.edited_role, new.source_created_role, 'unknown'),
      coalesce(new.edited_source, new.source_system, 'system'),
      new.version, null, to_jsonb(new)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if old.flow_type <> 'ops_disbursement_real' and new.flow_type <> 'ops_disbursement_real' then
      return new;
    end if;
    new.version := old.version + 1;
    new.edited_at := now();
    insert into public.ops_real_audit (
      transaction_id, action, actor_id, actor_role, actor_source,
      transaction_version, old_data, new_data
    ) values (
      new.id, 'UPDATE', new.edited_by,
      coalesce(new.edited_role, 'unknown'),
      coalesce(new.edited_source, new.source_system, 'system'),
      new.version, to_jsonb(old), to_jsonb(new)
    );
    return new;
  elsif tg_op = 'DELETE' then
    if old.flow_type <> 'ops_disbursement_real' or old.category <> 'OPS' then
      return old;
    end if;
    insert into public.ops_real_audit (
      transaction_id, action, actor_id, actor_role, actor_source,
      transaction_version, old_data, new_data
    ) values (
      old.id, 'DELETE', old.edited_by, old.edited_role,
      coalesce(old.edited_source, old.source_system, 'system'),
      old.version, to_jsonb(old), null
    );
    return old;
  end if;
  return null;
end;
$function$;

revoke all on function private.capture_ops_real_audit() from public, anon, authenticated;
drop trigger if exists transactions_ops_real_audit on public.transactions;
create trigger transactions_ops_real_audit
before insert or update or delete on public.transactions
for each row execute function private.capture_ops_real_audit();

notify pgrst, 'reload schema';
