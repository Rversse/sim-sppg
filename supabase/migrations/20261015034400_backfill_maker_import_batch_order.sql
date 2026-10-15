-- Backfill batch/line ordering metadata for Maker transactions imported before sort keys were added.
-- The audit row is the canonical source for the exact batch and source line.
UPDATE public.transactions AS t
SET maker_import_batch_id = r.batch_id,
    maker_import_line_number = r.line_number
FROM public.maker_import_batch_rows AS r
WHERE r.transaction_id = t.id
  AND r.disposition = 'imported'
  AND t.maker_import_batch_id IS NULL
  AND t.maker_import_line_number IS NULL;
