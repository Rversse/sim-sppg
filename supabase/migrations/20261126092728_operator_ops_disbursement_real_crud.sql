-- Allow Operator CRUD only for the dedicated OPS - Pencairan Real flow.
-- Existing Admin policies remain unchanged. Bank transactions are not touched.

DROP POLICY IF EXISTS "transactions operator insert ops disbursement real"
  ON public.transactions;
CREATE POLICY "transactions operator insert ops disbursement real"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'operator'
    )
    AND flow_type = 'ops_disbursement_real'
    AND category = 'OPS'
    AND kitchen_id IS NOT NULL
    AND account_id IS NULL
    AND supplier_id IS NULL
    AND destination_label IS NULL
    AND operational_type IS NULL
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "transactions operator update ops disbursement real"
  ON public.transactions;
CREATE POLICY "transactions operator update ops disbursement real"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'operator'
    )
    AND flow_type = 'ops_disbursement_real'
    AND category = 'OPS'
    AND kitchen_id IS NOT NULL
    AND account_id IS NULL
    AND supplier_id IS NULL
    AND destination_label IS NULL
    AND operational_type IS NULL
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'operator'
    )
    AND flow_type = 'ops_disbursement_real'
    AND category = 'OPS'
    AND kitchen_id IS NOT NULL
    AND account_id IS NULL
    AND supplier_id IS NULL
    AND destination_label IS NULL
    AND operational_type IS NULL
  );

DROP POLICY IF EXISTS "transactions operator delete ops disbursement real"
  ON public.transactions;
CREATE POLICY "transactions operator delete ops disbursement real"
  ON public.transactions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'operator'
    )
    AND flow_type = 'ops_disbursement_real'
    AND category = 'OPS'
    AND kitchen_id IS NOT NULL
    AND account_id IS NULL
    AND supplier_id IS NULL
    AND destination_label IS NULL
    AND operational_type IS NULL
  );
