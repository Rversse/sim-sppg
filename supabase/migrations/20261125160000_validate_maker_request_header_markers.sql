-- Keep Maker header validation consistent with the frontend parser.
-- The request marker is optional for Cibaregbeg/Warungbitung, but if present
-- it must match the kitchen. Other kitchens may only use the standard header.
DO $migration$
DECLARE
  v_definition text;
  v_old_header text := $old_header$'^(.+),[[:space:]]*([0-9]{1,2})-([A-Za-z]{3})-([0-9]{4})$'$old_header$;
  v_new_header text := $new_header$'^(.+),[[:space:]]*([0-9]{1,2})-([A-Za-z]{3})-([0-9]{4})(?:[[:space:]]+\(([0-9]+)\))?$'$new_header$;
  v_old_guard text := $old_guard$  if v_header_match is null then
    raise exception 'Header Maker harus berformat NamaDapur, DD-Mon-YYYY.';
  end if;
$old_guard$;
  v_new_guard text := $new_guard$  if v_header_match is null then
    raise exception 'Header Maker harus berformat NamaDapur, DD-Mon-YYYY.';
  end if;
  if v_header_match[5] is not null and (
    (lower(regexp_replace(btrim(v_header_match[1]), '[[:space:]]+', ' ', 'g')) = 'cibaregbeg' and v_header_match[5] <> '29')
    or (lower(regexp_replace(btrim(v_header_match[1]), '[[:space:]]+', ' ', 'g')) = 'warungbitung' and v_header_match[5] <> '37')
    or lower(regexp_replace(btrim(v_header_match[1]), '[[:space:]]+', ' ', 'g')) not in ('cibaregbeg', 'warungbitung')
  ) then
    raise exception 'Penanda request pada header Maker tidak cocok dengan nama dapur.';
  end if;
$new_guard$;
BEGIN
  SELECT pg_get_functiondef(
    'public.import_maker_transactions(text, uuid, date, text, jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Function public.import_maker_transactions tidak ditemukan.';
  END IF;

  IF position(v_old_header IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Validasi header Maker lama tidak ditemukan; migrasi dibatalkan.';
  END IF;
  v_definition := replace(v_definition, v_old_header, v_new_header);

  IF position(v_old_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Blok validasi header Maker tidak ditemukan; migrasi dibatalkan.';
  END IF;
  v_definition := replace(v_definition, v_old_guard, v_new_guard);

  EXECUTE v_definition;
END
$migration$;
