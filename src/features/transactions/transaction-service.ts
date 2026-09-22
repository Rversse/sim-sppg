import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type TransactionFlow =
  | 'income'
  | 'expense'
  | 'gas'
  | 'ops_disbursement'
  | 'real_ops'
  | 'neutral'

export type TransactionFilters = {
  startDate: string
  endDate: string
  kitchenId?: string
  flowType?: TransactionFlow | ''
}

export type TransactionPayload = {
  transaction_date: string
  kitchen_id: string
  amount: number
  note: string | null
  flow_type: TransactionFlow
  category: 'RAB' | 'Supplier' | 'OPS' | 'GAS' | 'REAL_OPS'
  account_id: string | null
  supplier_id: string | null
  destination_label: string | null
}

export type TransactionRecord = {
  id: string
  transaction_date: string
  kitchen_id: string | null
  flow_type: TransactionFlow
  category: string | null
  amount: number
  note: string | null
  account_id: string | null
  supplier_id: string | null
  destination_label: string | null
  created_at: string
  is_disbursed: boolean
  kitchens: {
    name: string
  } | null
  suppliers: {
    name: string
  } | null
  accounts: {
    id: string
    name: string
    bank: string
    account_number: string
    income_suppliers:
      | {
          business_name: string | null
          owner_name: string | null
        }
      | {
          business_name: string | null
          owner_name: string | null
        }[]
      | null
  } | null
}

export async function getTransactions(
  filters: TransactionFilters,
  client: SupabaseClient = supabase
): Promise<TransactionRecord[]> {
  let query = client
    .from('transactions')
    .select(
      `
      id,
      transaction_date,
      kitchen_id,
      flow_type,
      category,
      amount,
      note,
      account_id,
      supplier_id,
      created_at,
      is_disbursed,
      destination_label,
      kitchens(name),
      suppliers!transactions_supplier_id_fkey(
        name
      ),
      accounts(
        id,
        name,
        bank,
        account_number,
        income_suppliers!accounts_supplier_id_fkey(
          business_name,
          owner_name
        )
      )
    `
    )
    .gte('transaction_date', filters.startDate)
    .lte('transaction_date', filters.endDate)

  if (filters.kitchenId) {
    query = query.eq('kitchen_id', filters.kitchenId)
  }

  if (filters.flowType) {
    query =
      filters.flowType === 'gas'
        ? query.in('flow_type', ['gas', 'neutral'])
        : query.eq('flow_type', filters.flowType)
  }

  const { data, error } = await query.order('created_at', {
    ascending: false
  })

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as TransactionRecord[]
}

export function buildTransactionPayload(
  flow: TransactionFlow,
  input: {
    transactionDate: string
    kitchenId: string
    amount: number
    note?: string | null
    accountId?: string | null
    supplierId?: string | null
    destinationLabel?: string | null
  }
): TransactionPayload {
  const base = {
    transaction_date: input.transactionDate,
    kitchen_id: input.kitchenId,
    amount: input.amount,
    note: input.note?.trim() || null
  }

  switch (flow) {
    case 'income':
      return {
        ...base,
        flow_type: 'income',
        category: 'RAB',
        account_id: input.accountId || null,
        supplier_id: null,
        destination_label: null
      }

    case 'expense':
      return {
        ...base,
        flow_type: 'expense',
        category: 'Supplier',
        account_id: null,
        supplier_id: input.supplierId || null,
        destination_label: null
      }

    case 'gas':
      return {
        ...base,
        flow_type: 'neutral',
        category: 'GAS',
        account_id: input.accountId || null,
        supplier_id: null,
        destination_label: null
      }

    case 'neutral':
      return {
        ...base,
        flow_type: 'gas',
        category: 'GAS',
        account_id: input.accountId || null,
        supplier_id: null,
        destination_label: null
      }

    case 'ops_disbursement':
      return {
        ...base,
        flow_type: 'ops_disbursement',
        category: 'OPS',
        account_id: null,
        supplier_id: null,
        destination_label: input.destinationLabel?.trim() || null
      }

    case 'real_ops':
      return {
        ...base,
        flow_type: 'real_ops',
        category: 'REAL_OPS',
        account_id: null,
        supplier_id: null,
        destination_label: null,
        note: null
      }
  }
}

