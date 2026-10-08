import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type OtherIncomeAccountOption = {
  value: string
  label: string
}

export type OtherIncomeRecord = {
  id: string
  transaction_date: string
  account_id: string
  amount: number
  note: string | null
  created_by: string
  created_at: string
  account: {
    id: string
    name: string
    bank: string
    account_number: string | null
  } | null
}

type OtherIncomePayload = {
  transactionDate: string
  accountId: string
  amount: number
  note?: string | null
}

function formatAccountLabel(
  account: {
    name: string
    bank: string
    account_number: string | null
  }
) {
  return [
    account.name,
    account.bank,
    account.account_number?.trim() || 'Nomor rekening belum diisi'
  ].join(' • ')
}

function normalizeAccountRow(
  account: {
    id: string
    name: string
    bank: string
    account_number: string | null
  }
): OtherIncomeAccountOption {
  return {
    value: account.id,
    label: formatAccountLabel(account)
  }
}

export async function getOtherIncomeAccountOptions(
  client: SupabaseClient = supabase
): Promise<OtherIncomeAccountOption[]> {
  const { data, error } = await client
    .from('accounts')
    .select('id,name,bank,account_number')
    .order('name')
    .order('bank')
    .order('account_number')

  if (error) throw error

  const options = (data ?? []).map(normalizeAccountRow)

  const arutalaBniIndex = options.findIndex((option) =>
    /^KOPERASI ARUTALA(?:\s+\/.*)?\s+•\s+BNI\s+•/i.test(option.label)
  )

  if (arutalaBniIndex > 0) {
    const [arutalaBni] = options.splice(arutalaBniIndex, 1)
    options.unshift(arutalaBni)
  }

  return options
}

export async function createOtherIncomeTransaction(
  payload: OtherIncomePayload,
  client: SupabaseClient = supabase
) {
  const transactionDate = payload.transactionDate.trim()
  const accountId = payload.accountId.trim()
  const amount = Number(payload.amount)

  if (!transactionDate) {
    throw new Error('Tanggal wajib dipilih.')
  }

  if (!accountId) {
    throw new Error('Rekening wajib dipilih.')
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Nominal harus lebih dari 0.')
  }

  const { data, error } = await client
    .from('other_income_transactions')
    .insert({
      transaction_date: transactionDate,
      account_id: accountId,
      amount,
      note: payload.note?.trim() || null
    })
    .select(
      'id,transaction_date,account_id,amount,note,created_by,created_at,account:accounts!other_income_transactions_account_id_fkey(id,name,bank,account_number)'
    )
    .single()

  if (error) throw error

  return data as unknown as OtherIncomeRecord
}

export async function getOtherIncomeTransactions(
  startDate: string,
  endDate: string,
  client: SupabaseClient = supabase
): Promise<OtherIncomeRecord[]> {
  if (!startDate || !endDate) return []

  const { data, error } = await client
    .from('other_income_transactions')
    .select(
      'id,transaction_date,account_id,amount,note,created_by,created_at,account:accounts!other_income_transactions_account_id_fkey(id,name,bank,account_number)'
    )
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []) as unknown as OtherIncomeRecord[]
}
