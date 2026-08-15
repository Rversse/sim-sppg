import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type TransactionFlow = 'income' | 'expense' | 'neutral'

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
  category: 'RAB' | 'Supplier' | 'OPS'
  account_id: string | null
  supplier_id: string | null
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
  created_at: string
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
    query = query.eq('flow_type', filters.flowType)
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
        account_id: input.accountId ?? null,
        supplier_id: null
      }

    case 'expense':
      return {
        ...base,
        flow_type: 'expense',
        category: 'Supplier',
        account_id: null,
        supplier_id: input.supplierId ?? null
      }

    case 'neutral':
      return {
        ...base,
        flow_type: 'neutral',
        category: 'OPS',
        account_id: input.accountId ?? null,
        supplier_id: null
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
    (payload.flow_type === 'income' || payload.flow_type === 'neutral') &&
    !payload.account_id
  ) {
    return 'Rekening wajib dipilih'
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

  if (payload.flow_type === 'income' || payload.flow_type === 'neutral') {
    query = query.eq('account_id', payload.account_id)
  }

  const { count, error } = await query

  if (error) {
    throw error
  }

  return (count ?? 0) > 0
}

export async function createTransaction(
  payload: TransactionPayload,
  client: SupabaseClient = supabase
) {
  const validationError = validateTransactionPayload(payload)

  if (validationError) {
    throw new Error(validationError)
  }

  const duplicate = await hasDuplicateTransaction(payload, client)

  return {
    duplicate,
    ...(duplicate ? {} : await insertTransaction(payload, client))
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
