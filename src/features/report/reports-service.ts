import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { isOperationalTypeAvailable } from '@/features/transactions/operational-policy'

export type ReportKitchen = {
  id: string
  name: string
  operationalRecipientName: string | null
}

export type ReportFilters = {
  startDate: string
  endDate: string
  kitchenId: string
}

export type OverallKitchenReport = {
  kitchenId: string
  kitchenName: string
  recipientName: string | null
  sppgRentMapped: boolean
  vehicleRentMapped: boolean
  relawanSalaryMapped: boolean
  picIncentiveMapped: boolean
  income: number
  expense: number
  gas: number
  operational: number
  realOperational: number
  relawanSalary: number
  picIncentive: number
  vehicleRent: number
  sppgRent: number
  totalSalaryAndIncentive: number
  totalRAB: number
  totalOperational: number
}

export type OverallDailyReport = {
  date: string
  income: number
  expense: number
  gas: number
  operational: number
  realOperational: number
  sppgRent: number
  totalRAB: number
  totalOperational: number
}

export type OtherIncomeReportRow = {
  date: string
  accountName: string
  amount: number
  note: string
}

export type OverallReport = {
  kitchens: OverallKitchenReport[]
  daily: OverallDailyReport[]
  otherIncome: OtherIncomeReportRow[]
  totals: {
    income: number
    expense: number
    gas: number
    operational: number
    realOperational: number
    relawanSalary: number
    picIncentive: number
    vehicleRent: number
    sppgRent: number
    totalSalaryAndIncentive: number
    totalRAB: number
    totalOperational: number
  }
}

export type IncomeReportRow = {
  supplierName: string
  ownerName: string
  bank: string
  total: number
  dates: Record<string, number>
}

export type IncomeReport = {
  rows: IncomeReportRow[]
  grandTotal: number
}

export type SupplierSummaryRow = {
  kitchenName: string
  Arutala: number
  Sukalarang: number
  Aris: number
  Babinsa: number
  Total: number
}

export type SupplierDailyRow = {
  date: string
  kitchens: SupplierSummaryRow[]
}

export type SupplierReport = {
  summaryRows: SupplierSummaryRow[]
  dailyRows: SupplierDailyRow[]
  totals: {
    Arutala: number
    Sukalarang: number
    Aris: number
    Babinsa: number
    Total: number
  }
}

export type SppgRentKitchenRow = {
  kitchenId: string
  kitchenName: string
  dayCount: number
  total: number
}

export type SppgRentDailyRow = {
  date: string
  kitchenId: string
  kitchenName: string
  amount: number
}

export type SppgRentReport = {
  rows: SppgRentKitchenRow[]
  dailyRows: SppgRentDailyRow[]
  grandTotal: number
}

export type OperationalType =
  | 'relawan_salary'
  | 'pic_incentive'
  | 'school_pic_incentive'
  | 'kader_incentive'
  | 'vehicle_rent'
  | 'sppg_rent'

type UnifiedOperationalType = Exclude<
  OperationalType,
  'school_pic_incentive' | 'kader_incentive'
>

function normalizeOperationalType(
  type: OperationalType
): UnifiedOperationalType {
  if (type === 'school_pic_incentive' || type === 'kader_incentive') {
    return 'pic_incentive'
  }

  return type
}

export type OperationalDisbursementRow = {
  kitchenId: string
  kitchenName: string
  operationalType: UnifiedOperationalType
  total: number
}

export type OperationalDisbursementReport = {
  rows: OperationalDisbursementRow[]
  grandTotal: number
}

export function getOperationalKitchenLabel(
  kitchenName: string,
  recipientName: string | null
) {
  const recipient = recipientName?.trim()
  return recipient ? `${kitchenName} (${recipient})` : kitchenName
}

export function getOperationalTypeLabel(type: OperationalType) {
  switch (type) {
    case 'relawan_salary':
      return 'Gaji Relawan'
    case 'pic_incentive':
    case 'school_pic_incentive':
    case 'kader_incentive':
      return 'Insentif PIC'
    case 'vehicle_rent':
      return 'Sewa Kendaraan'
    case 'sppg_rent':
      return 'Sewa SPPG'
  }
}


