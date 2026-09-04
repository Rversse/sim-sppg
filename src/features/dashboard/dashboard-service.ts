import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type DashboardFlow = 'income' | 'expense' | 'neutral'

export type DashboardFilters = {
  startDate: string
  endDate: string
  kitchenId: string
  flowType: DashboardFlow | ''
  supplierFilter: string
}

export type DashboardSummary = {
  income: number
  expense: number
  operational: number
}

export type DashboardKitchen = {
  id: string
  name: string
  id_sppg: string | null
}

export type DashboardTransaction = {
  id: string
  transaction_date: string
  flow_type: DashboardFlow
  category: string | null
  amount: number
  note: string | null
  kitchen_id: string | null
  account_id: string | null
  supplier_id: string | null
  created_at: string
}

export type DashboardTransactionPage = {
  data: DashboardTransaction[]
  total: number
}

const SUPPLIER_NAMES = [
  'Koperasi Arutala',
  'Sukalarang',
  'Aris',
  'Babinsa'
] as const

const OPERATIONAL_EXCLUDED_KITCHENS = ['Sukaraja', 'Cihaur'] as const

function isOperationalExcludedKitchen(
  name: string | null | undefined
): boolean {
  return (
    name === OPERATIONAL_EXCLUDED_KITCHENS[0] ||
    name === OPERATIONAL_EXCLUDED_KITCHENS[1]
  )
}

export async function getDashboardSummary(
  filters: DashboardFilters,
  client: SupabaseClient = supabase
): Promise<DashboardSummary> {
  const flowTypes = filters.flowType ? [filters.flowType] : null

  const { data, error } = await client.rpc('get_dashboard_summary', {
    start_date: filters.startDate,
    end_date: filters.endDate,
    kitchen_uuid: filters.kitchenId || null,
    flow_types: flowTypes,
    supplier_filter: filters.supplierFilter || null
  })

  if (error) throw error

  const row = data?.[0] as
    | { income?: number; expense?: number; operational?: number }
    | undefined

  return {
    income: Number(row?.income ?? 0),
    expense: Number(row?.expense ?? 0),
    operational: Number(row?.operational ?? 0)
  }
}

export async function getActiveKitchens(
  client: SupabaseClient = supabase
): Promise<DashboardKitchen[]> {
  const { data, error } = await client
    .from('kitchens')
    .select('id,name,id_sppg')
    .eq('is_active', true)
    .order('name')

  if (error) throw error

  return (data ?? []) as DashboardKitchen[]
}

async function getSupplierIdByName(
  supplierName: string,
  client: SupabaseClient
): Promise<string | null> {
  const { data, error } = await client
    .from('suppliers')
    .select('id')
    .eq('name', supplierName)
    .maybeSingle()

  if (error) throw error

  return data?.id ?? null
}

async function getSelectedKitchenName(
  kitchenId: string,
  client: SupabaseClient
): Promise<string | null> {
  const { data, error } = await client
    .from('kitchens')
    .select('name')
    .eq('id', kitchenId)
    .maybeSingle()

  if (error) throw error

  return data?.name ?? null
}

