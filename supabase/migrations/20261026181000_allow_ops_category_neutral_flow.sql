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
    if new.category not in ('GAS', 'LAIN_LAIN', 'OPS')
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

    if new.category = 'OPS' and not exists (
      select 1
      from public.kitchen_account_rules kar
      where kar.kitchen_id = new.kitchen_id
        and kar.account_id = new.account_id
        and kar.flow_type = 'neutral'
    ) then
      raise exception 'OPS netral harus memakai rekening yang dimapping netral untuk dapur ini';
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
$function$;
