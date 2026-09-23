import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type TransactionOption = {
  value: string
  label: string
}

export type KitchenOption = TransactionOption

export type TransactionFlow =
  | 'income'
  | 'expense'
  | 'gas'
  | 'ops_disbursement'
  | 'real_ops'

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
  flow_type: 'income' | 'gas'
  accounts: TransactionAccount | TransactionAccount[] | null
}

const SUKARAJA_NAME = 'Sukaraja'
const CIHAUR_NAME = 'Cihaur'
const TRANSACTION_OPTIONS_CACHE_TTL_MS = 30_000

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const transactionOptionsCache = new Map<string, CacheEntry<unknown>>()
const transactionOptionsInFlight = new Map<string, Promise<unknown>>()

function isDefaultClient(client: SupabaseClient): boolean {
  return client === supabase
}

async function withTransactionOptionsCache<T>(
  key: string,
  client: SupabaseClient,
  loader: () => Promise<T>
): Promise<T> {
  if (!isDefaultClient(client)) {
    return loader()
  }

  const now = Date.now()
  const cached = transactionOptionsCache.get(key) as
    | CacheEntry<T>
    | undefined

  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const pending = transactionOptionsInFlight.get(key) as
    | Promise<T>
    | undefined

  if (pending) {
    return pending
  }

  const request = loader()
    .then((value) => {
      transactionOptionsCache.set(key, {
        value,
        expiresAt: Date.now() + TRANSACTION_OPTIONS_CACHE_TTL_MS
      })
      return value
    })
    .finally(() => {
      transactionOptionsInFlight.delete(key)
    })

  transactionOptionsInFlight.set(key, request)
  return request
}

export function clearTransactionOptionsCache(): void {
  transactionOptionsCache.clear()
}

function isGasExcludedKitchen(name: string | null | undefined): boolean {
  const normalized = name?.trim().toLowerCase() ?? ''
  return normalized === SUKARAJA_NAME.toLowerCase() ||
    normalized === CIHAUR_NAME.toLowerCase()
}

async function getKitchenName(
  kitchenId: string,
  client: SupabaseClient
): Promise<string | null> {
  if (!kitchenId) {
    return null
  }

  return withTransactionOptionsCache(
    `kitchen-name:${kitchenId}`,
    client,
    async () => {
      const { data, error } = await client
        .from('kitchens')
        .select('name')
        .eq('id', kitchenId)
        .maybeSingle()

      if (error) {
        throw error
      }

      return data?.name ?? null
    }
  )
}

export function getOperationalDestination(
  kitchenName: string | null | undefined
): string | null {
  const normalized = kitchenName?.trim()

  return normalized ? `Akuntan ${normalized}` : null
}

export async function getActiveKitchens(
  client: SupabaseClient = supabase
): Promise<KitchenOption[]> {
  return withTransactionOptionsCache(
    'active-kitchens',
    client,
    async () => {
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
  )
}

export async function getActiveSuppliers(
  client: SupabaseClient = supabase
): Promise<TransactionOption[]> {
  return withTransactionOptionsCache(
    'active-suppliers',
    client,
    async () => {
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
  )
}

export async function getTransactionAccounts(
  kitchenId: string,
  flowType: 'income' | 'gas',
  client: SupabaseClient = supabase
): Promise<TransactionAccount[]> {
  if (!kitchenId) {
    return []
  }

  return withTransactionOptionsCache(
    `transaction-accounts:${kitchenId}:${flowType}`,
    client,
    async () => {
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
        .eq('flow_type', flowType === 'gas' ? 'neutral' : flowType)

      if (error) {
        throw error
      }

      const accounts = new Map<string, TransactionAccount>()

      for (const row of (data ?? []) as unknown as KitchenAccountRuleRow[]) {
        const account = Array.isArray(row.accounts)
          ? row.accounts[0]
          : row.accounts

        if (!account) {
          continue
        }

        const supplier = Array.isArray(account.income_suppliers)
          ? account.income_suppliers[0]
          : account.income_suppliers

        if (flowType === 'income' && !supplier) {
          continue
        }

        accounts.set(account.id, account)
      }

      return [...accounts.values()].sort((a, b) =>
        a.name.localeCompare(b.name, 'id')
      )
    }
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

function getGasAccountLabel(account: TransactionAccount): string {
  return `${account.name} (${account.bank} - ${account.account_number})`
}

export async function getAvailableTransactionFlows(
  kitchenId: string,
  client: SupabaseClient = supabase
): Promise<TransactionFlow[]> {
  if (!kitchenId) {
    return []
  }

  const kitchenName = await getKitchenName(kitchenId, client)

  if (!kitchenName) {
    return []
  }

  const flows: TransactionFlow[] = ['income', 'expense']

  if (!isGasExcludedKitchen(kitchenName)) {
    flows.push('gas')
  }

  flows.push('ops_disbursement', 'real_ops')

  return flows
}

export async function getAccountsForFlow(
  kitchenId: string,
  flowType: 'income' | 'gas',
  client: SupabaseClient = supabase
): Promise<TransactionOption[]> {
  const accounts = await getTransactionAccounts(kitchenId, flowType, client)

  return accounts.map((account) => ({
    value: account.id,
    label:
      flowType === 'income'
        ? getIncomeAccountLabel(account)
        : getGasAccountLabel(account)
  }))
}

export async function getSuppliersForKitchen(
  kitchenId: string,
  client: SupabaseClient = supabase
): Promise<TransactionOption[]> {
  return withTransactionOptionsCache(
    `suppliers-for-kitchen:${kitchenId || 'all'}`,
    client,
    async () => {
      const suppliers = await getActiveSuppliers(client)

      if (!kitchenId) {
        return suppliers
      }

      const kitchenName = await getKitchenName(kitchenId, client)
      const isSukaraja = kitchenName?.includes(SUKARAJA_NAME) ?? false

      if (!isSukaraja) {
        return suppliers.filter(
          (supplier) => supplier.label === 'Koperasi Arutala'
        )
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

      return suppliers.filter((supplier) =>
        mappedSupplierIds.has(supplier.value)
      )
    }
  )
}

export function getDefaultGasAccount(
  accounts: TransactionOption[]
): string {
  if (accounts.length === 1) {
    return accounts[0].value
  }

  const arutalaBni = accounts.find((account) =>
    /^KOPERASI ARUTALA(?:\s*\/.*)?\s*\(BNI\s*-\s*/i.test(
      account.label
    )
  )

  return arutalaBni?.value ?? ''
}

export function getDefaultSupplier(suppliers: TransactionOption[]): string {
  const arutala = suppliers.find(
    (supplier) => supplier.label === 'Koperasi Arutala'
  )

  return arutala?.value ?? ''
}
