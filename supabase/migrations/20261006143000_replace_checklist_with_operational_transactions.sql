-- Replace the daily boolean disbursement checklist with real-value
-- operational transactions and persist the operational recipient on each kitchen.

ALTER TABLE public.kitchens
  ADD COLUMN IF NOT EXISTS operational_recipient_name text;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS operational_type text;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_flow_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_flow_type_check
  CHECK (
    flow_type = ANY (
      ARRAY[
        'income'::text,
        'expense'::text,
        'neutral'::text,
        'ops_disbursement'::text,
        'real_ops'::text,
        'operational_disbursement'::text
      ]
    )
  );

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_category_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_category_check
  CHECK (
    category = ANY (
      ARRAY[
        'RAB'::text,
        'Supplier'::text,
        'KPWS'::text,
        'OPS'::text,
        'GAS'::text,
        'REAL_OPS'::text,
        'SEWA_SPPG'::text,
        'OPERATIONAL'::text
      ]
    )
  );

UPDATE public.transactions
SET
  flow_type = 'operational_disbursement',
  category = 'OPERATIONAL',
  operational_type = 'sppg_rent',
  account_id = NULL,
  supplier_id = NULL,
  destination_label = NULL,
  note = NULL
WHERE flow_type = 'sppg_rent';

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_operational_type_check
  CHECK (
    operational_type IS NULL
    OR operational_type = ANY (
      ARRAY[
        'relawan_salary'::text,
        'school_pic_incentive'::text,
        'kader_incentive'::text,
        'vehicle_rent'::text,
        'sppg_rent'::text
      ]
    )
  );

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_operational_flow_consistency_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_operational_flow_consistency_check
  CHECK (
    (
      flow_type = 'operational_disbursement'
      AND category = 'OPERATIONAL'
      AND operational_type IS NOT NULL
      AND account_id IS NULL
      AND supplier_id IS NULL
      AND nullif(trim(coalesce(destination_label, '')), '') IS NULL
      AND note IS NULL
    )
    OR (
      flow_type <> 'operational_disbursement'
      AND operational_type IS NULL
    )
  );

UPDATE public.kitchens
SET operational_recipient_name = 'Robi Sulaeman'
WHERE lower(trim(name)) = 'cisepat';

CREATE OR REPLACE FUNCTION public.validate_transaction_flow()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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

  elsif new.flow_type = 'operational_disbursement' then
    if new.category <> 'OPERATIONAL'
       or new.operational_type is null
       or new.account_id is not null
       or new.supplier_id is not null
       or nullif(trim(coalesce(new.destination_label, '')), '') is not null
       or new.note is not null then
      raise exception 'Flow Pencairan Operasional tidak valid';
    end if;

  else
    raise exception 'Flow transaksi tidak dikenali';
  end if;

  return new;
end;
$function$;

DELETE FROM public.disbursement_checklists;

DROP TABLE public.disbursement_checklists;
