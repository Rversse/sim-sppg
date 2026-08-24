ALTER TABLE public.disbursement_maker_items
  ADD COLUMN IF NOT EXISTS selected_products text[] NOT NULL DEFAULT '{}';
