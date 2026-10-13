-- Defense in depth: the transaction amount must equal the final amount token on the original Maker line.
begin;

create or replace function public.validate_maker_import_source_amount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_parts text[];
  v_amount_text text;
  v_amount_numeric numeric;
begin
  v_parts := string_to_array(coalesce(new.raw_line, ''), '·');
  if cardinality(v_parts) < 2 then
    raise exception 'Baris sumber % tidak memiliki pemisah nominal Maker.', new.line_number;
  end if;

  v_amount_text := btrim(v_parts[cardinality(v_parts)]);
  v_amount_text := regexp_replace(v_amount_text, '^Rp\s*', '', 'i');
  v_amount_text := regexp_replace(v_amount_text, '\s+', '', 'g');

  if v_amount_text !~ '^([0-9]+|[0-9]{1,3}(\.[0-9]{3})+)$' then
    raise exception 'Nominal pada teks sumber Maker baris % tidak valid.', new.line_number;
  end if;

  v_amount_numeric := replace(v_amount_text, '.', '')::numeric;
  if v_amount_numeric <= 0
    or v_amount_numeric > 9223372036854775807
    or new.amount is null
    or new.amount::numeric <> v_amount_numeric
  then
    raise exception 'Nominal payload berbeda dari nominal teks Maker pada baris %.', new.line_number;
  end if;

  return new;
end;
$function$;

drop trigger if exists maker_import_batch_rows_validate_source_amount
  on public.maker_import_batch_rows;

create trigger maker_import_batch_rows_validate_source_amount
before insert or update of raw_line, amount
on public.maker_import_batch_rows
for each row
execute function public.validate_maker_import_source_amount();

commit;
