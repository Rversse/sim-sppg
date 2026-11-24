-- Accept RAB B3 as a global source-label variant of the existing RAB / Pencairan flow.
-- The original source label remains intact in maker_import_batch_rows.source_category.
DO $migration$
DECLARE
  v_function_oid oid := 'public.import_maker_transactions(text, uuid, date, text, jsonb)'::regprocedure;
  v_definition text;
  v_old text := 'if upper(v_source_label) = ''RAB'' then v_expected_kind := ''rab'';';
  v_new text := 'if upper(v_source_label) in (''RAB'', ''RAB B3'') then v_expected_kind := ''rab'';';
BEGIN
  v_definition := pg_get_functiondef(v_function_oid);

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected RAB source-label validation was not found; refusing to replace the Maker import function.';
  END IF;

  IF position(v_new IN v_definition) > 0 THEN
    RAISE NOTICE 'RAB B3 support is already present; no function replacement needed.';
    RETURN;
  END IF;

  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END;
$migration$;
