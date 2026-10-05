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

  elsif new.flow_type = 'sppg_rent' then
    if new.category <> 'SEWA_SPPG'
       or new.account_id is not null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null then
      raise exception 'Flow Sewa SPPG tidak valid';
    end if;

  else
    raise exception 'Flow transaksi tidak dikenali';
  end if;

  return new;
end;
$function$;