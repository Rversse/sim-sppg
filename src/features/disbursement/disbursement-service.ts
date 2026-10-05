import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { DAILY_DISBURSEMENT_START_DATE } from '@/lib/app-config'

export const DISBURSEMENT_FLOW_TYPES = [
  'income',
  'gas',
  'neutral',
  'ops_disbursement'
] as const

export type DailyDisbursementFlow = (typeof DISBURSEMENT_FLOW_TYPES)[number]

export type DisbursementKitchen = {
  id: string
  name: string
}

export type DailyDisbursementTransaction = {
  id: string
  transaction_date: string
  kitchen_id: string
  kitchen_name: string
  flow_type: DailyDisbursementFlow
  category: string | null
  amount: number
  note: string | null
  destination_label: string | null
  created_at: string
  is_disbursed: boolean
  account: {
    name: string
    bank: string
    account_number: string
  } | null
}

export type DailyDisbursementSummary = {
  totalTransactions: number
  checkedTransactions: number
  pendingTransactions: number
  progress: number
  totalAmount: number
  checkedAmount: number
}

export function getDailyDisbursementFlowLabel(flow: DailyDisbursementFlow) {
  if (flow === 'income') return 'RAB / Pencairan'
  if (flow === 'ops_disbursement') return 'OPS / Pencairan'
  return 'OPS / Arutala'
}

export function getDailyDisbursementFlowClass(
  flow: DailyDisbursementFlow
) {
  if (flow === 'income') return 'income'
  if (flow === 'ops_disbursement') return 'ops-disbursement'
  return 'gas'
}

function isDailyDisbursementFlow(
  flow: string
): flow is DailyDisbursementFlow {
  return (DISBURSEMENT_FLOW_TYPES as readonly string[]).includes(flow)
}

export function summarizeDailyDisbursementRows(
  rows: DailyDisbursementTransaction[]
): DailyDisbursementSummary {
  const totalTransactions = rows.length
  const checkedRows = rows.filter((row) => row.is_disbursed)
  const checkedTransactions = checkedRows.length
  const pendingTransactions = totalTransactions - checkedTransactions
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0)
  const checkedAmount = checkedRows.reduce((sum, row) => sum + row.amount, 0)

  return {
    totalTransactions,
    checkedTransactions,
    pendingTransactions,
    progress: totalTransactions
      ? Math.round((checkedTransactions / totalTransactions) * 100)
      : 0,
    totalAmount,
    checkedAmount
  }
}

export async function getDailyDisbursementTransactions(
  selectedDate: string,
  kitchenId = '',
  flowType = '',
  client: SupabaseClient = supabase
): Promise<DailyDisbursementTransaction[]> {
  if (selectedDate < DAILY_DISBURSEMENT_START_DATE) {
    return []
  }

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
      destination_label,
      created_at,
      is_disbursed,
      kitchens!transactions_kitchen_id_fkey (
        id,
        name
      ),
      accounts (
        name,
        bank,
        account_number
      )
    `
    )
    .eq('transaction_date', selectedDate)
    .in('flow_type', [...DISBURSEMENT_FLOW_TYPES])

  if (kitchenId) {
    query = query.eq('kitchen_id', kitchenId)
  }

  if (flowType === 'gas') {
    query = query.in('flow_type', ['gas', 'neutral'])
  } else if (flowType && isDailyDisbursementFlow(flowType)) {
    query = query.eq('flow_type', flowType)
  }

  const { data, error } = await query
    .order('kitchen_id', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return ((data ?? []) as Array<{
    id: string
    transaction_date: string
    kitchen_id: string
    flow_type: string
    category: string | null
    amount: number | string
    note: string | null
    destination_label: string | null
    created_at: string
    is_disbursed: boolean
    kitchens:
      | {
          id: string
          name: string
        }
      | {
          id: string
          name: string
        }[]
      | null
    accounts:
      | {
          name: string
          bank: string
          account_number: string
        }
      | {
          name: string
          bank: string
          account_number: string
        }[]
      | null
  }>).flatMap((row) => {
    if (!isDailyDisbursementFlow(row.flow_type)) {
      return []
    }

    const kitchen = Array.isArray(row.kitchens)
      ? row.kitchens[0]
      : row.kitchens
    const account = Array.isArray(row.accounts)
      ? row.accounts[0]
      : row.accounts

    return [
      {
        id: row.id,
        transaction_date: row.transaction_date,
        kitchen_id: row.kitchen_id,
        kitchen_name: kitchen?.name ?? 'Dapur tidak diketahui',
        flow_type: row.flow_type,
        category: row.category,
        amount: Number(row.amount) || 0,
        note: row.note,
        destination_label: row.destination_label,
        created_at: row.created_at,
        is_disbursed: Boolean(row.is_disbursed),
        account: account ?? null
      }
    ]
  })
}

export async function getDailyDisbursementKitchens(
  client: SupabaseClient = supabase
): Promise<DisbursementKitchen[]> {
  const { data, error } = await client
    .from('kitchens')
    .select('id,name')
    .eq('is_active', true)
    .order('name')

  if (error) {
    throw error
  }

  return (data ?? []) as DisbursementKitchen[]
}
