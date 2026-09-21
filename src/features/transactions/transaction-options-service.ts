import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type TransactionOption = {
  value: string
  label: string
}

export type KitchenOption = TransactionOption

export type TransactionFlow = 'income' | 'expense' | 'neutral' | 'real_ops'

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

const TEMPORARY_OPERATIONAL_DESTINATIONS: Record<string, string> = {
  Sukaraja: 'Akuntan Sukaraja',
  Cihaur: 'Akuntan Cihaur'
}

export function getTemporaryOperationalDestination(
  kitchenName: string | null | undefined
): string | null {
  if (!kitchenName) {
    return null
  }

  return TEMPORARY_OPERATIONAL_DESTINATIONS[kitchenName] ?? null
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
  // Supplier options for Pembayaran Supplier still use the legacy
  // `suppliers` table because `transactions.supplier_id` and
  // `kitchen_supplier_rules.supplier_id` reference that table.
  // Supplier availability is determined by kitchen mapping, not is_active.
  const { data, error } = await client
    .from('suppliers')
    .select('id,name')
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

    // RAB/Income rows must resolve to a supplier identity.
    // Operational destinations are allowed without income_suppliers metadata.
    if (flowType === 'income' && !supplier) {
      continue
    }

    accounts.set(account.id, account)
  }

  return [...accounts.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'id')
  )
}

function getIncomeAccountLabel(account: TransactionAccount): string {
  const supplier = Array.isArray(account.income_suppliers)
    ? account.income_suppliers[0]
    : account.income_suppliers

  const businessName = supplier?.business_name?.trim() || account.name
  const ownerName = supplier?.owner_name?.trim()

  return ownerName ? `${businessName} / ${ownerName}` : businessName
}

function getOperationalAccountLabel(account: TransactionAccount): string {
  const supplier = Array.isArray(account.income_suppliers)
    ? account.income_suppliers[0]
    : account.income_suppliers

  const businessName = supplier?.business_name?.trim() || account.name

  const owner = supplier?.owner_name?.trim()
    ? ` / ${supplier.owner_name.trim()}`
    : ''

  if (!account.bank && !account.account_number) {
    return `${businessName}${owner}`
  }

  return `${businessName}${owner} (${account.bank} - ${account.account_number})`
}

export async function getAvailableTransactionFlows(
  kitchenId: string,
  client: SupabaseClient = supabase
): Promise<TransactionFlow[]> {
  if (!kitchenId) {
    return []
  }

  const { data: kitchen, error } = await client
    .from('kitchens')
    .select('id')
    .eq('id', kitchenId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!kitchen) {
    return []
  }

  // Semua kitchen sekarang memiliki empat alur transaksi.
  return ['income', 'expense', 'neutral', 'real_ops']
}

export async function getAccountsForFlow(
  kitchenId: string,
  flowType: 'income' | 'neutral',
  client: SupabaseClient = supabase
): Promise<TransactionOption[]> {
  const accounts = await getTransactionAccounts(kitchenId, flowType, client)

  return accounts.map((account) => ({
    value: account.id,
    label:
      flowType === 'income'
        ? getIncomeAccountLabel(account)
        : getOperationalAccountLabel(account)
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
  if (accounts.length === 1) {
    return accounts[0].value
  }

  const arutalaBni = accounts.find((account) =>
    /^KOPERASI ARUTALA(?:\s*\/.*)?\s*\(BNI\s*-\s*/i.test(account.label)
  )

  return arutalaBni?.value ?? ''
}

export function getDefaultSupplier(suppliers: TransactionOption[]): string {
  const arutala = suppliers.find(
    (supplier) => supplier.label === 'Koperasi Arutala'
  )

  return arutala?.value ?? ''
}
