import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { getAvailableOperationalTypes } from '@/features/transactions/operational-policy'

export type DashboardFlow =
  | 'income'
  | 'expense'
  | 'gas'
  | 'ops_disbursement'
  | 'real_ops'
  | 'operational_disbursement'
  | 'neutral'

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
  gas: number
  operational: number
  operationalDisbursement: number
  realOperational: number
  sppgRent: number
}

export type DashboardKitchen = {
  id: string
  name: string
  id_sppg: string | null
}

export type DashboardTransactionAccount = {
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

export type DashboardTransactionSupplier = {
  id: string
  name: string | null
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
  destination_label: string | null
  operational_type:
    | 'relawan_salary'
    | 'pic_incentive'
    | 'school_pic_incentive'
    | 'kader_incentive'
    | 'vehicle_rent'
    | 'sppg_rent'
    | null
  created_at: string
  accounts:
    | DashboardTransactionAccount
    | DashboardTransactionAccount[]
    | null
  suppliers:
    | DashboardTransactionSupplier
    | DashboardTransactionSupplier[]
    | null
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
    | {
        income?: number
        expense?: number
        gas?: number
        operational?: number
        operational_disbursement?: number
        real_operational?: number
        sppg_rent?: number
      }
    | undefined

  return {
    income: Number(row?.income ?? 0),
    expense: Number(row?.expense ?? 0),
    gas: Number(row?.gas ?? 0),
    operational: Number(row?.operational ?? 0),
    operationalDisbursement: Number(
      row?.operational_disbursement ?? 0
    ),
    realOperational: Number(row?.real_operational ?? 0),
    sppgRent: Number(row?.sppg_rent ?? 0)
  }
}

export async function getDashboardRABBalance(
  filters: DashboardFilters,
  client: SupabaseClient = supabase
): Promise<number> {
  const { data, error } = await client.rpc('get_dashboard_summary', {
    start_date: filters.startDate,
    end_date: filters.endDate,
    kitchen_uuid: filters.kitchenId || null,
    flow_types: null,
    supplier_filter: null
  })

  if (error) throw error

  const row = data?.[0] as
    | {
        income?: number
        expense?: number
      }
    | undefined

  return Number(row?.income ?? 0) - Number(row?.expense ?? 0)
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
  filters: Pick<DashboardFilters, 'kitchenId' | 'flowType'>,
  client: SupabaseClient = supabase
): Promise<{ value: string; label: string }[]> {
  if (filters.flowType === 'ops_disbursement') {
    const kitchenQuery = client
      .from('kitchens')
      .select('id,name')
      .eq('is_active', true)
      .order('name')

    if (filters.kitchenId) {
      kitchenQuery.eq('id', filters.kitchenId)
    }

    const { data, error } = await kitchenQuery

    if (error) throw error

    return (data ?? []).map((kitchen) => ({
      value: `Akuntan ${kitchen.name}`,
      label: `Akuntan ${kitchen.name}`
    }))
  }

  if (filters.flowType === 'gas') {
    let query = client
      .from('kitchen_account_rules')
      .select(
        `
        account_id,
        accounts(
          id,
          name,
          bank,
          account_number
        )
        `
      )
      .eq('flow_type', 'neutral')

    if (filters.kitchenId) {
      query = query.eq('kitchen_id', filters.kitchenId)
    }

    const { data, error } = await query

    if (error) throw error

    const options = new Map<string, { value: string; label: string }>()

    for (const row of data ?? []) {
      const account = Array.isArray(row.accounts)
        ? row.accounts[0]
        : row.accounts

      if (!account) continue

      options.set(account.id, {
        value: account.id,
        label: `${account.name} (${account.bank}${account.account_number ? ` - ${account.account_number}` : ''})`
      })
    }

    return [...options.values()].sort((a, b) =>
      a.label.localeCompare(b.label, 'id')
    )
  }

  if (filters.flowType === 'operational_disbursement') {
    return [
      { value: 'relawan_salary', label: 'Gaji Relawan' },
      { value: 'pic_incentive', label: 'Insentif PIC' },
      { value: 'vehicle_rent', label: 'Sewa Kendaraan' },
      { value: 'sppg_rent', label: 'Insentif Fasilitas SPPG' }
    ]
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
    .in('flow_type', ['income', 'gas', 'neutral', 'ops_disbursement'])

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
  client: SupabaseClient = supabase,
  includeCount = true,
  includeSppgRent = true
): Promise<DashboardTransactionPage> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.max(1, Math.floor(pageSize))
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  let query = client
    .from('transactions')
    .select(
      `
        id,
        transaction_date,
        flow_type,
        category,
        amount,
        note,
        kitchen_id,
        account_id,
        supplier_id,
        destination_label,
        operational_type,
        created_at,
        accounts(
          id,
          name,
          bank,
          account_number,
          income_suppliers(
            business_name,
            owner_name
          )
        ),
        suppliers(
          id,
          name
        )
      `,
      includeCount ? { count: 'exact' } : {}
    )
    .gte('transaction_date', filters.startDate)
    .lte('transaction_date', filters.endDate)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    // Stable unique tie-breaker: batches commonly share the same created_at.
    .order('id', { ascending: true })
    .range(from, to)

  if (filters.kitchenId) {
    query = query.eq('kitchen_id', filters.kitchenId)
  }

  if (!includeSppgRent && filters.flowType !== 'operational_disbursement') {
    query = query.neq('flow_type', 'operational_disbursement')
  }

  if (filters.flowType) {
    query =
      filters.flowType === 'gas'
        ? query.in('flow_type', ['gas', 'neutral'])
        : query.eq('flow_type', filters.flowType)
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
    } else if (filters.flowType === 'gas') {
      query = query.eq('account_id', filters.supplierFilter)
    } else if (filters.flowType === 'ops_disbursement') {
      query = query.eq('destination_label', filters.supplierFilter)
    } else if (filters.flowType === 'operational_disbursement') {
      query = query.eq('operational_type', filters.supplierFilter)
    } else if (filters.flowType === 'real_ops') {
      // Real / Ops intentionally has no account filter.
    } else {
      query = query
        .in('flow_type', ['income', 'gas', 'neutral'])
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
  client: SupabaseClient = supabase,
  includeSppgRent = false
): Promise<{
  withPencairan: number
  empty: number
  rows: {
    kitchenId: string
    kitchen: string
    status: 'has_pencairan' | 'empty'
    income: boolean
    transactionCount: number
    expense: boolean
    gas: boolean
    gasAvailable: boolean
    operational: boolean
    realOperational: boolean
    sppgRent: boolean
    relawanSalaryAvailable: boolean
    picIncentiveAvailable: boolean
    relawanSalary: boolean
    picIncentive: boolean

  }[]
}> {
  const [
    { data, error },
    { data: incomeRows, error: incomeError },
    { data: operationalRows, error: operationalError },
    { data: sppgRentRows, error: sppgRentError }
  ] = await Promise.all([
    client.rpc('get_dashboard_daily_status', {
      p_selected_date: selectedDate
    }),
    client
      .from('transactions')
      .select('kitchen_id')
      .eq('transaction_date', selectedDate)
      .in('flow_type', [
        'income',
        'gas',
        'neutral',
        'ops_disbursement',
        'operational_disbursement'
      ]),
    client
      .from('transactions')
      .select('kitchen_id, operational_type')
      .eq('transaction_date', selectedDate)
      .eq('flow_type', 'operational_disbursement')
      .in('operational_type', ['relawan_salary', 'pic_incentive']),
    includeSppgRent
      ? client
          .from('transactions')
          .select('kitchen_id')
          .eq('transaction_date', selectedDate)
          .eq('flow_type', 'operational_disbursement')
          .eq('operational_type', 'sppg_rent')
      : Promise.resolve({ data: [], error: null })
  ])

  if (error) throw error
  if (incomeError) throw incomeError
  if (operationalError) throw operationalError
  if (sppgRentError) throw sppgRentError

  type DashboardDailyStatusRpcRow = {
    kitchen_id: string
    kitchen_name: string | null
    income: boolean | null
    expense: boolean | null
    gas: boolean | null
    operational: boolean | null
    real_operational: boolean | null
  }

  const typedData = (data ?? []) as DashboardDailyStatusRpcRow[]
  const disbursementTransactionCountByKitchen = new Map<string, number>()
  const sppgRentByKitchen = new Set<string>()
  const operationalTypesByKitchen = new Map<string, Set<string>>()

  for (const row of incomeRows ?? []) {
    if (!row.kitchen_id) continue

    disbursementTransactionCountByKitchen.set(
      row.kitchen_id,
      (disbursementTransactionCountByKitchen.get(row.kitchen_id) ?? 0) + 1
    )
  }

  for (const row of sppgRentRows ?? []) {
    if (row.kitchen_id) {
      sppgRentByKitchen.add(row.kitchen_id)
    }
  }

  for (const row of operationalRows ?? []) {
    if (!row.kitchen_id || !row.operational_type) continue

    const operationalTypes =
      operationalTypesByKitchen.get(row.kitchen_id) ?? new Set<string>()
    operationalTypes.add(row.operational_type)
    operationalTypesByKitchen.set(row.kitchen_id, operationalTypes)
  }

  let withPencairan = 0
  let empty = 0

  const rows = typedData.map((row) => {
    const normalizedKitchenName =
      row.kitchen_name?.trim().toLowerCase() ?? ''

    const gasAvailable =
      normalizedKitchenName !== 'sukaraja' &&
      normalizedKitchenName !== 'cihaur'

    const gas = gasAvailable && Boolean(row.gas)
    const income = Boolean(row.income)
    const transactionCount =
      disbursementTransactionCountByKitchen.get(row.kitchen_id) ?? 0
    const expense = Boolean(row.expense)
    const operational = Boolean(row.operational)
    const realOperational = Boolean(row.real_operational)
    const sppgRent = includeSppgRent && sppgRentByKitchen.has(row.kitchen_id)
    const availableOperationalTypes = getAvailableOperationalTypes(
      row.kitchen_name,
      selectedDate
    )
    const recordedOperationalTypes =
      operationalTypesByKitchen.get(row.kitchen_id)
    const relawanSalaryAvailable =
      availableOperationalTypes.includes('relawan_salary')
    const picIncentiveAvailable =
      availableOperationalTypes.includes('pic_incentive')
    const relawanSalary =
      relawanSalaryAvailable &&
      Boolean(recordedOperationalTypes?.has('relawan_salary'))
    const picIncentive =
      picIncentiveAvailable &&
      Boolean(recordedOperationalTypes?.has('pic_incentive'))

    // Status pencairan menunjukkan keberadaan transaksi Pencairan / RAB.
    const hasPencairan = income
    const status: 'has_pencairan' | 'empty' = hasPencairan
      ? 'has_pencairan'
      : 'empty'

    if (hasPencairan) withPencairan += 1
    else empty += 1

    return {
      kitchenId: row.kitchen_id,
      kitchen: row.kitchen_name ?? 'Dapur tidak diketahui',
      status,
      income,
      transactionCount,
      expense,
      gas,
      gasAvailable,
      operational,
      realOperational,
      sppgRent,
      relawanSalaryAvailable,
      picIncentiveAvailable,
      relawanSalary,
      picIncentive,
    }
  })

  return { withPencairan, empty, rows }
}