type ReportTransaction = {
  amount: number | string | null
  transaction_date: string
  flow_type:
    | 'income'
    | 'expense'
    | 'gas'
    | 'ops_disbursement'
    | 'real_ops'
    | 'operational_disbursement'
    | 'neutral'
  kitchen_id: string | null
  note: string | null
  operational_type:
    | 'relawan_salary'
    | 'pic_incentive'
    | 'school_pic_incentive'
    | 'kader_incentive'
    | 'vehicle_rent'
    | 'sppg_rent'
    | null
  created_at: string
  maker_import_batch_id: string | null
  maker_import_line_number: number | null
  suppliers?:
    | {
        name: string | null
      }
    | {
        name: string | null
      }[]
    | null
  kitchens?: {
    id: string
    name: string
  } | null
  accounts?: {
    name: string | null
    bank: string | null
    account_number: string | null
    income_suppliers?: {
      owner_name: string | null
    } | null
  } | null
}

function getAmount(value: number | string | null) {
  return Number(value ?? 0) || 0
}

function getSupplierName(
  supplier:
    | {
        name: string | null
      }
    | {
        name: string | null
      }[]
    | null
    | undefined
) {
  if (Array.isArray(supplier)) {
    return supplier[0]?.name ?? '-'
  }

  return supplier?.name ?? '-'
}

function createSupplierValues(): Omit<SupplierSummaryRow, 'kitchenName'> {
  return {
    Arutala: 0,
    Sukalarang: 0,
    Aris: 0,
    Babinsa: 0,
    Total: 0
  }
}

function createSupplierTotals() {
  return {
    Arutala: 0,
    Sukalarang: 0,
    Aris: 0,
    Babinsa: 0,
    Total: 0
  }
}

async function getReportTransactions(
  filters: ReportFilters,
  client: SupabaseClient
): Promise<ReportTransaction[]> {
  const pageSize = 1000
  const transactions: ReportTransaction[] = []

  for (let from = 0; ; from += pageSize) {
    let query = client
      .from('transactions')
      .select(
        `
        amount,
        transaction_date,
        flow_type,
        note,
        operational_type,
        kitchen_id,
        created_at,
        maker_import_batch_id,
        maker_import_line_number,

        kitchens (
          id,
          name,
          operational_recipient_name
        ),

        suppliers (
          name
        ),

        accounts (
          name,
          bank,
          account_number,

          income_suppliers (
            owner_name
          )
        )
      `
      )
      .gte('transaction_date', filters.startDate)
      .lte('transaction_date', filters.endDate)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('maker_import_batch_id', { ascending: true, nullsFirst: false })
      .order('maker_import_line_number', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (filters.kitchenId) {
      query = query.eq('kitchen_id', filters.kitchenId)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    const page = (data ?? []) as unknown as ReportTransaction[]

    transactions.push(...page)

    if (page.length < pageSize) {
      break
    }
  }

  return transactions
}

export async function getActiveKitchens(
  client: SupabaseClient = supabase
): Promise<ReportKitchen[]> {
  const { data, error } = await client
    .from('kitchens')
    .select('id,name,operational_recipient_name')
    .eq('is_active', true)
    .order('name')

  if (error) {
    throw error
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    operationalRecipientName: item.operational_recipient_name ?? null
  })) as ReportKitchen[]
}

type ReportOperationalRuleType =
  | 'ops_harian'
  | 'sppg_rent'
  | 'vehicle_rent'
  | 'gaji_relawan'
  | 'pic_incentive_school'
  | 'pic_incentive_posyandu'

type ReportOperationalRule = {
  kitchen_id: string
  rule_type: ReportOperationalRuleType
  owner_name: string | null
  is_active: boolean
  mapping_status: 'active' | 'excluded'
  target_role: string | null
}

async function getOperationalAccountRules(
  client: SupabaseClient = supabase
): Promise<ReportOperationalRule[]> {
  const { data, error } = await client
    .from('kitchen_operational_account_rules')
    .select('kitchen_id,rule_type,owner_name,is_active,mapping_status,target_role')

  if (error) {
    throw error
  }

  return (data ?? []) as ReportOperationalRule[]
}

