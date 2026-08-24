CREATE OR REPLACE FUNCTION public.realize_disbursement_maker(
  p_transaction_date date,
  p_kitchen_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  maker_item_id uuid,
  transaction_id uuid
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item record;
  v_transaction_id uuid;
  v_pending_count integer;
  v_processed_count integer;
  v_actor_id uuid := auth.uid();
  v_description text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'User tidak terautentikasi';
  END IF;

  IF p_user_id IS NULL OR p_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'User tidak valid';
  END IF;

  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal wajib diisi';
  END IF;

  IF p_kitchen_id IS NULL THEN
    RAISE EXCEPTION 'Dapur wajib dipilih';
  END IF;

  SELECT count(*)
  INTO v_pending_count
  FROM public.disbursement_maker_items
  WHERE transaction_date = p_transaction_date
    AND kitchen_id = p_kitchen_id
    AND status <> 'REALIZED';

  IF v_pending_count = 0 THEN
    RAISE EXCEPTION 'Tidak ada pencairan Maker yang belum direalisasikan untuk tanggal dan dapur yang dipilih';
  END IF;

  SELECT count(*)
  INTO v_processed_count
  FROM public.disbursement_maker_items
  WHERE transaction_date = p_transaction_date
    AND kitchen_id = p_kitchen_id
    AND status = 'PROCESSED';

  IF v_processed_count <> v_pending_count THEN
    RAISE EXCEPTION 'Semua pencairan yang belum direalisasikan harus berstatus PROCESSED sebelum direalisasikan';
  END IF;

  FOR v_item IN
    SELECT
      id,
      transaction_date,
      kitchen_id,
      account_id,
      amount,
      flow_type,
      selected_products
    FROM public.disbursement_maker_items
    WHERE transaction_date = p_transaction_date
      AND kitchen_id = p_kitchen_id
      AND status = 'PROCESSED'
    ORDER BY created_at ASC, id ASC
    FOR UPDATE
  LOOP
    v_description := CASE
      WHEN v_item.flow_type = 'income' THEN
        'Belanja ' ||
        CASE
          WHEN COALESCE(array_length(v_item.selected_products, 1), 0) > 0
            THEN array_to_string(v_item.selected_products, ', ')
          ELSE 'Bahan Baku'
        END ||
        ', ' || to_char(v_item.transaction_date, 'DD-MM-YYYY')
      WHEN v_item.flow_type = 'neutral' THEN
        'Pembayaran Gas, ' || to_char(v_item.transaction_date, 'DD-MM-YYYY')
      ELSE
        NULL
    END;

    INSERT INTO public.transactions (
      transaction_date,
      kitchen_id,
      flow_type,
      category,
      account_id,
      supplier_id,
      amount,
      note,
      created_by
    )
    VALUES (
      v_item.transaction_date,
      v_item.kitchen_id,
      v_item.flow_type,
      CASE
        WHEN v_item.flow_type = 'income' THEN 'RAB'
        WHEN v_item.flow_type = 'neutral' THEN 'OPS'
        ELSE NULL
      END,
      v_item.account_id,
      NULL,
      v_item.amount,
      v_description,
      v_actor_id
    )
    RETURNING id INTO v_transaction_id;

    UPDATE public.disbursement_maker_items
    SET
      status = 'REALIZED',
      realized_transaction_id = v_transaction_id,
      updated_by = v_actor_id,
      updated_at = now()
    WHERE id = v_item.id;

    maker_item_id := v_item.id;
    transaction_id := v_transaction_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.realize_disbursement_maker(date, uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.realize_disbursement_maker(date, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.realize_disbursement_maker(date, uuid, uuid) TO authenticated;
