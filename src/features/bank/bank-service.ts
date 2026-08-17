import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

const BANK_MODULE_START_DATE = '2026-07-20'

export type BankAccount = {
  id: string
  name: string
  bank: string
  account_number: string | null
  opening_balance: number
  account_category: string | null
  is_holding_destination: boolean
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

export type BankTransaction = {
  id: string
  account_id: string
  recipient_account_id: string | null
  recipient_name: string | null
  payment_for: string | null
  transfer_amount: number
  admin_fee: number
  transaction_date: string
  created_at: string
  transfer_type: string | null
  created_by: string | null
  sender: BankAccount | null
  recipient: BankAccount | null
}

export type BankTransactionPayload = {
  transaction_date: string
  account_id: string
  recipient_account_id: string | null
  recipient_name: string
  transfer_amount: number
  admin_fee: number
  payment_for: string
  transfer_type: 'normal'
  created_by: string
}

export type BankAccountSummary = {
  account: BankAccount
  disbursementIncome: number
  transferIncome: number
  transferExpense: number
  balance: number
}

export type BankOverview = {
  accounts: BankAccount[]
  summaries: BankAccountSummary[]
}

export type BankHistoryItem = {
  transaction: BankTransaction
  direction: 'in' | 'out'
  runningBalance: number
}

export type BankHistoryPage = {
  transactions: BankHistoryItem[]
  total: number
  page: number
  pageSize: number
}

export type RecipientHistoryOption = {
  value: string
  label: string
}

type TransactionIncomeRow = {
  account_id: string | null
  amount: number | string | null
}

type BankTransferSummaryRow = {
  account_id: string
  recipient_account_id: string | null
  transfer_amount: number | string | null
  admin_fee: number | string | null
}

function getSupplierOwnerName(
  supplier: BankAccount['income_suppliers']
): string | null {
  if (Array.isArray(supplier)) {
    return supplier[0]?.owner_name ?? null
  }

  return supplier?.owner_name ?? null
}

export function getAccountDisplayName(account: BankAccount): string {
  return getSupplierOwnerName(account.income_suppliers) ?? account.name
}

export function getAccountNumberTail(accountNumber: string | null): string {
  if (!accountNumber) {
    return 'Belum diisi'
  }

  const digits = accountNumber.replace(/\D/g, '')

  if (!digits) {
    return 'Belum diisi'
  }

  return `••${digits.slice(-3)}`
}

export function getAccountLabel(account: BankAccount): string {
  return `${getAccountDisplayName(account)} • ${account.bank} • ${getAccountNumberTail(account.account_number)}`
}

export function isPriorityAccount(
  account: BankAccount,
  priorityOwners: readonly string[]
): boolean {
  if (account.account_category !== 'supplier') {
    return false
  }

  const owner = getAccountDisplayName(account).trim().toUpperCase()

  return priorityOwners.includes(owner)
}

export function getRecipientAccounts(
  accounts: BankAccount[],
  senderId: string,
  mode: 'holding' | 'priority' | 'all' = 'holding',
  priorityOwners: readonly string[] = []
): BankAccount[] {
  return accounts
    .filter((account) => {
      if (account.id === senderId) {
        return false
      }

      if (mode === 'holding') {
        return account.is_holding_destination
      }

      if (mode === 'priority') {
        return isPriorityAccount(account, priorityOwners)
      }

      return true
    })
    .sort((a, b) =>
      getAccountDisplayName(a).localeCompare(getAccountDisplayName(b), 'id')
    )
}

export async function getBankAccounts(
  client: SupabaseClient = supabase
): Promise<BankAccount[]> {
  const { data, error } = await client
    .from('accounts')
    .select(
      `
        id,
        name,
        bank,
        account_number,
        opening_balance,
        account_category,
        is_holding_destination,
        income_suppliers(
          business_name,
          owner_name
        )
      `
    )
    .order('bank')
    .order('account_number')

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as BankAccount[]
}

export async function getBankTransactions(
  startDate: string,
  endDate: string,
  client: SupabaseClient = supabase
): Promise<BankTransaction[]> {
  const { data, error } = await client
    .from('bank_transactions')
    .select(
      `
        id,
        account_id,
        recipient_account_id,
        recipient_name,
        payment_for,
        transfer_amount,
        admin_fee,
        transaction_date,
        created_at,
        transfer_type,
        created_by,
        sender:accounts!bank_transactions_account_fkey(
          id,
          name,
          bank,
          account_number,
          opening_balance,
          account_category,
          is_holding_destination,
          income_suppliers(
            business_name,
            owner_name
          )
        ),
        recipient:accounts!bank_transactions_recipient_account_fkey(
          id,
          name,
          bank,
          account_number,
          opening_balance,
          account_category,
          is_holding_destination,
          income_suppliers(
            business_name,
            owner_name
          )
        )
      `
    )
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as BankTransaction[]
}

export async function getBankIncomeTransactions(
  startDate: string,
  endDate: string,
  client: SupabaseClient = supabase
): Promise<TransactionIncomeRow[]> {
  const { data, error } = await client
    .from('transactions')
    .select('account_id,amount')
    .in('flow_type', ['income', 'neutral'])
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)

  if (error) {
    throw error
  }

  return (data ?? []) as TransactionIncomeRow[]
}