function isReportMappingEnabled(rule: ReportOperationalRule | undefined): boolean {
  return Boolean(rule && rule.is_active && rule.mapping_status === 'active')
}

function getMappingRuleTypesForOperationalType(
  type: OperationalType | null | undefined
): ReportOperationalRuleType[] {
  switch (type) {
    case 'relawan_salary':
      return ['gaji_relawan']
    case 'pic_incentive':
      return ['pic_incentive_school', 'pic_incentive_posyandu']
    case 'school_pic_incentive':
      return ['pic_incentive_school']
    case 'kader_incentive':
      return ['pic_incentive_posyandu']
    case 'vehicle_rent':
      return ['vehicle_rent']
    case 'sppg_rent':
      return ['sppg_rent']
    default:
      return []
  }
}

function isOperationalMappingEnabled(
  rulesByKitchen: Map<string, ReportOperationalRule[]>,
  kitchenId: string,
  type: OperationalType | null | undefined
): boolean {
  const types = getMappingRuleTypesForOperationalType(type)
  if (!types.length) return false

  const rules = rulesByKitchen.get(kitchenId) ?? []
  return types.some((ruleType) =>
    rules.some((rule) =>
      rule.rule_type === ruleType && isReportMappingEnabled(rule)
    )
  )
}

function getReportRecipientName(
  rules: ReportOperationalRule[]
): string | null {
  const eligible = rules.filter(isReportMappingEnabled)
  const sppgRecipient = eligible.find((rule) => rule.rule_type === 'sppg_rent')
    ?.owner_name?.trim()
  if (sppgRecipient) return sppgRecipient

  const picYayasanRecipient = eligible.find(
    (rule) => rule.rule_type === 'ops_harian' && rule.target_role === 'pic_yayasan'
  )?.owner_name?.trim()
  return picYayasanRecipient || null
}

