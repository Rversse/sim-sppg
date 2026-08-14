import type { SupabaseClient } from '@Supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type TransactionOption = {
  value: string
  label: string
}

export type KitchenOption = TransactionOption

export type TransactionFlow = 'income' | 'expense' | 'neutral'

export type TransactionAccount = {
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

type KitchenAccountRuleRow = {
  kitchen_id: string
  flow_type: 'income' | 'neutral'
  accounts: TransactionAccount | TransactionAccount[] | null
}

const SUKARAJA_NAME = 'Sukaraja'
const CIHAUR_NAME = 'Cihaur'

function isOperationalExcludedKitchen(
  name: string | null | undefined
): boolean {
  return name === SUKARAJA_NAME || name === CIHAUR_NAME
}

export async function getActiveKitchens(
  client: SupabaseClient = supabase
): Promise<KitchenOption[]> {
  const { data, error } = await client
    .from('kitchens')
    .select('id,name')
    .eq('is_active', true)
    .order('name')

  if (error) {
    throw error
  }

  return (data ?? []).map((kitchen) => ({
    value: kitchen.id,
    label: kitchen.name
  }))
}

export async function getActiveSuppliers(
  client: SupabaseClient = supabase
): Promise<TransactionOption[]> {
  const { data, error } = await client
    .from('suppliers')
    .select('id,name')
    .eq('is_active', true)
    .order('name')

  if (error) {
    throw error
  }

  return (data ?? []).map((supplier) => ({
    value: supplier.id,
    label: supplier.name
  }))
}

export async function getTransactionAccounts(
  kitchenId: string,
  flowType: 'income' | 'neutral',
  client: SupabaseClient = supabase
): Promise<TransactionAccount[]> {
  if (!kitchenId) {
    return []
  }

  const { data, error } = await client
    .from('kitchen_account_rules')
    .select(
      `
      kitchen_id,
      flow_type,
      accounts(
        id,
        name,
        bank,
        account_number,
        income_suppliers(
          business_name,
          owner_name
        )
      )
    `
    )
    .eq('kitchen_id', kitchenId)
    .eq('flow_type', flowType)

  if (error) {
    throw error
  }

  const accounts = new Map<string, TransactionAccount>()

  for (const row of (data ?? []) as unknown as KitchenAccountRuleRow[]) {
    const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts

    if (!account) {
      continue
    }

    const supplier = Array.isArray(account.income_suppliers)
      ? account.income_suppliers[0]
      : account.income_suppliers

    // RAB/Income availability is determined by the kitchen_account_rules mapping.
    // income_suppliers.is_active is no longer part of the model.
    if (!supplier) {
      continue
    }

    accounts.set(account.id, account)
  }

  return [...accounts.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'id')
  )
}

export function getAccountLabel(account: TransactionAccount): string {
  const supplier = Array.isArray(account.income_suppliers)
    ? account.income_suppliers[0]
    : account.income_suppliers

  const owner = supplier?.owner_name ? ` / ${supplier.owner_name}` : ''

  return `${account.name}${owner} (${account.bank} - ${account.account_number})`
}

export async function getAvailableTransactionFlows(
  kitchenId: string,
  client: SupabaseClient = supabase
): Promise<TransactionFlow[]> {
  if (!kitchenId) {
    return []
  }

  const { data: kitchen, error: kitchenError } = await client
    .from('kitchens')
    .select('name')
    .eq('id', kitchenId)
    .maybeSingle()

  if (kitchenError) {
    throw kitchenError
  }

  const { data: rules, error } = await client
    .from('kitchen_account_rules')
    .select('flow_type')
    .eq('kitchen_id', kitchenId)

  if (error) {
    throw error
  }

  const hasNeutralRule = (rules ?? []).some(
    (row) => row.flow_type === 'neutral'
  )

  const flows: TransactionFlow[] = ['income', 'expense']

  if (hasNeutralRule && !isOperationalExcludedKitchen(kitchen?.name)) {
    flows.push('neutral')
  }

  return flows
}

export async function getAccountsForFlow(
  kitchenId: string,
  flowType: 'income' | 'neutral',
  client: SupabaseClient = supabase
): Promise<TransactionOption[]> {
  const accounts = await getTransactionAccounts(kitchenId, flowType, client)

  return accounts.map((account) => ({
    value: account.id,
    label: getAccountLabel(account)
  }))
}

export async function getSuppliersForKitchen(
  kitchenId: string,
  client: SupabaseClient = supabase
): Promise<TransactionOption[]> {
  const suppliers = await getActiveSuppliers(client)

  if (!kitchenId) {
    return suppliers
  }

  const { data: kitchen, error: kitchenError } = await client
    .from('kitchens')
    .select('name')
    .eq('id', kitchenId)
    .maybeSingle()

  if (kitchenError) {
    throw kitchenError
  }

  const isSukaraja = kitchen?.name?.includes(SUKARAJA_NAME) ?? false

  if (!isSukaraja) {
    return suppliers.filter((supplier) => supplier.label === 'Koperasi Arutala')
  }

  const { data: rules, error: rulesError } = await client
    .from('kitchen_supplier_rules')
    .select('supplier_id')
    .eq('kitchen_id', kitchenId)

  if (rulesError) {
    throw rulesError
  }

  const mappedSupplierIds = new Set(
    (rules ?? []).map((rule) => rule.supplier_id)
  )

  return suppliers.filter((supplier) => mappedSupplierIds.has(supplier.value))
}

export function getDefaultOperationalAccount(
  accounts: TransactionOption[]
): string {
  const arutalaBniAccounts = accounts.filter((account) =>
    /^ARUTALA(?:\s*\/.*)?\s*\(BNI\s*-\s*/i.test(account.label)
  )

  // Never choose an arbitrary BNI account. Auto-select only when the
  // mapped operational options identify exactly one ARUTALA BNI account.
  return arutalaBniAccounts.length === 1 ? arutalaBniAccounts[0].value : ''
}

export function getDefaultSupplier(suppliers: TransactionOption[]): string {
  const arutala = suppliers.find(
    (supplier) => supplier.label === 'Koperasi Arutala'
  )

  return arutala?.value ?? ''
}