export async function getBankOverview(
  client: SupabaseClient = supabase
): Promise<BankOverview> {
  const startDate = BANK_MODULE_START_DATE
  const now = new Date()
  const endDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')

  const [accounts, transferRows, incomeTransactions] = await Promise.all([
    getBankAccounts(client),
    getBankTransferSummaryRows(startDate, endDate, client),
    getBankIncomeTransactions(startDate, endDate, client)
  ])

  const incomeByAccount = new Map<string, number>()

  for (const transaction of incomeTransactions) {
    if (!transaction.account_id) continue

    const amount = Number(transaction.amount) || 0

    incomeByAccount.set(
      transaction.account_id,
      (incomeByAccount.get(transaction.account_id) ?? 0) + amount
    )
  }

  const transferIncomeByAccount = new Map<string, number>()
  const transferExpenseByAccount = new Map<string, number>()

  for (const transaction of transferRows) {
    const amount = Number(transaction.transfer_amount) || 0
    const adminFee = Number(transaction.admin_fee) || 0

    if (transaction.recipient_account_id) {
      transferIncomeByAccount.set(
        transaction.recipient_account_id,
        (transferIncomeByAccount.get(transaction.recipient_account_id) ?? 0) +
          amount
      )
    }

    transferExpenseByAccount.set(
      transaction.account_id,
      (transferExpenseByAccount.get(transaction.account_id) ?? 0) +
        amount +
        adminFee
    )
  }

  const usedAccountIds = new Set<string>()

  for (const transaction of incomeTransactions) {
    if (transaction.account_id) {
      usedAccountIds.add(transaction.account_id)
    }
  }

  for (const transaction of transferRows) {
    usedAccountIds.add(transaction.account_id)

    if (transaction.recipient_account_id) {
      usedAccountIds.add(transaction.recipient_account_id)
    }
  }

  const summaries = accounts
    .filter((account) => usedAccountIds.has(account.id))
    .map((account) => {
      const disbursementIncome = incomeByAccount.get(account.id) ?? 0
      const transferIncome = transferIncomeByAccount.get(account.id) ?? 0
      const transferExpense = transferExpenseByAccount.get(account.id) ?? 0

      const balance =
        Number(account.opening_balance) +
        disbursementIncome +
        transferIncome -
        transferExpense

      return {
        account,
        disbursementIncome,
        transferIncome,
        transferExpense,
        balance
      }
    })

  return {
    accounts,
    summaries
  }
}

async function getBankTransferSummaryRows(
  startDate: string,
  endDate: string,
  client: SupabaseClient = supabase
): Promise<BankTransferSummaryRow[]> {
  const { data, error } = await client
    .from('bank_transactions')
    .select('account_id,recipient_account_id,transfer_amount,admin_fee')
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)

  if (error) {
    throw error
  }

  return (data ?? []) as BankTransferSummaryRow[]
}

