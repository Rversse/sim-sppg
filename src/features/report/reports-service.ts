import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type ReportKitchen = {
  id: string
  name: string
}

export type ReportFilters = {
  startDate: string
  endDate: string
  kitchenId: string
}

export type OverallKitchenReport = {
  kitchenId: string
  kitchenName: string
  income: number
  expense: number
  operational: number
  remaining: number
}

export type OverallDailyReport = {
  date: string
  income: number
  expense: number
  operational: number
  remaining: number
}

export type OverallReport = {
  kitchens: OverallKitchenReport[]
  daily: OverallDailyReport[]
  totals: {
    income: number
    expense: number
    operational: number
    remaining: number
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
  Operational: number
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
    Operational: number
    Total: number
  }
}

type ReportTransaction = {
  amount: number | string | null
  transaction_date: string
  flow_type: 'income' | 'expense' | 'neutral'
  kitchen_id: string | null
  created_at: string
  supplier?: {
    name: string | null
  } | null
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

function createSupplierValues(): Omit<SupplierSummaryRow, 'kitchenName'> {
  return {
    Arutala: 0,
    Sukalarang: 0,
    Aris: 0,
    Babinsa: 0,
    Operational: 0,
    Total: 0
  }
}

function createSupplierTotals() {
  return {
    Arutala: 0,
    Sukalarang: 0,
    Aris: 0,
    Babinsa: 0,
    Operational: 0,
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
        kitchen_id,
        created_at,

        kitchens (
          id,
          name
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
    .select('id,name')
    .eq('is_active', true)
    .order('name')

  if (error) {
    throw error
  }

  return (data ?? []) as ReportKitchen[]
}

export async function getOverallReport(
  filters: ReportFilters,
  client: SupabaseClient = supabase
): Promise<OverallReport> {
  const [kitchens, transactions] = await Promise.all([
    getActiveKitchens(client),
    getReportTransactions(filters, client)
  ])

  const grouped = new Map<string, OverallKitchenReport>()

  for (const kitchen of kitchens) {
    grouped.set(kitchen.id, {
      kitchenId: kitchen.id,
      kitchenName: kitchen.name,
      income: 0,
      expense: 0,
      operational: 0,
      remaining: 0
    })
  }

  const daily = new Map<string, OverallDailyReport>()

  for (const transaction of transactions) {
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
    } else if (transaction.flow_type === 'neutral') {
      kitchen.operational += amount
    }

    let dailyRow = daily.get(transaction.transaction_date)

    if (!dailyRow) {
      dailyRow = {
        date: transaction.transaction_date,
        income: 0,
        expense: 0,
        operational: 0,
        remaining: 0
      }

      daily.set(transaction.transaction_date, dailyRow)
    }

    if (transaction.flow_type === 'income') {
      dailyRow.income += amount
    } else if (transaction.flow_type === 'expense') {
      dailyRow.expense += amount
    } else if (transaction.flow_type === 'neutral') {
      dailyRow.operational += amount
    }
  }

  let totalIncome = 0
  let totalExpense = 0
  let totalOperational = 0

  for (const kitchen of grouped.values()) {
    kitchen.remaining = kitchen.income - kitchen.expense

    totalIncome += kitchen.income
    totalExpense += kitchen.expense
    totalOperational += kitchen.operational
  }

  for (const row of daily.values()) {
    row.remaining = row.income - row.expense
  }

  return {
    kitchens: [...grouped.values()].sort((a, b) => {
      const activeA = a.income > 0 || a.expense > 0 || a.operational > 0

      const activeB = b.income > 0 || b.expense > 0 || b.operational > 0

      if (!activeA && activeB) return 1
      if (!activeB && activeA) return -1

      return (
        a.remaining - b.remaining || a.kitchenName.localeCompare(b.kitchenName)
      )
    }),

    daily: [...daily.values()].sort((a, b) => b.date.localeCompare(a.date)),

    totals: {
      income: totalIncome,
      expense: totalExpense,
      operational: totalOperational,
      remaining: totalIncome - totalExpense
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

function addSupplierOperational(
  values: Omit<SupplierSummaryRow, 'kitchenName'>,
  totals: SupplierReport['totals'],
  amount: number
) {
  values.Operational += amount
  totals.Operational += amount
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
    if (
      transaction.flow_type !== 'expense' &&
      transaction.flow_type !== 'neutral'
    ) {
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
      const supplierName = transaction.supplier?.name ?? '-'

      addSupplierExpense(summaryRow, totals, supplierName, amount)

      addSupplierExpense(
        dailyRow,
        {
          Arutala: 0,
          Sukalarang: 0,
          Aris: 0,
          Babinsa: 0,
          Operational: 0,
          Total: 0
        },
        supplierName,
        amount
      )

      continue
    }

    if (transaction.flow_type === 'neutral') {
      addSupplierOperational(summaryRow, totals, amount)

      addSupplierOperational(
        dailyRow,
        {
          Arutala: 0,
          Sukalarang: 0,
          Aris: 0,
          Babinsa: 0,
          Operational: 0,
          Total: 0
        },
        amount
      )
    }
  }

  for (const row of summary.values()) {
    row.Total = row.Arutala + row.Sukalarang + row.Aris + row.Babinsa
  }

  for (const dateRows of daily.values()) {
    for (const row of dateRows.values()) {
      row.Total = row.Arutala + row.Sukalarang + row.Aris + row.Babinsa
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
