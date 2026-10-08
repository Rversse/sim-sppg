-- Add a dedicated admin-only flow for direct incoming transfers.
-- This is intentionally separate from RAB, GAS, OPS, and operational flows.

alter table public.transactions
  alter column kitchen_id drop not null;

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
        'real_ops'::text,
        'operational_disbursement'::text,
        'other_income'::text
      ]
    )
  );

alter table public.transactions
  drop constraint if exists transactions_category_check;

alter table public.transactions
  add constraint transactions_category_check
  check (
    category = any (
      array[
        'RAB'::text,
        'Supplier'::text,
        'KPWS'::text,
        'OPS'::text,
        'GAS'::text,
        'REAL_OPS'::text,
        'SEWA_SPPG'::text,
        'OPERATIONAL'::text,
        'OTHER_INCOME'::text
      ]
    )
  );

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
       or new.kitchen_id is null
       or new.account_id is null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow Pencairan / RAB tidak valid';
    end if;

  elsif new.flow_type = 'expense' then
    if new.category <> 'Supplier'
       or new.kitchen_id is null
       or new.account_id is not null
       or new.supplier_id is null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow Real / RAB tidak valid';
    end if;

  elsif new.flow_type = 'neutral' then
    if new.category <> 'GAS'
       or new.kitchen_id is null
       or new.account_id is null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow GAS tidak valid';
    end if;

    select name into kitchen_name
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
       or new.kitchen_id is null
       or new.account_id is not null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is null then
      raise exception 'Flow Pencairan / Ops tidak valid';
    end if;

  elsif new.flow_type = 'real_ops' then
    if new.category <> 'REAL_OPS'
       or new.kitchen_id is null
       or new.account_id is not null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow Real / Ops tidak valid';
    end if;

  elsif new.flow_type = 'operational_disbursement' then
    if new.category <> 'OPERATIONAL'
       or new.kitchen_id is null
       or new.operational_type is null
       or new.account_id is not null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null
       or new.note is not null then
      raise exception 'Flow Pencairan Operasional tidak valid';
    end if;

  elsif new.flow_type = 'other_income' then
    if new.category <> 'OTHER_INCOME'
       or new.kitchen_id is not null
       or new.account_id is null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null
       or new.operational_type is not null then
      raise exception 'Flow Transfer Lainnya tidak valid';
    end if;

  else
    raise exception 'Flow transaksi tidak dikenali';
  end if;

  return new;
end;
$function$;

comment on column public.transactions.flow_type is
  'Transaction flow. other_income is a standalone direct incoming transfer and is not tied to a kitchen.';

comment on column public.transactions.category is
  'Transaction category. OTHER_INCOME is reserved for standalone direct incoming transfers.';
