do $migration$
declare
  v_definition text;
  v_start integer;
  v_end integer;
  v_old_length integer;
  v_new text := $new$when v_kind = 'ops_harian' and v_flow = 'ops_disbursement'
        and lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g')) = 'ops harian'
        then 'ops_harian'
      when v_kind = 'ops_harian' and v_flow = 'ops_disbursement'
        and v_verified
        and position('gaji pengawas keuangan' in lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g'))) > 0
        then 'gaji_akuntan'
      when v_kind = 'ops_harian' and v_flow = 'ops_disbursement'
        and v_verified
        and position('gaji pengawas gizi' in lower(regexp_replace(btrim(coalesce(v_details, '')), '\s+', ' ', 'g'))) > 0
        then 'gaji_ahli_gizi'
      when v_kind = 'ops_harian' and v_flow = 'ops_disbursement' and v_verified
        then 'ops_harian'$new$;
begin
  select pg_get_functiondef('public.import_maker_transactions(text,uuid,date,text,jsonb)'::regprocedure)
    into v_definition;

  v_start := strpos(v_definition, 'when v_kind = ''ops_harian'' and v_flow = ''ops_disbursement''');
  if v_start = 0 then
    raise exception 'OPS HARIAN rule-resolution start was not found; migration aborted.';
  end if;

  v_end := strpos(substring(v_definition from v_start), 'then ''ops_harian''');
  if v_end = 0 then
    raise exception 'OPS HARIAN rule-resolution end was not found; migration aborted.';
  end if;
  v_old_length := v_end + length('then ''ops_harian''') - 1;

  v_definition := substring(v_definition from 1 for v_start - 1)
    || v_new
    || substring(v_definition from v_start + v_old_length);

  execute v_definition;
end
$migration$;
