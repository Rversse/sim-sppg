do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.import_maker_transactions(text,uuid,date,text,jsonb)'::regprocedure
  ) into v_definition;

  if position('Sewa Kendaraan (Mobil|Motor)' in v_definition) = 0 then
    raise exception 'Vehicle label validation rule was not found; refusing to patch RPC.';
  end if;

  if position("when v_flow = 'operational_disbursement' and v_kind = 'vehicle_rent' then v_source_label" in v_definition) = 0 then
    raise exception 'Vehicle note assignment was not found; refusing to patch RPC.';
  end if;

  v_definition := replace(
    v_definition,
    'Sewa Kendaraan (Mobil|Motor)',
    'Sewa Kendaraan ([0-9]+ Unit )?(Mobil|Motor)'
  );

  v_definition := replace(
    v_definition,
    "when v_flow = 'operational_disbursement' and v_kind = 'vehicle_rent' then v_source_label",
    "when v_flow = 'operational_disbursement' and v_kind = 'vehicle_rent' then coalesce(v_details, v_source_label)"
  );

  execute v_definition;
end;
$migration$;
