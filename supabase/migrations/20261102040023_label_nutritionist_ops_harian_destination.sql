do $migration$
declare
  v_definition text;
  v_old text := $old$else 'Akuntan ' || v_kitchen.name$old$;
  v_new text := $new$else case
            when v_rule_type = 'gaji_ahli_gizi' then 'Pengawas Gizi ' || v_kitchen.name
            else 'Akuntan ' || v_kitchen.name
          end$new$;
begin
  select pg_get_functiondef('public.import_maker_transactions(text,uuid,date,text,jsonb)'::regprocedure)
    into v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'Destination label fallback was not found; migration aborted.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$migration$;