export async function getOverallReport(
  filters: ReportFilters,
  client: SupabaseClient = supabase
): Promise<OverallReport> {
  const [kitchens, transactions, operationalRules] = await Promise.all([
    getActiveKitchens(client),
    getReportTransactions(filters, client),
    getOperationalAccountRules(client)
  ])

  const rulesByKitchen = new Map<string, ReportOperationalRule[]>()
  for (const rule of operationalRules) {
    const current = rulesByKitchen.get(rule.kitchen_id) ?? []
    current.push(rule)
    rulesByKitchen.set(rule.kitchen_id, current)
  }

  const activeRule = (kitchenId: string, ruleTypes: ReportOperationalRuleType[]) =>
    (rulesByKitchen.get(kitchenId) ?? []).find((rule) =>
      ruleTypes.includes(rule.rule_type) && isReportMappingEnabled(rule)
    )

  const grouped = new Map<string, OverallKitchenReport>()

  for (const kitchen of kitchens) {
    const kitchenRules = rulesByKitchen.get(kitchen.id) ?? []
    grouped.set(kitchen.id, {
      kitchenId: kitchen.id,
      kitchenName: kitchen.name,
      recipientName: getReportRecipientName(kitchenRules),
      sppgRentMapped: Boolean(activeRule(kitchen.id, ['sppg_rent'])),
      vehicleRentMapped: Boolean(activeRule(kitchen.id, ['vehicle_rent'])),
      relawanSalaryMapped: Boolean(activeRule(kitchen.id, ['gaji_relawan'])),
      picIncentiveMapped: Boolean(activeRule(kitchen.id, ['pic_incentive_school', 'pic_incentive_posyandu'])),
      income: 0,
      expense: 0,
      gas: 0,
      operational: 0,
      realOperational: 0,
      relawanSalary: 0,
      picIncentive: 0,
      vehicleRent: 0,
      sppgRent: 0,
      totalSalaryAndIncentive: 0,
      totalRAB: 0,
      totalOperational: 0
    })
  }

  const daily = new Map<string, OverallDailyReport>()
  const otherIncomeRows: OtherIncomeReportRow[] = []

  for (const transaction of transactions) {
    if (!transaction.kitchen_id) {
      if (transaction.flow_type === 'income') {
        otherIncomeRows.push({
          date: transaction.transaction_date,
          accountName:
            transaction.accounts?.name?.trim() || 'Rekening tidak diketahui',
          amount: getAmount(transaction.amount),
          note: transaction.note?.trim() || '-'
        })
      }

      continue
    }

    const kitchen = grouped.get(transaction.kitchen_id)

    if (!kitchen) {
      continue
    }

    const amount = getAmount(transaction.amount)

    if (transaction.flow_type === 'income') {
      kitchen.income += amount
    } else if (transaction.flow_type === 'expense') {
      kitchen.expense += amount
    } else if (
      transaction.flow_type === 'gas' ||
      transaction.flow_type === 'neutral'
    ) {
      kitchen.gas += amount
    } else if (transaction.flow_type === 'ops_disbursement') {
      kitchen.operational += amount
    } else if (transaction.flow_type === 'real_ops') {
      kitchen.realOperational += amount
    } else if (transaction.flow_type === 'operational_disbursement') {
      if (
        isOperationalTypeAvailable(
          kitchen.kitchenName,
          transaction.operational_type,
          transaction.transaction_date
        ) &&
        isOperationalMappingEnabled(
          rulesByKitchen,
          transaction.kitchen_id,
          transaction.operational_type
        )
      ) {
        switch (transaction.operational_type) {
          case 'relawan_salary':
            kitchen.relawanSalary += amount
            break
          case 'pic_incentive':
          case 'school_pic_incentive':
          case 'kader_incentive':
            kitchen.picIncentive += amount
            break
          case 'vehicle_rent':
            kitchen.vehicleRent += amount
            break
          case 'sppg_rent':
            kitchen.sppgRent += amount
            break
        }
      }
    }

    let dailyRow = daily.get(transaction.transaction_date)

    if (!dailyRow) {
      dailyRow = {
        date: transaction.transaction_date,
        income: 0,
        expense: 0,
        gas: 0,
        operational: 0,
        realOperational: 0,
        sppgRent: 0,
        totalRAB: 0,
        totalOperational: 0
      }

      daily.set(transaction.transaction_date, dailyRow)
    }

    if (transaction.flow_type === 'income') {
      dailyRow.income += amount
    } else if (transaction.flow_type === 'expense') {
      dailyRow.expense += amount
    } else if (
      transaction.flow_type === 'gas' ||
      transaction.flow_type === 'neutral'
    ) {
      dailyRow.gas += amount
    } else if (transaction.flow_type === 'ops_disbursement') {
      dailyRow.operational += amount
    } else if (transaction.flow_type === 'real_ops') {
      dailyRow.realOperational += amount
    } else if (
      transaction.flow_type === 'operational_disbursement' &&
      transaction.operational_type === 'sppg_rent' &&
      isOperationalMappingEnabled(
        rulesByKitchen,
        transaction.kitchen_id,
        transaction.operational_type
      )
    ) {
      dailyRow.sppgRent += amount
    }
  }

  let totalIncome = 0
  let totalExpense = 0
  let totalGas = 0
  let totalOperational = 0
  let totalRealOperational = 0
  let totalRelawanSalary = 0
  let totalPicIncentive = 0
  let totalVehicleRent = 0
  let totalSppgRent = 0
  let totalSalaryAndIncentive = 0
  let totalRAB = 0
  let totalOperationalNet = 0

  for (const kitchen of grouped.values()) {
    kitchen.totalRAB = kitchen.income - kitchen.expense
    kitchen.totalOperational =
      kitchen.operational - kitchen.realOperational

    totalIncome += kitchen.income
    totalExpense += kitchen.expense
    totalGas += kitchen.gas
    totalOperational += kitchen.operational
    totalRealOperational += kitchen.realOperational
    kitchen.totalSalaryAndIncentive = kitchen.relawanSalary + kitchen.picIncentive
    totalRelawanSalary += kitchen.relawanSalary
    totalPicIncentive += kitchen.picIncentive
    totalVehicleRent += kitchen.vehicleRent
    totalSppgRent += kitchen.sppgRent
    totalSalaryAndIncentive += kitchen.totalSalaryAndIncentive
    totalRAB += kitchen.totalRAB
    totalOperationalNet += kitchen.totalOperational
  }

  for (const row of daily.values()) {
    row.totalRAB = row.income - row.expense
    row.totalOperational = row.operational - row.realOperational
  }

  return {
    kitchens: [...grouped.values()].sort((a, b) =>
      a.kitchenName.localeCompare(b.kitchenName, 'id')
    ),

    daily: [...daily.values()].sort((a, b) => b.date.localeCompare(a.date)),

    otherIncome: otherIncomeRows.sort((a, b) => {
      const dateDelta = b.date.localeCompare(a.date)
      if (dateDelta !== 0) return dateDelta
      return a.accountName.localeCompare(b.accountName, 'id')
    }),

    totals: {
      income: totalIncome,
      expense: totalExpense,
      gas: totalGas,
      operational: totalOperational,
      realOperational: totalRealOperational,
      relawanSalary: totalRelawanSalary,
      picIncentive: totalPicIncentive,
      vehicleRent: totalVehicleRent,
      sppgRent: totalSppgRent,
      totalSalaryAndIncentive,
      totalRAB,
      totalOperational: totalOperationalNet
    }
  }
}