export async function getBankHistoryPage(
  accountId: string,
  page: number,
  pageSize = 10,
  balance: number,
  client: SupabaseClient = supabase
): Promise<BankHistoryPage> {
  if (!accountId) {
    throw new Error('Rekening history tidak ditemukan.')
  }

  if (!Number.isInteger(page) || page < 1) {
    throw new Error('Halaman history tidak valid.')
  }

  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('Ukuran halaman history tidak valid.')
  }

  const startDate = BANK_MODULE_START_DATE
  const now = new Date()
  const endDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')

  const { data: bankRows, error: bankError } = await client
    .from('bank_transactions')
    .select(
      `
        id,
        account_id,
        recipient_account_id,
        recipient_name,
        payment_for,
        transfer_amount,
        admin_fee,
        transaction_date,
        created_at,
        transfer_type,
        created_by,
        sender:accounts!bank_transactions_account_fkey(
          id,
          name,
          bank,
          account_number,
          opening_balance,
          account_category,
          is_holding_destination,
          income_suppliers(
            business_name,
            owner_name
          )
        ),
        recipient:accounts!bank_transactions_recipient_account_fkey(
          id,
          name,
          bank,
          account_number,
          opening_balance,
          account_category,
          is_holding_destination,
          income_suppliers(
            business_name,
            owner_name
          )
        )
      `
    )
    .or(`account_id.eq.${accountId},recipient_account_id.eq.${accountId}`)
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)

  if (bankError) {
    throw bankError
  }

  const allBankTransactions = (bankRows ?? []) as unknown as BankTransaction[]

  const compareLedgerEvents = (
    a: {
      transactionDate: string
      createdAt: string
      id: string
    },
    b: {
      transactionDate: string
      createdAt: string
      id: string
    }
  ) => {
    if (a.transactionDate !== b.transactionDate) {
      return b.transactionDate.localeCompare(a.transactionDate)
    }

    const aCreatedAt = new Date(a.createdAt).getTime()
    const bCreatedAt = new Date(b.createdAt).getTime()

    if (aCreatedAt !== bCreatedAt) {
      return bCreatedAt - aCreatedAt
    }

    return b.id.localeCompare(a.id)
  }

  allBankTransactions.sort((a, b) =>
    compareLedgerEvents(
      {
        transactionDate: a.transaction_date,
        createdAt: a.created_at,
        id: a.id
      },
      {
        transactionDate: b.transaction_date,
        createdAt: b.created_at,
        id: b.id
      }
    )
  )

  const total = allBankTransactions.length
  const offset = (page - 1) * pageSize
  const pageTransactions = allBankTransactions.slice(offset, offset + pageSize)

  if (!pageTransactions.length) {
    return {
      transactions: [],
      total,
      page,
      pageSize
    }
  }

  type HistoryLedgerEvent =
    | {
        kind: 'bank'
        id: string
        transactionDate: string
        createdAt: string
        transaction: BankTransaction
      }
    | {
        kind: 'income'
        id: string
        transactionDate: string
        createdAt: string
        amount: number
      }

  const { data: incomeRows, error: incomeError } = await client
    .from('transactions')
    .select('id,transaction_date,created_at,amount')
    .eq('account_id', accountId)
    .in('flow_type', ['income', 'neutral'])
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)

  if (incomeError) {
    throw incomeError
  }

  const ledgerEvents: HistoryLedgerEvent[] = allBankTransactions.map(
    (transaction) => ({
      kind: 'bank',
      id: transaction.id,
      transactionDate: transaction.transaction_date,
      createdAt: transaction.created_at,
      transaction
    })
  )

  for (const row of incomeRows ?? []) {
    ledgerEvents.push({
      kind: 'income',
      id: row.id,
      transactionDate: row.transaction_date,
      createdAt: row.created_at,
      amount: Number(row.amount) || 0
    })
  }

  ledgerEvents.sort((a, b) =>
    compareLedgerEvents(
      {
        transactionDate: a.transactionDate,
        createdAt: a.createdAt,
        id: a.id
      },
      {
        transactionDate: b.transactionDate,
        createdAt: b.createdAt,
        id: b.id
      }
    )
  )

  const pageTransactionIds = new Set(
    pageTransactions.map((transaction) => transaction.id)
  )

  const historyByTransactionId = new Map<string, BankHistoryItem>()
  let runningBalance = Number(balance) || 0

  for (const event of ledgerEvents) {
    if (event.kind === 'bank') {
      const transaction = event.transaction
      const incoming = transaction.recipient_account_id === accountId
      const outgoing = transaction.account_id === accountId

      if (!incoming && !outgoing) {
        continue
      }

      if (pageTransactionIds.has(transaction.id)) {
        historyByTransactionId.set(transaction.id, {
          transaction,
          direction: incoming ? 'in' : 'out',
          runningBalance
        })
      }

      const amount = Number(transaction.transfer_amount) || 0
      const adminFee = Number(transaction.admin_fee) || 0

      if (incoming) {
        runningBalance -= amount
      } else {
        runningBalance += amount + adminFee
      }

      continue
    }

    runningBalance -= event.amount
  }

  return {
    transactions: pageTransactions.map((transaction) => {
      const history = historyByTransactionId.get(transaction.id)

      if (!history) {
        throw new Error('Saldo history transaksi tidak dapat dihitung.')
      }

      return history
    }),
    total,
    page,
    pageSize
  }
}

