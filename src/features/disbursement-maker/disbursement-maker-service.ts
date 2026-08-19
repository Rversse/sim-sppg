import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type MakerFlow = 'income' | 'neutral'

export type MakerStatus = 'READY' | 'PROCESSED' | 'REALIZED'

export type MakerKitchen = {
  id: string
  name: string
}

export type MakerAccountOption = {
  accountId: string
  accountName: string
  bank: string
  accountNumber: string
  supplierName: string | null
  supplierOwnerName: string | null
}

export type MakerItem = {
  id: string
  kitchenId: string
  transactionDate: string
  accountId: string
  amount: number
  flowType: MakerFlow
  status: MakerStatus
  realizedTransactionId: string | null
  createdAt: string
  updatedAt: string
}

type KitchenAccountRuleRow = {
  account_id: string
  accounts:
    | {
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
      }
    | {
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
      }[]
    | null
}

type AccountRow = {
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
}

function mapAccountOption(account: AccountRow): MakerAccountOption {
  const supplier = Array.isArray(account.income_suppliers)
    ? (account.income_suppliers[0] ?? null)
    : account.income_suppliers

  return {
    accountId: account.id,
    accountName: account.name,
    bank: account.bank,
    accountNumber: account.account_number,
    supplierName: supplier?.business_name ?? null,
    supplierOwnerName: supplier?.owner_name ?? null
  }
}

export async function getActiveMakerKitchens(
  client: SupabaseClient = supabase
): Promise<MakerKitchen[]> {
  const { data, error } = await client
    .from('kitchens')
    .select('id,name')
    .eq('is_active', true)
    .order('name')

  if (error) {
    throw error
  }

  return (data ?? []) as MakerKitchen[]
}

export async function validateMakerKitchen(
  kitchenId: string,
  client: SupabaseClient = supabase
): Promise<boolean> {
  if (!kitchenId) {
    return false
  }

  const { data, error } = await client
    .from('kitchens')
    .select('id')
    .eq('id', kitchenId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw error
  }

  return Boolean(data)
}