export async function getIncomeReport(
  filters: Pick<ReportFilters, 'startDate' | 'endDate'>,
  client: SupabaseClient = supabase
): Promise<IncomeReport> {
  const transactions = await getReportTransactions(
    {
      ...filters,
      kitchenId: ''
    },
    client
  )

  const grouped = new Map<string, IncomeReportRow>()

  let grandTotal = 0

  for (const transaction of transactions) {
    if (transaction.flow_type !== 'income') {
      continue
    }

    const amount = getAmount(transaction.amount)

    const supplierName = transaction.accounts?.name ?? '-'

    const ownerName = transaction.accounts?.income_suppliers?.owner_name ?? '-'

    const bank = transaction.accounts
      ? `${transaction.accounts.bank ?? '-'} - ${
          transaction.accounts.account_number ?? '-'
        }`
      : '-'

    const key = `${supplierName}|${ownerName}|${bank}`

    let row = grouped.get(key)

    if (!row) {
      row = {
        supplierName,
        ownerName,
        bank,
        total: 0,
        dates: {}
      }

      grouped.set(key, row)
    }

    row.total += amount

    row.dates[transaction.transaction_date] =
      (row.dates[transaction.transaction_date] ?? 0) + amount

    grandTotal += amount
  }

  return {
    rows: [...grouped.values()].sort((a, b) =>
      a.supplierName.localeCompare(b.supplierName, 'id')
    ),
    grandTotal
  }
}

function addSupplierExpense(
  values: Omit<SupplierSummaryRow, 'kitchenName'>,
  totals: SupplierReport['totals'],
  supplierName: string,
  amount: number
) {
  if (supplierName.includes('Arutala')) {
    values.Arutala += amount
    totals.Arutala += amount
    return
  }

  if (supplierName.includes('Sukalarang')) {
    values.Sukalarang += amount
    totals.Sukalarang += amount
    return
  }

  if (supplierName.includes('Aris')) {
    values.Aris += amount
    totals.Aris += amount
    return
  }

  if (supplierName.includes('Babinsa')) {
    values.Babinsa += amount
    totals.Babinsa += amount
    return
  }
}

