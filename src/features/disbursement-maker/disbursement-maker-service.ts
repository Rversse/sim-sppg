import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type {
  MakerAccountOption,
  MakerFlow,
  MakerItem,
  MakerKitchen,
  MakerStatus
} from './disbursement-maker-types'

type SupplierRow = {
  id: string
  business_name: string | null
  owner_name: string | null
  product_type: string | null
}

type AccountWithSupplier = {
  id: string
  name: string
  bank: string
  account_number: string
  supplier_id: string | null
  income_suppliers: SupplierRow | SupplierRow[] | null
}

type KitchenAccountRuleRow = {
  account_id: string
  accounts: AccountWithSupplier | AccountWithSupplier[] | null
}

type AccountRow = AccountWithSupplier

function parseSupplierProducts(value: string | null): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ]
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
    supplierId: account.supplier_id,
    supplierName: supplier?.business_name ?? null,
    supplierOwnerName: supplier?.owner_name ?? null,
    supplierProducts: parseSupplierProducts(supplier?.product_type ?? null)
  }
}

function sortAccountOptions(
  options: MakerAccountOption[]
): MakerAccountOption[] {
  return [...options].sort((a, b) =>
    (a.supplierName ?? a.accountName).localeCompare(
      b.supplierName ?? b.accountName,
      'id',
      { sensitivity: 'base' }
    )
  )
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
        supplier_id,
        income_suppliers!accounts_supplier_id_fkey(
          id,
          business_name,
          owner_name,
          product_type
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
        supplier_id,
        income_suppliers!accounts_supplier_id_fkey(
          id,
          business_name,
          owner_name,
          product_type
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

  return sortAccountOptions(
    rows
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
  )
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

export function normalizeMakerProducts(
  values: string[] | null | undefined
): string[] {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))
  ]
}

export function buildMakerDescription(
  transactionDate: string,
  flowType: MakerFlow,
  selectedProducts: string[] = []
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

  const products = normalizeMakerProducts(selectedProducts)
  const description =
    flowType === 'income'
      ? `Belanja ${products.length ? products.join(', ') : 'Bahan Baku'}`
      : 'Pembayaran Gas'

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
  selectedProducts?: string[]
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

  const selectedProducts = normalizeMakerProducts(input.selectedProducts)

  if (input.flowType === 'neutral' && selectedProducts.length > 0) {
    return 'Gas tidak menggunakan pilihan produk'
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
      selected_products,
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
    selectedProducts: Array.isArray(item.selected_products)
      ? item.selected_products
      : [],
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
    selectedProducts?: string[]
    createdBy?: string | null
  },
  client: SupabaseClient = supabase
): Promise<MakerItem> {
  const amount = normalizeMakerAmount(input.amount)
  const selectedProducts = normalizeMakerProducts(input.selectedProducts)

  const validationError = validateMakerItem({
    kitchenId: input.kitchenId,
    transactionDate: input.transactionDate,
    accountId: input.accountId,
    amount,
    flowType: input.flowType,
    selectedProducts
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

  if (input.flowType === 'income' && selectedProducts.length > 0) {
    const accountOptions = await getMakerAccountOptions(
      input.kitchenId,
      'income',
      client
    )
    const account = accountOptions.find(
      (option) => option.accountId === input.accountId
    )

    if (!account) {
      throw new Error('Rekening RAB tidak ditemukan untuk dapur ini')
    }

    const invalidProduct = selectedProducts.find(
      (product) => !account.supplierProducts.includes(product)
    )

    if (invalidProduct) {
      throw new Error(
        `Produk ${invalidProduct} tidak terdaftar pada supplier rekening yang dipilih`
      )
    }
  }

  const { data, error } = await client
    .from('disbursement_maker_items')
    .insert({
      kitchen_id: input.kitchenId,
      transaction_date: input.transactionDate,
      account_id: input.accountId,
      amount,
      flow_type: input.flowType,
      selected_products: selectedProducts,
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
      selected_products,
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
    selectedProducts: Array.isArray(data.selected_products)
      ? data.selected_products
      : [],
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

  const { data: currentItem, error: fetchError } = await client
    .from('disbursement_maker_items')
    .select(
      `
      id,
      kitchen_id,
      transaction_date,
      account_id,
      amount,
      flow_type,
      selected_products,
      status,
      realized_transaction_id,
      created_at,
      updated_at
    `
    )
    .eq('id', makerItemId)
    .maybeSingle()

  if (fetchError) {
    throw fetchError
  }

  if (!currentItem) {
    throw new Error('Maker item tidak ditemukan')
  }

  const currentStatus = currentItem.status as MakerStatus

  if (
    currentStatus !== 'READY' &&
    currentStatus !== 'PROCESSED' &&
    currentStatus !== 'REALIZED'
  ) {
    throw new Error(`Status Maker tidak valid: ${String(currentItem.status)}`)
  }

  if (currentStatus === 'REALIZED') {
    throw new Error('Maker yang sudah direalisasikan tidak dapat diubah')
  }

  const allowedTransitions: Record<MakerStatus, MakerStatus[]> = {
    READY: ['READY', 'PROCESSED'],
    PROCESSED: ['PROCESSED', 'READY'],
    REALIZED: ['REALIZED']
  }

  const allowedStatuses = allowedTransitions[currentStatus]

  if (!allowedStatuses.includes(status)) {
    throw new Error(
      `Status ${currentStatus} tidak dapat diubah menjadi ${status}`
    )
  }

  if (status === 'REALIZED') {
    throw new Error(
      'Status REALIZED hanya dapat ditetapkan melalui proses realisasi batch'
    )
  }

  if (currentStatus === 'READY' && currentItem.realized_transaction_id) {
    throw new Error('Maker READY tidak boleh memiliki transaksi realisasi')
  }

  if (currentStatus === 'PROCESSED' && currentItem.realized_transaction_id) {
    throw new Error('Maker PROCESSED tidak boleh memiliki transaksi realisasi')
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
      selected_products,
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
    selectedProducts: Array.isArray(data.selected_products)
      ? data.selected_products
      : [],
    status: data.status,
    realizedTransactionId: data.realized_transaction_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
}

export async function deleteMakerItem(
  makerItemId: string,
  client: SupabaseClient = supabase
): Promise<void> {
  if (!makerItemId) {
    throw new Error('Maker item tidak ditemukan')
  }

  const { error } = await client
    .from('disbursement_maker_items')
    .delete()
    .eq('id', makerItemId)

  if (error) {
    throw error
  }
}

export async function realizeMakerItems(
  transactionDate: string,
  kitchenId: string,
  userId: string,
  client: SupabaseClient = supabase
): Promise<
  {
    makerItemId: string
    transactionId: string
  }[]
> {
  if (!transactionDate) {
    throw new Error('Tanggal wajib diisi')
  }

  if (!kitchenId) {
    throw new Error('Dapur wajib dipilih')
  }

  if (!userId) {
    throw new Error('User tidak ditemukan')
  }

  const { data, error } = await client.rpc('realize_disbursement_maker', {
    p_transaction_date: transactionDate,
    p_kitchen_id: kitchenId,
    p_user_id: userId
  })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (item: { maker_item_id: string; transaction_id: string }) => ({
      makerItemId: item.maker_item_id,
      transactionId: item.transaction_id
    })
  )
}
