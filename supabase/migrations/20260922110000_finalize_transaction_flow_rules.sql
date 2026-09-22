-- Finalize transaction flow semantics:
-- neutral is GAS, while OPS/REAL_OPS remain dedicated flows.
-- Legacy gas rows are normalized into neutral and legacy gas mappings are removed.

update public.transactions
set flow_type = 'neutral',
    category = 'GAS'
where flow_type = 'gas';

update public.transactions
set category = 'GAS'
where flow_type = 'neutral'
  and category = 'OPS';

delete from public.kitchen_account_rules
where flow_type = 'gas';

alter table public.transactions
  drop constraint if exists transactions_flow_type_check;

alter table public.transactions
  add constraint transactions_flow_type_check
  check (
    flow_type = any (
      array[
        'income'::text,
        'expense'::text,
        'neutral'::text,
        'ops_disbursement'::text,
        'real_ops'::text
      ]
    )
  );

alter table public.transactions
  drop constraint if exists transactions_amount_check;

alter table public.transactions
  add constraint transactions_amount_check
  check (amount > 0);

create or replace function public.validate_transaction_flow()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  kitchen_name text;
begin
  if new.flow_type = 'income' then
    if new.category <> 'RAB'
       or new.account_id is null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow Pencairan / RAB tidak valid';
    end if;

  elsif new.flow_type = 'expense' then
    if new.category <> 'Supplier'
       or new.account_id is not null
       or new.supplier_id is null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow Real / RAB tidak valid';
    end if;

  elsif new.flow_type = 'neutral' then
    if new.category <> 'GAS'
       or new.account_id is null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow GAS tidak valid';
    end if;

    select name
    into kitchen_name
    from public.kitchens
    where id = new.kitchen_id;

    if kitchen_name is null then
      raise exception 'Dapur transaksi tidak ditemukan';
    end if;

    if lower(trim(kitchen_name)) in ('sukaraja', 'cihaur') then
      raise exception 'GAS tidak tersedia untuk dapur Sukaraja dan Cihaur';
    end if;

  elsif new.flow_type = 'ops_disbursement' then
    if new.category <> 'OPS'
       or new.account_id is not null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is null then
      raise exception 'Flow Pencairan / Ops tidak valid';
    end if;

  elsif new.flow_type = 'real_ops' then
    if new.category <> 'REAL_OPS'
       or new.account_id is not null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow Real / Ops tidak valid';
    end if;

  else
    raise exception 'Flow transaksi tidak dikenali';
  end if;

  return new;
end;
$function$;

drop trigger if exists transactions_validate_flow on public.transactions;

create trigger transactions_validate_flow
before insert or update on public.transactions
for each row
execute function public.validate_transaction_flow();

comment on function public.validate_transaction_flow() is
  'Enforces the final SIM SPPG transaction flow semantics, including GAS=neutral and non-GAS operational flows.';


-- Final dashboard summary semantics: neutral is GAS only.
drop function if exists public.get_dashboard_summary(date, date, uuid, text[], text);

create function public.get_dashboard_summary(
  start_date date,
  end_date date,
  kitchen_uuid uuid,
  flow_types text[] default null,
  supplier_filter text default null
)
returns table(
  income bigint,
  expense bigint,
  gas bigint,
  operational bigint,
  operational_disbursement bigint,
  real_operational bigint
)
language sql
set search_path to 'public', 'pg_temp'
as $function$
select
  coalesce(sum(case when t.flow_type = 'income' then t.amount else 0 end), 0)::bigint as income,
  coalesce(sum(case when t.flow_type = 'expense' then t.amount else 0 end), 0)::bigint as expense,
  coalesce(sum(case when t.flow_type = 'neutral' then t.amount else 0 end), 0)::bigint as gas,
  coalesce(sum(case when t.flow_type = 'ops_disbursement' then t.amount else 0 end), 0)::bigint as operational,
  coalesce(sum(case when t.flow_type = 'ops_disbursement' then t.amount else 0 end), 0)::bigint as operational_disbursement,
  coalesce(sum(case when t.flow_type = 'real_ops' then t.amount else 0 end), 0)::bigint as real_operational
from public.transactions t
left join public.accounts a on a.id = t.account_id
left join public.suppliers s on s.id = t.supplier_id
where t.transaction_date between start_date and end_date
  and (kitchen_uuid is null or t.kitchen_id = kitchen_uuid)
  and (
    flow_types is null
    or t.flow_type = any(flow_types)
    or ('gas' = any(flow_types) and t.flow_type = 'neutral')
  )
  and (
    supplier_filter is null
    or (t.flow_type = 'income' and a.id::text = supplier_filter)
    or (t.flow_type = 'expense' and s.name = supplier_filter)
    or (t.flow_type = 'neutral' and a.id::text = supplier_filter)
    or (t.flow_type = 'ops_disbursement' and t.destination_label = supplier_filter)
  );
$function$;

-- All authenticated roles may read transaction records. Write policies remain role-restricted.
-- GAS mappings use neutral as the canonical flow.
alter table public.kitchen_account_rules
  drop constraint if exists kitchen_account_rules_flow_type_check;

alter table public.kitchen_account_rules
  add constraint kitchen_account_rules_flow_type_check
  check (flow_type = any (array['income'::text, 'neutral'::text]));

create or replace function public.validate_kitchen_account_rule_flow()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  kitchen_name text;
begin
  if new.flow_type = 'neutral' then
    select name into kitchen_name
    from public.kitchens
    where id = new.kitchen_id;

    if kitchen_name is null then
      raise exception 'Dapur mapping tidak ditemukan';
    end if;

    if lower(trim(kitchen_name)) in ('sukaraja', 'cihaur') then
      raise exception 'GAS tidak tersedia untuk dapur Sukaraja dan Cihaur';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists kitchen_account_rules_validate_flow
on public.kitchen_account_rules;

create trigger kitchen_account_rules_validate_flow
before insert or update on public.kitchen_account_rules
for each row
execute function public.validate_kitchen_account_rule_flow();

drop policy if exists "transactions select" on public.transactions;
drop policy if exists "transactions viewer bank income select" on public.transactions;

create policy "transactions select"
on public.transactions
for select
to authenticated
using (true);