export async function getSppgRentReport(
  filters: Pick<ReportFilters, 'startDate' | 'endDate' | 'kitchenId'>,
  client: SupabaseClient = supabase
): Promise<SppgRentReport> {
  const pageSize = 1000
  const transactions: Array<{
    amount: number | string | null
    transaction_date: string
    maker_import_batch_id: string | null
    maker_import_line_number: number | null
    kitchen_id: string | null
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
  }> = []
  const operationalRules = await getOperationalAccountRules(client)
  const rulesByKitchen = new Map<string, ReportOperationalRule[]>()
  for (const rule of operationalRules) {
    const current = rulesByKitchen.get(rule.kitchen_id) ?? []
    current.push(rule)
    rulesByKitchen.set(rule.kitchen_id, current)
  }

  for (let from = 0; ; from += pageSize) {
    let query = client
      .from('transactions')
      .select(
        `
        amount,
        transaction_date,
        maker_import_batch_id,
        maker_import_line_number,
        operational_type,
        kitchen_id,
        kitchens (
          id,
          name
        )
      `
      )
      .eq('flow_type', 'operational_disbursement')
      .eq('operational_type', 'sppg_rent')
      .gte('transaction_date', filters.startDate)
      .lte('transaction_date', filters.endDate)
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('maker_import_batch_id', { ascending: true, nullsFirst: false })
      .order('maker_import_line_number', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (filters.kitchenId) {
      query = query.eq('kitchen_id', filters.kitchenId)
    }

    const { data, error } = await query

    if (error) throw error

    const page = (data ?? []) as unknown as typeof transactions
    transactions.push(...page)

    if (page.length < pageSize) {
      break
    }
  }

  const kitchenMap = new Map<
    string,
    {
      kitchenId: string
      kitchenName: string
      daySet: Set<string>
      total: number
    }
  >()

  const dailyRows: SppgRentDailyRow[] = []

  for (const transaction of transactions) {
    if (!transaction.kitchen_id) continue
    if (!isOperationalMappingEnabled(rulesByKitchen, transaction.kitchen_id, 'sppg_rent')) continue

    const kitchen = Array.isArray(transaction.kitchens)
      ? transaction.kitchens[0]
      : transaction.kitchens

    const kitchenName = kitchen?.name ?? 'Dapur tidak diketahui'
    const amount = getAmount(transaction.amount)
    const current =
      kitchenMap.get(transaction.kitchen_id) ?? {
        kitchenId: transaction.kitchen_id,
        kitchenName,
        daySet: new Set<string>(),
        total: 0
      }

    current.daySet.add(transaction.transaction_date)
    current.total += amount
    kitchenMap.set(transaction.kitchen_id, current)

    dailyRows.push({
      date: transaction.transaction_date,
      kitchenId: transaction.kitchen_id,
      kitchenName,
      amount
    })
  }

  const rows = [...kitchenMap.values()]
    .map((row) => ({
      kitchenId: row.kitchenId,
      kitchenName: row.kitchenName,
      dayCount: row.daySet.size,
      total: row.total
    }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        a.kitchenName.localeCompare(b.kitchenName, 'id')
    )

  return {
    rows,
    dailyRows,
    grandTotal: rows.reduce((total, row) => total + row.total, 0)
  }
}

export async function getOperationalDisbursementReport(
  filters: Pick<ReportFilters, 'startDate' | 'endDate' | 'kitchenId'>,
  client: SupabaseClient = supabase
): Promise<OperationalDisbursementReport> {
  const pageSize = 1000
  const rows: OperationalDisbursementRow[] = []
  const operationalRules = await getOperationalAccountRules(client)
  const rulesByKitchen = new Map<string, ReportOperationalRule[]>()
  for (const rule of operationalRules) {
    const current = rulesByKitchen.get(rule.kitchen_id) ?? []
    current.push(rule)
    rulesByKitchen.set(rule.kitchen_id, current)
  }

  for (let from = 0; ; from += pageSize) {
    let query = client
      .from('transactions')
      .select(
        `
        amount,
        transaction_date,
        maker_import_batch_id,
        maker_import_line_number,
        operational_type,
        kitchen_id,
        kitchens (
          id,
          name
        )
      `
      )
      .eq('flow_type', 'operational_disbursement')
      .gte('transaction_date', filters.startDate)
      .lte('transaction_date', filters.endDate)
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('maker_import_batch_id', { ascending: true, nullsFirst: false })
      .order('maker_import_line_number', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (filters.kitchenId) {
      query = query.eq('kitchen_id', filters.kitchenId)
    }

    const { data, error } = await query

    if (error) throw error

    const page = (data ?? []) as Array<{
      amount: number | string | null
      transaction_date: string
      operational_type: OperationalType | null
      kitchen_id: string | null
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
    }>

    rows.push(
      ...page.flatMap((transaction) => {
        if (!transaction.kitchen_id || !transaction.operational_type) {
          return []
        }

        const kitchen = Array.isArray(transaction.kitchens)
          ? transaction.kitchens[0]
          : transaction.kitchens
        const kitchenName = kitchen?.name ?? 'Dapur tidak diketahui'

        if (
          !isOperationalTypeAvailable(
            kitchenName,
            transaction.operational_type,
            transaction.transaction_date
          ) ||
          !isOperationalMappingEnabled(
            rulesByKitchen,
            transaction.kitchen_id,
            transaction.operational_type
          )
        ) {
          return []
        }

        return [
          {
            kitchenId: transaction.kitchen_id,
            kitchenName,
            operationalType: normalizeOperationalType(transaction.operational_type),
            total: getAmount(transaction.amount)
          }
        ]
      })
    )

    if (page.length < pageSize) {
      break
    }
  }

  const grouped = new Map<string, OperationalDisbursementRow>()

  for (const row of rows) {
    const key = row.kitchenId + '|' + row.operationalType
    const current = grouped.get(key)

    if (current) {
      current.total += row.total
    } else {
      grouped.set(key, { ...row })
    }
  }

  const resultRows = [...grouped.values()].sort(
    (a, b) =>
      a.kitchenName.localeCompare(b.kitchenName, 'id') ||
      a.operationalType.localeCompare(b.operationalType, 'id')
  )

  return {
    rows: resultRows,
    grandTotal: resultRows.reduce((total, row) => total + row.total, 0)
  }
}

export async function getSupplierReport(
  filters: ReportFilters,
  client: SupabaseClient = supabase
): Promise<SupplierReport> {
  const transactions = await getReportTransactions(filters, client)

  const summary = new Map<string, SupplierSummaryRow>()

  const daily = new Map<string, Map<string, SupplierSummaryRow>>()

  const totals = createSupplierTotals()

  for (const transaction of transactions) {
    if (transaction.flow_type !== 'expense') {
      continue
    }

    const kitchenName = transaction.kitchens?.name ?? 'Tidak diketahui'

    const amount = getAmount(transaction.amount)

    let summaryRow = summary.get(kitchenName)

    if (!summaryRow) {
      summaryRow = {
        kitchenName,
        ...createSupplierValues()
      }

      summary.set(kitchenName, summaryRow)
    }

    let dateRows = daily.get(transaction.transaction_date)

    if (!dateRows) {
      dateRows = new Map()
      daily.set(transaction.transaction_date, dateRows)
    }

    let dailyRow = dateRows.get(kitchenName)

    if (!dailyRow) {
      dailyRow = {
        kitchenName,
        ...createSupplierValues()
      }

      dateRows.set(kitchenName, dailyRow)
    }

    if (transaction.flow_type === 'expense') {
      const supplierName = getSupplierName(transaction.suppliers)

      addSupplierExpense(summaryRow, totals, supplierName, amount)

      addSupplierExpense(
        dailyRow,
        {
          Arutala: 0,
          Sukalarang: 0,
          Aris: 0,
          Babinsa: 0,
          Total: 0
        },
        supplierName,
        amount
      )

      // Match V1 behavior: every supplier expense contributes to Total,
      // while the supplier-specific columns are populated when recognized.
      summaryRow.Total += amount
      dailyRow.Total += amount
      totals.Total += amount

      continue
    }
  }

  const dailyRows: SupplierDailyRow[] = [...daily.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, kitchenRows]) => ({
      date,
      kitchens: [...kitchenRows.values()].sort((a, b) =>
        a.kitchenName.localeCompare(b.kitchenName, 'id')
      )
    }))

  return {
    summaryRows: [...summary.values()].sort((a, b) =>
      a.kitchenName.localeCompare(b.kitchenName, 'id')
    ),
    dailyRows,
    totals
  }
}
