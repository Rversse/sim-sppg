-- Finalize transaction flow semantics:
-- neutral is GAS, while OPS/REAL_OPS remain dedicated flows.
-- Legacy gas rows are normalized into neutral and legacy gas mappings are removed.

update public.transactions
set flow_type = 'neutral',
    category = 'GAS'
where flow_type = 'gas';

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


-- All authenticated roles may read transaction records. Write policies remain role-restricted.
drop policy if exists "transactions select" on public.transactions;
drop policy if exists "transactions viewer bank income select" on public.transactions;

create policy "transactions select"
on public.transactions
for select
to authenticated
using (true);
