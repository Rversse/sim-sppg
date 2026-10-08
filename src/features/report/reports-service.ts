import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

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
  income: number
  expense: number
  gas: number
  operational: number
  realOperational: number
  relawanSalary: number
  schoolPicIncentive: number
  kaderIncentive: number
  vehicleRent: number
  sppgRent: number
  totalOperationalDisbursement: number
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
    schoolPicIncentive: number
    kaderIncentive: number
    vehicleRent: number
    sppgRent: number
    totalOperationalDisbursement: number
    totalRAB: number
    totalOperational: number
    otherIncomeTotal: number
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
  | 'school_pic_incentive'
  | 'kader_incentive'
  | 'vehicle_rent'
  | 'sppg_rent'

export type OperationalDisbursementRow = {
  kitchenId: string
  kitchenName: string
  operationalType: OperationalType
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
  return `${kitchenName} (${recipientName?.trim() || 'Belum ditentukan'})`
}

export function getOperationalTypeLabel(type: OperationalType) {
  switch (type) {
    case 'relawan_salary':
      return 'Gaji Relawan'
    case 'school_pic_incentive':
      return 'Insentif PIC Sekolah'
    case 'kader_incentive':
      return 'Insentif PIC Posyandu'
    case 'vehicle_rent':
      return 'Sewa Kendaraan'
    case 'sppg_rent':
      return 'Sewa SPPG'
  }
}


type ReportTransaction = {
  id: string
  amount: number | string | null
  transaction_date: string
  flow_type:
    | 'income'
    | 'expense'
    | 'gas'
    | 'ops_disbursement'
    | 'real_ops'
    | 'operational_disbursement'
    | 'other_income'
    | 'neutral'
  kitchen_id: string | null
  account_id: string | null
  operational_type:
    | 'relawan_salary'
    | 'school_pic_incentive'
    | 'kader_incentive'
    | 'vehicle_rent'
    | 'sppg_rent'
    | null
  note: string | null
  created_at: string
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
        operational_type,
        kitchen_id,
        note,
        created_at,

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

export async function getOverallReport(
  filters: ReportFilters,
  client: SupabaseClient = supabase
): Promise<OverallReport> {
  const [kitchens, transactions] = await Promise.all([
    getActiveKitchens(client),
    getReportTransactions(filters, client)
  ])

  const otherIncome: OtherIncomeReportRow[] = []

  const grouped = new Map<string, OverallKitchenReport>()

  for (const kitchen of kitchens) {
    grouped.set(kitchen.id, {
      kitchenId: kitchen.id,
      kitchenName: kitchen.name,
      recipientName: kitchen.operationalRecipientName,
      income: 0,
      expense: 0,
      gas: 0,
      operational: 0,
      realOperational: 0,
      relawanSalary: 0,
      schoolPicIncentive: 0,
      kaderIncentive: 0,
      vehicleRent: 0,
      sppgRent: 0,
      totalOperationalDisbursement: 0,
      totalRAB: 0,
      totalOperational: 0
    })
  }

  for (const transaction of transactions) {
    if (transaction.flow_type !== 'other_income' || !transaction.account_id) {
      continue
    }

    const account = Array.isArray(transaction.accounts)
      ? transaction.accounts[0]
      : transaction.accounts

    otherIncome.push({
      id: transaction.id,
      date: transaction.transaction_date,
      amount: getAmount(transaction.amount),
      accountName: account?.name ?? 'Rekening tidak diketahui',
      bank: account?.bank ?? '-',
      accountNumber: account?.account_number ?? null,
      note: transaction.note?.trim() || null
    })
  }

  otherIncome.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date)
    return dateCompare !== 0 ? dateCompare : b.id.localeCompare(a.id)
  })

  const daily = new Map<string, OverallDailyReport>()

  for (const transaction of transactions) {
    if (transaction.flow_type === 'other_income') {
      continue
    }

    if (!transaction.kitchen_id) {
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
      switch (transaction.operational_type) {
        case 'relawan_salary':
          kitchen.relawanSalary += amount
          break
        case 'school_pic_incentive':
          kitchen.schoolPicIncentive += amount
          break
        case 'kader_incentive':
          kitchen.kaderIncentive += amount
          break
        case 'vehicle_rent':
          kitchen.vehicleRent += amount
          break
        case 'sppg_rent':
          kitchen.sppgRent += amount
          break
      }

      kitchen.totalOperationalDisbursement += amount
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
      transaction.operational_type === 'sppg_rent'
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
  let totalSchoolPicIncentive = 0
  let totalKaderIncentive = 0
  let totalVehicleRent = 0
  let totalSppgRent = 0
  let totalOperationalDisbursement = 0
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
    totalRelawanSalary += kitchen.relawanSalary
    totalSchoolPicIncentive += kitchen.schoolPicIncentive
    totalKaderIncentive += kitchen.kaderIncentive
    totalVehicleRent += kitchen.vehicleRent
    totalSppgRent += kitchen.sppgRent
    totalOperationalDisbursement += kitchen.totalOperationalDisbursement
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

    totals: {
      income: totalIncome,
      expense: totalExpense,
      gas: totalGas,
      operational: totalOperational,
      realOperational: totalRealOperational,
      relawanSalary: totalRelawanSalary,
      schoolPicIncentive: totalSchoolPicIncentive,
      kaderIncentive: totalKaderIncentive,
      vehicleRent: totalVehicleRent,
      sppgRent: totalSppgRent,
      totalOperationalDisbursement,
      totalRAB,
      totalOperational: totalOperationalNet,
      otherIncomeTotal: otherIncome.reduce((sum, item) => sum + item.amount, 0)
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

  for (let from = 0; ; from += pageSize) {
    let query = client
      .from('transactions')
      .select(
        `
        amount,
        transaction_date,
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

  for (let from = 0; ; from += pageSize) {
    let query = client
      .from('transactions')
      .select(
        `
        amount,
        transaction_date,
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

        return [
          {
            kitchenId: transaction.kitchen_id,
            kitchenName: kitchen?.name ?? 'Dapur tidak diketahui',
            operationalType: transaction.operational_type,
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