export async function getSupplierOptions(
  filters: Pick<
    DashboardFilters,
    'startDate' | 'endDate' | 'kitchenId' | 'flowType'
  >,
  client: SupabaseClient = supabase
): Promise<{ value: string; label: string }[]> {
  if (filters.flowType === 'neutral') {
    const { data: account, error: accountError } = await client
      .from('accounts')
      .select('id,name,bank,account_category')
      .eq('name', 'ARUTALA')
      .eq('bank', 'BNI')
      .eq('account_category', 'supplier')
      .maybeSingle()

    if (accountError) throw accountError
    if (!account) return []

    if (filters.kitchenId) {
      const { data: rule, error: ruleError } = await client
        .from('kitchen_account_rules')
        .select('account_id')
        .eq('kitchen_id', filters.kitchenId)
        .eq('flow_type', 'neutral')
        .eq('account_id', account.id)
        .maybeSingle()

      if (ruleError) throw ruleError
      if (!rule) return []
    }

    return [{ value: account.id, label: 'Koperasi Arutala BNI' }]
  }

  if (filters.flowType === 'expense') {
    const kitchenName = filters.kitchenId
      ? await getSelectedKitchenName(filters.kitchenId, client)
      : null

    const isSukaraja = kitchenName?.includes('Sukaraja') ?? false
    const names =
      isSukaraja || !filters.kitchenId ? SUPPLIER_NAMES : ['Koperasi Arutala']

    return names.map((name) => ({ value: name, label: name }))
  }

  const query = client
    .from('kitchen_account_rules')
    .select(
      `
      kitchen_id,
      flow_type,
      accounts!inner(
        id,
        name,
        bank,
        account_category,
        income_suppliers!inner(
          business_name,
          owner_name
        )
      )
      `
    )
    .eq('flow_type', 'income')

  if (filters.kitchenId) {
    query.eq('kitchen_id', filters.kitchenId)
  }

  const { data, error } = await query

  if (error) throw error

  const accounts = new Map<string, { name: string; bank: string }>()

  for (const row of data ?? []) {
    const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts

    if (!account || account.account_category !== 'supplier') continue

    const supplier = Array.isArray(account.income_suppliers)
      ? account.income_suppliers[0]
      : account.income_suppliers

    if (!supplier) continue

    accounts.set(account.id, {
      name: account.name,
      bank: account.bank
    })
  }

  return [...accounts.entries()]
    .map(([value, account]) => ({
      value,
      label: `${account.name} - ${account.bank}`
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export async function getDashboardTransactionPage(
  filters: DashboardFilters,
  page: number,
  pageSize: number,
  client: SupabaseClient = supabase
): Promise<DashboardTransactionPage> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.max(1, Math.floor(pageSize))
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  let query = client
    .from('transactions')
    .select(
      'id,transaction_date,flow_type,category,amount,note,kitchen_id,account_id,supplier_id,created_at',
      { count: 'exact' }
    )
    .gte('transaction_date', filters.startDate)
    .lte('transaction_date', filters.endDate)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters.kitchenId) {
    query = query.eq('kitchen_id', filters.kitchenId)
  }

  if (filters.flowType) {
    query = query.eq('flow_type', filters.flowType)
  }

  if (filters.supplierFilter) {
    if (filters.flowType === 'expense') {
      const supplierId = await getSupplierIdByName(
        filters.supplierFilter,
        client
      )

      if (!supplierId) {
        return { data: [], total: 0 }
      }

      query = query.eq('supplier_id', supplierId)
    } else if (filters.flowType === 'income') {
      query = query.eq('account_id', filters.supplierFilter)
    } else if (filters.flowType === 'neutral') {
      query = query.eq('account_id', filters.supplierFilter)
    } else {
      query = query
        .in('flow_type', ['income', 'neutral'])
        .eq('account_id', filters.supplierFilter)
    }
  }

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: (data ?? []) as DashboardTransaction[],
    total: count ?? 0
  }
}

export async function getDailyStatus(
  selectedDate: string,
  client: SupabaseClient = supabase
): Promise<{
  green: number
  yellow: number
  red: number
  rows: {
    kitchen: string
    completed: number
    required: number
    income: boolean
    expense: boolean
    operational: boolean
  }[]
}> {
  const [kitchensResult, transactionsResult] = await Promise.all([
    client
      .from('kitchens')
      .select('id,name')
      .eq('is_active', true)
      .order('name'),
    client
      .from('transactions')
      .select('kitchen_id,flow_type')
      .eq('transaction_date', selectedDate)
  ])

  if (kitchensResult.error) throw kitchensResult.error
  if (transactionsResult.error) throw transactionsResult.error

  const transactionMap = new Map<string, DashboardFlow[]>()

  for (const transaction of transactionsResult.data ?? []) {
    const current = transactionMap.get(transaction.kitchen_id) ?? []
    current.push(transaction.flow_type as DashboardFlow)
    transactionMap.set(transaction.kitchen_id, current)
  }

  let green = 0
  let yellow = 0
  let red = 0

  const rows = (kitchensResult.data ?? []).map((kitchen) => {
    const flows = transactionMap.get(kitchen.id) ?? []
    const income = flows.includes('income')
    const expense = flows.includes('expense')
    const operational = flows.includes('neutral')
    const needsOperational = !isOperationalExcludedKitchen(kitchen.name)
    const required = needsOperational ? 3 : 2
    const completed =
      Number(income) + Number(expense) + Number(needsOperational && operational)

    if (completed === required) green += 1
    else if (completed === 0) red += 1
    else yellow += 1

    return {
      kitchen: kitchen.name,
      completed,
      required,
      income,
      expense,
      operational
    }
  })

  return { green, yellow, red, rows }
}