function normalizePaymentPurpose(value: string | null | undefined) {
  if (!value) return ''

  const normalized = value.trim().replace(/\s+/g, ' ')
  const monthName =
    '(?:Jan(?:uari)?|Feb(?:ruari)?|Mar(?:et)?|Apr(?:il)?|Mei|Jun(?:i)?|Jul(?:i)?|Agt(?:ustus)?|Agustus|Sep(?:tember)?|Okt(?:ober)?|Nov(?:ember)?|Des(?:ember)?)'

  return normalized
    .replace(
      new RegExp(`\\bTgl\\.?\\s+\\d{4}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2}\\b`, 'gi'),
      'Tgl'
    )
    .replace(
      new RegExp(
        `\\bTgl\\.?\\s+\\d{1,2}[\\/.-]\\d{1,2}(?:[\\/.-]\\d{2,4})?\\b`,
        'gi'
      ),
      'Tgl'
    )
    .replace(
      new RegExp(
        `\\bTgl\\.?\\s+\\d{1,2}\\s+${monthName}(?:\\s+\\d{2,4})?\\b`,
        'gi'
      ),
      'Tgl'
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export async function getRecipientHistory(
  startDate: string,
  client: SupabaseClient = supabase
): Promise<RecipientHistoryOption[]> {
  const { data, error } = await client
    .from('bank_transactions')
    .select(
      `
        recipient_name,
        recipient_account_id,
        transaction_date,
        recipient:accounts!bank_transactions_recipient_account_fkey(
          bank,
          income_suppliers(
            business_name,
            owner_name
          )
        )
      `
    )
    .gte('transaction_date', startDate)
    .order('transaction_date', { ascending: false })

  if (error) {
    throw error
  }

  const result: RecipientHistoryOption[] = []
  const used = new Set<string>()

  for (const item of data ?? []) {
    const name = item.recipient_name?.trim().replace(/\s+/g, ' ')

    if (!name) continue

    const recipient = Array.isArray(item.recipient)
      ? item.recipient[0]
      : item.recipient

    const owner = recipient?.income_suppliers?.[0]?.owner_name

    const displayName = owner?.trim() || name
    const bank = recipient?.bank?.trim()

    const key = `${name.toLowerCase()}|${(bank ?? '').toLowerCase()}`

    if (used.has(key)) continue

    used.add(key)

    result.push({
      value: name,
      label: bank ? `${displayName} (${bank})` : displayName
    })
  }

  return result
}

export async function getPaymentHistory(
  startDate: string,
  client: SupabaseClient = supabase
): Promise<string[]> {
  const { data, error } = await client
    .from('bank_transactions')
    .select('payment_for,transaction_date')
    .gte('transaction_date', startDate)
    .order('transaction_date', { ascending: false })

  if (error) {
    throw error
  }

  const result: string[] = []
  const used = new Set<string>()

  for (const item of data ?? []) {
    const value = normalizePaymentPurpose(item.payment_for)

    if (!value) continue

    const key = value.toLowerCase()

    if (used.has(key)) continue

    used.add(key)
    result.push(value)
  }

  return result
}

export function validateBankTransactionPayload(
  payload: BankTransactionPayload
): string | null {
  if (!payload.transaction_date) {
    return 'Tanggal wajib diisi.'
  }

  if (!payload.account_id) {
    return 'Pilih rekening pengirim.'
  }

  if (!payload.recipient_name.trim()) {
    return 'Nama penerima wajib diisi.'
  }

  if (
    !Number.isFinite(payload.transfer_amount) ||
    payload.transfer_amount <= 0
  ) {
    return 'Nominal transfer harus lebih dari 0.'
  }

  if (!Number.isFinite(payload.admin_fee) || payload.admin_fee < 0) {
    return 'Biaya admin tidak boleh negatif.'
  }

  if (!payload.created_by) {
    return 'Pengguna pembuat transaksi tidak ditemukan.'
  }

  if (
    payload.recipient_account_id &&
    payload.recipient_account_id === payload.account_id
  ) {
    return 'Rekening tujuan tidak boleh sama dengan rekening pengirim.'
  }

  return null
}

export async function hasSufficientBalance(
  accountId: string,
  transferAmount: number,
  adminFee: number,
  client: SupabaseClient = supabase,
  editingTransactionId?: string
): Promise<boolean> {
  const now = new Date()
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')

  const { data: account, error: accountError } = await client
    .from('accounts')
    .select('opening_balance')
    .eq('id', accountId)
    .single()

  if (accountError) {
    throw accountError
  }

  const { data: incomeTransactions, error: incomeError } = await client
    .from('transactions')
    .select('amount')
    .eq('account_id', accountId)
    .in('flow_type', ['income', 'neutral'])
    .gte('transaction_date', BANK_MODULE_START_DATE)
    .lte('transaction_date', today)

  if (incomeError) {
    throw incomeError
  }

  const { data: incomingTransfers, error: incomingError } = await client
    .from('bank_transactions')
    .select('transfer_amount')
    .eq('recipient_account_id', accountId)
    .gte('transaction_date', BANK_MODULE_START_DATE)
    .lte('transaction_date', today)

  if (incomingError) {
    throw incomingError
  }

  const { data: outgoingTransfers, error: outgoingError } = await client
    .from('bank_transactions')
    .select('id,transfer_amount,admin_fee')
    .eq('account_id', accountId)
    .gte('transaction_date', BANK_MODULE_START_DATE)
    .lte('transaction_date', today)

  if (outgoingError) {
    throw outgoingError
  }

  const income = (incomeTransactions ?? []).reduce(
    (total, item) => total + (Number(item.amount) || 0),
    0
  )

  const incoming = (incomingTransfers ?? []).reduce(
    (total, item) => total + (Number(item.transfer_amount) || 0),
    0
  )

  const outgoing = (outgoingTransfers ?? []).reduce((total, item) => {
    if (editingTransactionId && item.id === editingTransactionId) {
      return total
    }

    return (
      total +
      (Number(item.transfer_amount) || 0) +
      (Number(item.admin_fee) || 0)
    )
  }, 0)

  const balance = Number(account.opening_balance) + income + incoming - outgoing

  return transferAmount + adminFee <= balance
}

export async function createBankTransaction(
  payload: BankTransactionPayload,
  client: SupabaseClient = supabase
): Promise<BankTransaction> {
  const validationError = validateBankTransactionPayload(payload)

  if (validationError) {
    throw new Error(validationError)
  }

  const sufficient = await hasSufficientBalance(
    payload.account_id,
    payload.transfer_amount,
    payload.admin_fee,
    client
  )

  if (!sufficient) {
    throw new Error('Saldo tidak mencukupi.')
  }

  const { data, error } = await client
    .from('bank_transactions')
    .insert(payload)
    .select(
      `
        id,
        account_id,
        recipient_account_id,
        recipient_name,
        payment_for,
        transfer_amount,
        admin_fee,
        transaction_date,
        created_at,
        transfer_type,
        created_by
      `
    )
    .single()

  if (error) {
    throw error
  }

  return data as BankTransaction
}

export async function updateBankTransaction(
  id: string,
  payload: BankTransactionPayload,
  client: SupabaseClient = supabase
): Promise<BankTransaction> {
  if (!id) {
    throw new Error('ID transaksi tidak ditemukan.')
  }

  const validationError = validateBankTransactionPayload(payload)

  if (validationError) {
    throw new Error(validationError)
  }

  const sufficient = await hasSufficientBalance(
    payload.account_id,
    payload.transfer_amount,
    payload.admin_fee,
    client,
    id
  )

  if (!sufficient) {
    throw new Error('Saldo tidak mencukupi.')
  }

  const { data, error } = await client
    .from('bank_transactions')
    .update(payload)
    .eq('id', id)
    .select(
      `
        id,
        account_id,
        recipient_account_id,
        recipient_name,
        payment_for,
        transfer_amount,
        admin_fee,
        transaction_date,
        created_at,
        transfer_type,
        created_by
      `
    )
    .single()

  if (error) {
    throw error
  }

  return data as BankTransaction
}

export async function deleteBankTransaction(
  id: string,
  client: SupabaseClient = supabase
): Promise<void> {
  if (!id) {
    throw new Error('ID transaksi tidak ditemukan.')
  }

  const { error } = await client.from('bank_transactions').delete().eq('id', id)

  if (error) {
    throw error
  }
}
