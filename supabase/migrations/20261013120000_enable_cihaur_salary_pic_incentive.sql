-- Enable Cihaur Gaji Relawan and Insentif PIC from 12 October 2026.
-- Existing reports use transaction_date to keep earlier periods unchanged.

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_operational_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_operational_type_check
  CHECK (
    operational_type IS NULL
    OR operational_type = ANY (
      ARRAY[
        'relawan_salary'::text,
        'pic_incentive'::text,
        'vehicle_rent'::text,
        'sppg_rent'::text
      ]
    )
  );

CREATE OR REPLACE FUNCTION public.validate_cihaur_operational_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  kitchen_name text;
BEGIN
  IF new.flow_type IS DISTINCT FROM 'operational_disbursement'
     OR new.operational_type IS NULL THEN
    RETURN new;
  END IF;

  -- Do not block edits to unrelated fields on any legacy transaction.
  IF TG_OP = 'UPDATE' THEN
    IF new.flow_type IS NOT DISTINCT FROM old.flow_type
       AND new.kitchen_id IS NOT DISTINCT FROM old.kitchen_id
       AND new.transaction_date IS NOT DISTINCT FROM old.transaction_date
       AND new.operational_type IS NOT DISTINCT FROM old.operational_type THEN
      RETURN new;
    END IF;
  END IF;

  IF new.operational_type NOT IN (
    'relawan_salary',
    'pic_incentive'
  ) THEN
    RETURN new;
  END IF;

  SELECT name
  INTO kitchen_name
  FROM public.kitchens
  WHERE id = new.kitchen_id;

  IF lower(trim(coalesce(kitchen_name, ''))) = 'cihaur'
     AND new.transaction_date < DATE '2026-10-12' THEN
    RAISE EXCEPTION
      'Gaji Relawan dan Insentif PIC untuk Cihaur baru tersedia mulai 12 Oktober 2026';
  END IF;

  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS transactions_validate_cihaur_operational_policy
ON public.transactions;

CREATE TRIGGER transactions_validate_cihaur_operational_policy
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.validate_cihaur_operational_policy();

COMMENT ON FUNCTION public.validate_cihaur_operational_policy() IS
  'Allows Cihaur Gaji Relawan and Insentif PIC from 12 October 2026 and blocks new/backdated transactions before the effective date.';
