do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.import_maker_transactions(text,uuid,date,text,jsonb)'::regprocedure
  ) into v_definition;

  v_updated := replace(
    v_definition,
    $old$    if v_kind = 'ops_harian' then$old$,
    $new$    if v_kind = 'ops_harian'
      or (v_kind = 'lain_lain' and v_flow = 'neutral' and v_category = 'OPS') then$new$
  );
  if v_updated = v_definition then
    raise exception 'Expected OPS HARIAN routing clause was not found exactly.';
  end if;
  v_definition := v_updated;

  v_updated := replace(
    v_definition,
    $old$        or (v_kind = 'lain_lain' and v_category = 'LAIN_LAIN')$old$,
    $new$        or (v_kind = 'lain_lain' and v_category = 'LAIN_LAIN')
        or (v_kind = 'lain_lain' and v_category = 'OPS' and v_ops_harian_arutala)$new$
  );
  if v_updated = v_definition then
    raise exception 'Expected neutral Lain-lain category guard was not found exactly.';
  end if;

  execute v_updated;
end
$migration$;