export async function getMakerAccountOptions(
  kitchenId: string,
  flowType: MakerFlow,
  client: SupabaseClient = supabase
): Promise<MakerAccountOption[]> {
  if (!kitchenId) {
    return []
  }

  const validKitchen = await validateMakerKitchen(kitchenId, client)

  if (!validKitchen) {
    return []
  }

  if (flowType === 'neutral') {
    const { data, error } = await client
      .from('accounts')
      .select(
        `
        id,
        name,
        bank,
        account_number,
        income_suppliers!accounts_supplier_id_fkey(
          business_name,
          owner_name
        )
      `
      )
      .eq('name', 'ARUTALA')
      .eq('bank', 'BNI')
      .eq('account_number', '1985322260')
      .maybeSingle()

    if (error) {
      throw error
    }

    return data ? [mapAccountOption(data as unknown as AccountRow)] : []
  }

  const { data, error } = await client
    .from('kitchen_account_rules')
    .select(
      `
      account_id,
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
    .eq('kitchen_id', kitchenId)
    .eq('flow_type', 'income')
    .order('account_id')

  if (error) {
    throw error
  }

  const rows = (data ?? []) as unknown as KitchenAccountRuleRow[]

  return rows
    .map((row) => {
      const account = Array.isArray(row.accounts)
        ? row.accounts[0]
        : row.accounts

      if (!account) {
        return null
      }

      return mapAccountOption(account)
    })
    .filter((account): account is MakerAccountOption => account !== null)
}

export function normalizeMakerAmount(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Nominal tidak valid')
    }

    const amount = Math.trunc(value)

    if (!Number.isSafeInteger(amount)) {
      throw new Error('Nominal terlalu besar')
    }

    return amount
  }

  const normalized = value.replace(/\D/g, '')

  if (!normalized) {
    throw new Error('Nominal tidak valid')
  }

  const amount = Number(normalized)

  if (!Number.isSafeInteger(amount)) {
    throw new Error('Nominal terlalu besar')
  }

  return amount
}

export function buildMakerDescription(
  transactionDate: string,
  flowType: MakerFlow
): string {
  if (!transactionDate) {
    throw new Error('Tanggal wajib diisi')
  }

  if (flowType !== 'income' && flowType !== 'neutral') {
    throw new Error('Jenis pencairan tidak valid')
  }

  const [year, month, day] = transactionDate.split('-')

  if (!year || !month || !day) {
    throw new Error('Format tanggal tidak valid')
  }

  const description =
    flowType === 'income' ? 'Belanja Bahan Baku' : 'Pembayaran Gas'

  return `${description}, ${day}-${month}-${year}`
}

export async function validateMakerAccount(
  kitchenId: string,
  flowType: MakerFlow,
  accountId: string,
  client: SupabaseClient = supabase
): Promise<boolean> {
  if (!kitchenId || !accountId) {
    return false
  }

  const validKitchen = await validateMakerKitchen(kitchenId, client)

  if (!validKitchen) {
    return false
  }

  if (flowType === 'neutral') {
    const { data, error } = await client
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .eq('name', 'ARUTALA')
      .eq('bank', 'BNI')
      .eq('account_number', '1985322260')
      .maybeSingle()

    if (error) {
      throw error
    }

    return Boolean(data)
  }

  const { data, error } = await client
    .from('kitchen_account_rules')
    .select('account_id')
    .eq('kitchen_id', kitchenId)
    .eq('flow_type', 'income')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return Boolean(data)
}

export function validateMakerItem(input: {
  kitchenId: string
  transactionDate: string
  accountId: string
  amount: number
  flowType: MakerFlow
}): string | null {
  if (!input.transactionDate) {
    return 'Tanggal wajib diisi'
  }

  if (!input.kitchenId) {
    return 'Pilih dapur'
  }

  if (!input.accountId) {
    return 'Rekening wajib dipilih'
  }

  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    return 'Nominal harus lebih dari 0'
  }

  if (input.flowType !== 'income' && input.flowType !== 'neutral') {
    return 'Jenis pencairan tidak valid'
  }

  return null
}

export async function getMakerItems(
  filters: {
    transactionDate?: string
    kitchenId?: string
    flowType?: MakerFlow
    status?: MakerStatus
  } = {},
  client: SupabaseClient = supabase
): Promise<MakerItem[]> {
  let query = client.from('disbursement_maker_items').select(
    `
      id,
      kitchen_id,
      transaction_date,
      account_id,
      amount,
      flow_type,
      status,
      realized_transaction_id,
      created_at,
      updated_at
    `
  )

  if (filters.transactionDate) {
    query = query.eq('transaction_date', filters.transactionDate)
  }

  if (filters.kitchenId) {
    query = query.eq('kitchen_id', filters.kitchenId)
  }

  if (filters.flowType) {
    query = query.eq('flow_type', filters.flowType)
  }

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  const { data, error } = await query
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    kitchenId: item.kitchen_id,
    transactionDate: item.transaction_date,
    accountId: item.account_id,
    amount: item.amount,
    flowType: item.flow_type,
    status: item.status,
    realizedTransactionId: item.realized_transaction_id,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  }))
}

export async function createMakerItem(
  input: {
    kitchenId: string
    transactionDate: string
    accountId: string
    amount: string | number
    flowType: MakerFlow
    createdBy?: string | null
  },
  client: SupabaseClient = supabase
): Promise<MakerItem> {
  const amount = normalizeMakerAmount(input.amount)

  const validationError = validateMakerItem({
    kitchenId: input.kitchenId,
    transactionDate: input.transactionDate,
    accountId: input.accountId,
    amount,
    flowType: input.flowType
  })

  if (validationError) {
    throw new Error(validationError)
  }

  const validAccount = await validateMakerAccount(
    input.kitchenId,
    input.flowType,
    input.accountId,
    client
  )

  if (!validAccount) {
    throw new Error(
      'Rekening tidak terdaftar untuk dapur dan jenis pencairan yang dipilih'
    )
  }

  const { data, error } = await client
    .from('disbursement_maker_items')
    .insert({
      kitchen_id: input.kitchenId,
      transaction_date: input.transactionDate,
      account_id: input.accountId,
      amount,
      flow_type: input.flowType,
      status: 'READY',
      created_by: input.createdBy ?? null,
      updated_by: input.createdBy ?? null
    })
    .select(
      `
      id,
      kitchen_id,
      transaction_date,
      account_id,
      amount,
      flow_type,
      status,
      realized_transaction_id,
      created_at,
      updated_at
    `
    )
    .single()

  if (error) {
    throw error
  }

  return {
    id: data.id,
    kitchenId: data.kitchen_id,
    transactionDate: data.transaction_date,
    accountId: data.account_id,
    amount: data.amount,
    flowType: data.flow_type,
    status: data.status,
    realizedTransactionId: data.realized_transaction_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
}

export async function updateMakerStatus(
  makerItemId: string,
  status: MakerStatus,
  client: SupabaseClient = supabase,
  updatedBy?: string | null
): Promise<MakerItem> {
  if (!makerItemId) {
    throw new Error('Maker item tidak ditemukan')
  }

  const { data, error } = await client
    .from('disbursement_maker_items')
    .update({
      status,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString()
    })
    .eq('id', makerItemId)
    .select(
      `
      id,
      kitchen_id,
      transaction_date,
      account_id,
      amount,
      flow_type,
      status,
      realized_transaction_id,
      created_at,
      updated_at
    `
    )
    .single()

  if (error) {
    throw error
  }

  return {
    id: data.id,
    kitchenId: data.kitchen_id,
    transactionDate: data.transaction_date,
    accountId: data.account_id,
    amount: data.amount,
    flowType: data.flow_type,
    status: data.status,
    realizedTransactionId: data.realized_transaction_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
}
