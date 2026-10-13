-- Align Cipetir Sewa SPPG recipient display with Maker; preserve BNI and account number.
update public.kitchen_operational_account_rules r
set owner_name = 'Yusgar Anggara Dinata',
    updated_at = now()
from public.kitchens k
where k.id = r.kitchen_id
  and lower(k.name) = 'cipetir'
  and r.is_active
  and r.rule_type = 'sppg_rent'
  and btrim(r.owner_name) = 'Yusgar Anggara'
  and upper(btrim(r.bank)) = 'BNI'
  and r.account_number = '885788718';

do $$
declare
  v_count integer;
  v_bank_count integer;
  v_account_count integer;
begin
  select count(*)::integer,
         count(*) filter (where upper(btrim(r.bank)) = 'BNI')::integer,
         count(*) filter (where r.account_number = '885788718')::integer
  into v_count, v_bank_count, v_account_count
  from public.kitchen_operational_account_rules r
  join public.kitchens k on k.id = r.kitchen_id
  where lower(k.name) = 'cipetir'
    and r.is_active
    and r.rule_type = 'sppg_rent'
    and btrim(r.owner_name) = 'Yusgar Anggara Dinata';

  if v_count <> 1 or v_bank_count <> 1 or v_account_count <> 1 then
    raise exception 'Mapping Sewa SPPG Cipetir harus tepat satu baris dengan nama penerima lengkap, bank BNI, dan nomor rekening yang tidak berubah.';
  end if;
end;
$$;