export function validateTransactionPayload(
  payload: TransactionPayload
): string | null {
  if (!payload.transaction_date) {
    return 'Tanggal wajib diisi'
  }

  if (!payload.kitchen_id) {
    return 'Pilih dapur'
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return 'Nominal harus lebih dari 0'
  }

  if (
    (payload.flow_type === 'income' || payload.flow_type === 'gas') &&
    !payload.account_id
  ) {
    return 'Rekening wajib dipilih'
  }

  if (
    payload.flow_type === 'ops_disbursement' &&
    !payload.destination_label
  ) {
    return 'Tujuan operasional wajib diisi'
  }

  if (payload.flow_type === 'expense' && !payload.supplier_id) {
    return 'Supplier wajib dipilih'
  }

  return null
}

export async function hasDuplicateTransaction(
  payload: TransactionPayload,
  client: SupabaseClient = supabase,
  excludeId?: string
): Promise<boolean> {
  let query = client
    .from('transactions')
    .select('id', {
      count: 'exact',
      head: true
    })
    .eq('transaction_date', payload.transaction_date)
    .eq('kitchen_id', payload.kitchen_id)
    .eq('flow_type', payload.flow_type)
    .eq('amount', payload.amount)

  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  if (payload.flow_type === 'expense') {
    query = query.eq('supplier_id', payload.supplier_id)
  }

  if (payload.flow_type === 'income' || payload.flow_type === 'gas') {
    query = query.eq('account_id', payload.account_id)
  } else if (payload.flow_type === 'ops_disbursement') {
    query = query
      .is('account_id', null)
      .eq('destination_label', payload.destination_label)
  } else if (payload.flow_type === 'real_ops') {
    query = query.is('account_id', null)
  }

  const { count, error } = await query

  if (error) {
    throw error
  }

  return (count ?? 0) > 0
}

export async function createTransaction(
  payload: TransactionPayload,
  client: SupabaseClient = supabase,
  options: { allowDuplicate?: boolean } = {}
) {
  const validationError = validateTransactionPayload(payload)

  if (validationError) {
    throw new Error(validationError)
  }

  const duplicate = await hasDuplicateTransaction(payload, client)

  if (duplicate && !options.allowDuplicate) {
    return { duplicate: true }
  }

  return {
    duplicate,
    ...(await insertTransaction(payload, client))
  }
}

async function insertTransaction(
  payload: TransactionPayload,
  client: SupabaseClient
) {
  const { data, error } = await client
    .from('transactions')
    .insert(payload)
    .select()
    .single()

  if (error) {
    throw error
  }

  return { data }
}

export async function updateTransaction(
  id: string,
  payload: TransactionPayload,
  client: SupabaseClient = supabase
) {
  if (!id) {
    throw new Error('ID transaksi tidak ditemukan')
  }

  const validationError = validateTransactionPayload(payload)

  if (validationError) {
    throw new Error(validationError)
  }

  const duplicate = await hasDuplicateTransaction(payload, client, id)

  if (duplicate) {
    throw new Error('Transaksi dengan data yang sama sudah ada')
  }

  const { data, error } = await client
    .from('transactions')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function setKitchenDisbursementStatus(
  kitchenId: string,
  statusDate: string,
  isDisbursed: boolean,
  client: SupabaseClient = supabase
) {
  if (!kitchenId) {
    throw new Error('Dapur tidak ditemukan')
  }

  if (!statusDate) {
    throw new Error('Tanggal status pencairan tidak ditemukan')
  }

  const { data, error } = await client.rpc('set_kitchen_disbursement_status', {
    p_kitchen_id: kitchenId,
    p_status_date: statusDate,
    p_is_disbursed: isDisbursed
  })

  if (error) {
    throw error
  }

  return data
}

export async function deleteTransaction(
  id: string,
  client: SupabaseClient = supabase
) {
  if (!id) {
    throw new Error('ID transaksi tidak ditemukan')
  }

  const { error } = await client.from('transactions').delete().eq('id', id)

  if (error) {
    throw error
  }
}
