-- Permit source details in note only for vehicle rental operational disbursements.
-- Maker imports save the original Mobil/Motor + rental-period label into transactions.note.
alter table public.transactions
  drop constraint if exists transactions_operational_flow_consistency_check;

alter table public.transactions
  add constraint transactions_operational_flow_consistency_check
  check (
    (
      flow_type = 'operational_disbursement'
      and category = 'OPERATIONAL'
      and operational_type is not null
      and account_id is null
      and supplier_id is null
      and nullif(trim(coalesce(destination_label, '')), '') is null
      and (note is null or operational_type = 'vehicle_rent')
    )
    or (
      flow_type <> 'operational_disbursement'
      and operational_type is null
    )
  );

CREATE OR REPLACE FUNCTION public.validate_transaction_flow()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    if new.category not in ('GAS', 'LAIN_LAIN')
       or new.account_id is null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow neutral tidak valid';
    end if;

    select name
    into kitchen_name
    from public.kitchens
    where id = new.kitchen_id;

    if kitchen_name is null then
      raise exception 'Dapur transaksi tidak ditemukan';
    end if;

    if new.category = 'LAIN_LAIN' and not exists (
      select 1
      from public.kitchen_account_rules kar
      join public.accounts a on a.id = kar.account_id
      where kar.kitchen_id = new.kitchen_id
        and kar.account_id = new.account_id
        and kar.flow_type in ('income', 'neutral')
        and upper(regexp_replace(btrim(a.bank), '\s+', ' ', 'g')) = 'BNI'
        and lower(regexp_replace(btrim(a.name), '\s+', ' ', 'g')) = 'koperasi arutala'
    ) then
      raise exception 'Lain-lain hanya boleh masuk ke rekening Koperasi Arutala BNI, Akuntan, atau Aslap';
    end if;

    if new.category = 'GAS' and lower(trim(kitchen_name)) in ('sukaraja', 'cihaur') then
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

  elsif new.flow_type = 'operational_disbursement' then
    if new.category <> 'OPERATIONAL'
       or new.operational_type is null
       or new.account_id is not null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null
       or (new.note is not null and new.operational_type is distinct from 'vehicle_rent') then
      raise exception 'Flow Pencairan Operasional tidak valid';
    end if;

  else
    raise exception 'Flow transaksi tidak dikenali';
  end if;

  return new;
end;
$function$
;
