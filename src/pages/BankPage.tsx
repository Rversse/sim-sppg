import { useEffect, useMemo, useState } from 'react'

import {
  createBankTransaction,
  deleteBankTransaction,
  getAccountDisplayName,
  getAccountLabel,
  getBankOverview,
  getRecipientAccounts,
  updateBankTransaction,
  type BankAccountSummary,
  type BankOverview,
  type BankTransaction
} from '@/features/bank/bank-service'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'

const HISTORY_PAGE_SIZE = 10
const BANK_MODULE_START_DATE = '2026-07-20'

// V1 uses a static JavaScript list for the priority supplier accounts.
// Keep this as presentation/configuration logic; it is not a DB field.
const PRIORITY_OWNERS = [
  'DEDE JAELANI',
  'AYI SUHERLAN',
  'TAUFIK SUKALARANG'
] as const

type TransferFormState = {
  transactionDate: string
  accountId: string
  recipientAccountId: string
  recipientName: string
  transferAmount: string
  adminFee: string
  paymentFor: string
}

function createEmptyTransferForm(accountId = ''): TransferFormState {
  return {
    transactionDate: getTodayLocal(),
    accountId,
    recipientAccountId: '',
    recipientName: '',
    transferAmount: '',
    adminFee: '0',
    paymentFor: ''
  }
}

function getPriorityIndex(account: BankAccountSummary['account']) {
  const ownerName = getAccountDisplayName(account).trim().toUpperCase()
  return PRIORITY_OWNERS.indexOf(ownerName as (typeof PRIORITY_OWNERS)[number])
}

function getAccountGroups(summaries: BankAccountSummary[]) {
  const holding: BankAccountSummary[] = []
  const priority: BankAccountSummary[] = []
  const others: BankAccountSummary[] = []

  for (const summary of summaries) {
    const account = summary.account

    if (account.is_holding_destination) {
      holding.push(summary)
      continue
    }

    if (
      account.account_category === 'supplier' &&
      getPriorityIndex(account) >= 0
    ) {
      priority.push(summary)
      continue
    }

    others.push(summary)
  }

  const sortByBusinessName = (a: BankAccountSummary, b: BankAccountSummary) =>
    a.account.name.localeCompare(b.account.name, 'id')

  holding.sort(sortByBusinessName)
  priority.sort(sortByBusinessName)
  others.sort(sortByBusinessName)

  return {
    holding,
    priority,
    others
  }
}

function getTodayLocal() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00`))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function getPartnerName(transaction: BankTransaction, incoming: boolean) {
  if (incoming) {
    return (
      (transaction.sender ? getAccountDisplayName(transaction.sender) : '') ||
      transaction.sender?.name ||
      transaction.recipient_name ||
      'Rekening'
    )
  }

  return (
    (transaction.recipient
      ? getAccountDisplayName(transaction.recipient)
      : '') ||
    transaction.recipient?.name ||
    transaction.recipient_name ||
    'Penerima'
  )
}

function calculateHistory(
  summary: BankAccountSummary,
  transactions: BankTransaction[]
) {
  const accountId = summary.account.id

  const accountTransactions = transactions
    .map((transaction) => {
      const incoming = transaction.recipient_account_id === accountId
      const outgoing = transaction.account_id === accountId

      if (!incoming && !outgoing) {
        return null
      }

      return {
        transaction,
        direction: incoming ? 'in' : 'out'
      } as const
    })
    .filter(
      (
        item
      ): item is {
        transaction: BankTransaction
        direction: 'in' | 'out'
      } => item !== null
    )
    .sort((a, b) => {
      const dateCompare =
        new Date(b.transaction.transaction_date).getTime() -
        new Date(a.transaction.transaction_date).getTime()

      if (dateCompare !== 0) {
        return dateCompare
      }

      return (
        new Date(b.transaction.created_at).getTime() -
        new Date(a.transaction.created_at).getTime()
      )
    })

  let runningBalance = summary.balance

  const rows = accountTransactions.map((item) => {
    const transferAmount = Number(item.transaction.transfer_amount) || 0
    const adminFee = Number(item.transaction.admin_fee) || 0

    const row = {
      ...item,
      runningBalance
    }

    if (item.direction === 'in') {
      runningBalance -= transferAmount
    } else {
      runningBalance += transferAmount + adminFee
    }

    return row
  })

  return rows
}

function AccountCard({
  summary,
  onOpenHistory
}: {
  summary: BankAccountSummary
  onOpenHistory: () => void
}) {
  const account = summary.account

  if (!account) {
    return null
  }

  return (
    <article className="bank-account-card">
      <div className="bank-account-card-header">
        <div>
          <h2>{account.name}</h2>

          <p>
            {getAccountDisplayName(account)}
            {' • '}
            {account.bank}
            {' • '}
            {account.account_number || '—'}
          </p>
        </div>

        <button
          type="button"
          className="bank-history-button"
          onClick={onOpenHistory}
        >
          History
        </button>
      </div>

      <div className="bank-account-balance">
        <span>Saldo Saat Ini</span>
        <strong>{formatRupiah(summary.balance)}</strong>
      </div>

      <div className="bank-account-stats">
        <div>
          <span>Pencairan Masuk</span>
          <strong className="bank-income">
            {formatRupiah(summary.disbursementIncome)}
          </strong>
        </div>

        <div>
          <span>Transfer Masuk</span>
          <strong className="bank-income">
            {formatRupiah(summary.transferIncome)}
          </strong>
        </div>

        <div>
          <span>Transfer Keluar</span>
          <strong className="bank-expense">
            {formatRupiah(summary.transferExpense)}
          </strong>
        </div>
      </div>
    </article>
  )
}

export function BankPage() {
  const { user } = useAuth()

  const [overview, setOverview] = useState<BankOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [historyAccountId, setHistoryAccountId] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(1)

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null)
  const [isSavingTransaction, setIsSavingTransaction] = useState(false)
  const [isDeletingTransaction, setIsDeletingTransaction] = useState(false)
  const [createError, setCreateError] = useState('')
  const [transferForm, setTransferForm] = useState<TransferFormState>(
    createEmptyTransferForm()
  )

  const canCreateTransaction = canAccess(user?.role, 'bank.transaction.create')

  useEffect(() => {
    let cancelled = false

    void getBankOverview()
      .then((data) => {
        if (cancelled) {
          return
        }

        setOverview(data)
        setErrorMessage('')
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        console.error(error)
        setOverview(null)
        setErrorMessage('Gagal memuat data transaksi bank.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const totalSummary = useMemo(() => {
    const summaries = overview?.summaries ?? []

    return summaries.reduce(
      (total, summary) => ({
        balance: total.balance + summary.balance,
        disbursementIncome:
          total.disbursementIncome + summary.disbursementIncome,
        transferIncome: total.transferIncome + summary.transferIncome,
        transferExpense: total.transferExpense + summary.transferExpense
      }),
      {
        balance: 0,
        disbursementIncome: 0,
        transferIncome: 0,
        transferExpense: 0
      }
    )
  }, [overview])

  const historySummary = useMemo(() => {
    if (!historyAccountId || !overview) {
      return null
    }

    return (
      overview.summaries.find(
        (summary) => summary.account.id === historyAccountId
      ) ?? null
    )
  }, [historyAccountId, overview])

  const historyTransactions = useMemo(() => {
    if (!historySummary || !overview) {
      return []
    }

    return calculateHistory(historySummary, overview.transactions)
  }, [historySummary, overview])

  const historyTotalPages = Math.max(
    1,
    Math.ceil(historyTransactions.length / HISTORY_PAGE_SIZE)
  )

  const historyPageTransactions = historyTransactions.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  )

  const recipientAccounts = useMemo(() => {
    if (!overview || !transferForm.accountId) {
      return []
    }

    return getRecipientAccounts(overview.accounts, transferForm.accountId)
  }, [overview, transferForm.accountId])

  function openHistory(accountId: string) {
    setHistoryAccountId(accountId)
    setHistoryPage(1)
  }

  function closeHistory() {
    setHistoryAccountId(null)
    setHistoryPage(1)
  }

  function openCreateModal() {
    const firstAccountId = overview?.accounts[0]?.id ?? ''

    setEditingTransactionId(null)
    setTransferForm(createEmptyTransferForm(firstAccountId))
    setCreateError('')
    setIsCreateModalOpen(true)
  }

  function openEditModal(transaction: BankTransaction) {
    setHistoryAccountId(null)
    setEditingTransactionId(transaction.id)
    setTransferForm({
      transactionDate: transaction.transaction_date,
      accountId: transaction.account_id,
      recipientAccountId: transaction.recipient_account_id ?? '',
      recipientName: transaction.recipient_name ?? '',
      transferAmount: String(transaction.transfer_amount),
      adminFee: String(transaction.admin_fee),
      paymentFor: transaction.payment_for ?? ''
    })
    setCreateError('')
    setIsCreateModalOpen(true)
  }

  function closeCreateModal() {
    if (isSavingTransaction) {
      return
    }

    setIsCreateModalOpen(false)
    setEditingTransactionId(null)
    setCreateError('')
  }

  function handleTransferFormChange(
    field: keyof TransferFormState,
    value: string
  ) {
    setTransferForm((current) => ({
      ...current,
      [field]: value
    }))
  }

  function handleSenderChange(accountId: string) {
    setTransferForm((current) => {
      const recipientStillValid =
        current.recipientAccountId &&
        getRecipientAccounts(overview?.accounts ?? [], accountId).some(
          (account) => account.id === current.recipientAccountId
        )

      return {
        ...current,
        accountId,
        recipientAccountId: recipientStillValid
          ? current.recipientAccountId
          : '',
        recipientName: recipientStillValid ? current.recipientName : ''
      }
    })
  }

  function handleRecipientChange(recipientAccountId: string) {
    if (!recipientAccountId) {
      setTransferForm((current) => ({
        ...current,
        recipientAccountId: '',
        recipientName: ''
      }))
      return
    }

    const recipient = recipientAccounts.find(
      (account) => account.id === recipientAccountId
    )

    setTransferForm((current) => ({
      ...current,
      recipientAccountId,
      recipientName: recipient
        ? getAccountDisplayName(recipient)
        : current.recipientName
    }))
  }

  async function handleCreateTransaction() {
    if (isSavingTransaction || !user) {
      return
    }

    setCreateError('')

    const transferAmount = Number(transferForm.transferAmount)
    const adminFee = Number(transferForm.adminFee)

    if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
      setCreateError('Nominal transfer harus lebih dari 0.')
      return
    }

    if (!Number.isFinite(adminFee) || adminFee < 0) {
      setCreateError('Biaya admin tidak boleh negatif.')
      return
    }

    setIsSavingTransaction(true)

    const payload = {
      transaction_date: transferForm.transactionDate,
      account_id: transferForm.accountId,
      recipient_account_id: transferForm.recipientAccountId || null,
      recipient_name: transferForm.recipientName.trim(),
      transfer_amount: transferAmount,
      admin_fee: adminFee,
      payment_for: transferForm.paymentFor.trim(),
      transfer_type: 'normal' as const,
      created_by: editingTransactionId
        ? (overview?.transactions.find(
            (transaction) => transaction.id === editingTransactionId
          )?.created_by ?? user.id)
        : user.id
    }

    try {
      if (editingTransactionId) {
        await updateBankTransaction(editingTransactionId, payload)
      } else {
        await createBankTransaction(payload)
      }

      setIsCreateModalOpen(false)
      setEditingTransactionId(null)
      setTransferForm(createEmptyTransferForm())
      setLoading(true)

      const refreshedOverview = await getBankOverview()
      setOverview(refreshedOverview)
      setErrorMessage('')
    } catch (error: unknown) {
      console.error(error)

      setCreateError(
        error instanceof Error
          ? error.message
          : editingTransactionId
            ? 'Gagal mengubah transaksi bank.'
            : 'Gagal menyimpan transaksi bank.'
      )
    } finally {
      setIsSavingTransaction(false)
      setLoading(false)
    }
  }

  async function handleDeleteTransaction(transaction: BankTransaction) {
    if (isDeletingTransaction) {
      return
    }

    const confirmed = window.confirm(
      `Hapus transaksi ${formatRupiah(Number(transaction.transfer_amount) || 0)}?\n\nTindakan ini tidak dapat dibatalkan.`
    )

    if (!confirmed) {
      return
    }

    setIsDeletingTransaction(true)

    try {
      await deleteBankTransaction(transaction.id)

      if (editingTransactionId === transaction.id) {
        setIsCreateModalOpen(false)
        setEditingTransactionId(null)
      }

      setHistoryPage(1)
      setLoading(true)

      const refreshedOverview = await getBankOverview()
      setOverview(refreshedOverview)
      setErrorMessage('')
    } catch (error: unknown) {
      console.error(error)
      window.alert(
        error instanceof Error
          ? error.message
          : 'Gagal menghapus transaksi bank.'
      )
    } finally {
      setIsDeletingTransaction(false)
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        .bank-page {
          display: grid;
          gap: 14px;
        }

        .bank-hero {
          display: flex;
          min-height: 78px;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          padding: 2px 2px 0;
        }

        .bank-eyebrow {
          margin: 0 0 6px;
          color: #7f8ca2;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .bank-hero h1 {
          margin: 0;
          color: #0b132b;
          font-size: clamp(22px, 2.6vw, 30px);
          font-weight: 800;
          letter-spacing: -0.045em;
        }

        .bank-hero p {
          margin: 6px 0 0;
          color: #94a3b8;
          font-size: 11px;
        }

        .bank-period-label {
          margin: 6px 0 0;
          color: #64748b;
          font-size: 10px;
          font-weight: 700;
        }

.bank-primary-button,
        .bank-secondary-button {
          min-height: 38px;
          padding: 0 13px;
          border-radius: 9px;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }

        .bank-primary-button {
          border: 1px solid #0b132b;
          background: #0b132b;
          color: #fff;
        }

        .bank-primary-button:hover {
          background: #1e293b;
        }

        .bank-secondary-button {
          border: 1px solid #dbe3ed;
          background: #fff;
          color: #334155;
        }

        .bank-secondary-button:hover {
          background: #f8fafc;
        }

        .bank-primary-button:disabled,
        .bank-secondary-button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .bank-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 9px;
        }

        .bank-summary-card {
          min-height: 82px;
          padding: 11px 13px;
          border-radius: 12px;
        }

        .bank-summary-card span {
          color: #64748b;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .bank-summary-card strong {
          display: block;
          margin-top: 6px;
          color: #0b132b;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.15;
        }

        .bank-summary-card small {
          display: block;
          margin-top: 5px;
          color: #64748b;
          font-size: 8px;
          line-height: 1.2;
        }

        .bank-summary-card.income {
          border-color: #b7ebcf;
          background: #effcf4;
        }

        .bank-summary-card.income strong {
          color: #15803d;
        }

        .bank-summary-card.transfer-in {
          border-color: #f5c2c7;
          background: #fff1f2;
        }

        .bank-summary-card.transfer-in strong {
          color: #0b132b;
        }

        .bank-summary-card.expense {
          border-color: #f4d58a;
          background: #fff9e8;
        }

        .bank-summary-card.expense strong {
          color: #0b132b;
        }

        .bank-summary-card.balance {
          border-color: #dbe3ed;
          background: #f5f8fc;
        }

        .bank-summary-card.balance strong {
          color: #0b132b;
        }

        .bank-accounts-panel {
          padding: 12px;
        }

        .bank-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        .bank-panel-header h2 {
          margin: 0;
          color: #0b132b;
          font-size: 15px;
          font-weight: 800;
        }

        .bank-panel-header p {
          margin: 4px 0 0;
          color: #94a3b8;
          font-size: 10px;
        }

        .bank-count {
          padding: 5px 8px;
          border-radius: 7px;
          background: #f1f5f9;
          color: #64748b;
          font-size: 9px;
          font-weight: 800;
          white-space: nowrap;
        }

        .bank-account-section + .bank-account-section {
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid #eef2f7;
        }

        .bank-account-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 7px;
        }

        .bank-account-section-header h3 {
          margin: 0;
          color: #0b132b;
          font-size: 11px;
          font-weight: 800;
        }

        .bank-account-section-header span {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-size: 9px;
        }

        .bank-account-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }

        .bank-account-card {
          overflow: hidden;
          border: 1px solid #dbe3ed;
          border-radius: 12px;
          background: #fff;
        }

        .bank-account-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          padding: 11px 12px;
          border-bottom: 1px solid #eef2f7;
        }

        .bank-account-label {
          color: #7f8ca2;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .bank-account-card h2 {
          margin: 4px 0 0;
          color: #0b132b;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.25;
        }

        .bank-account-card p {
          margin: 3px 0 0;
          color: #94a3b8;
          font-size: 8px;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bank-history-button {
          min-height: 30px;
          padding: 0 10px;
          border: 1px solid #dbe3ed;
          border-radius: 8px;
          background: #fff;
          color: #334155;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .bank-history-button:hover {
          background: #f8fafc;
        }

        .bank-account-balance {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          background: #f8fafc;
        }

        .bank-account-balance span {
          color: #64748b;
          font-size: 9px;
          font-weight: 700;
        }

        .bank-account-balance strong {
          color: #0b132b;
          font-size: 14px;
          font-weight: 800;
          white-space: nowrap;
        }

        .bank-account-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          border-top: 1px solid #eef2f7;
        }

        .bank-account-stats > div {
          min-width: 0;
          padding: 8px 10px;
        }

        .bank-account-stats > div + div {
          border-left: 1px solid #eef2f7;
        }

        .bank-account-stats span {
          display: block;
          color: #94a3b8;
          font-size: 8px;
          line-height: 1.3;
        }

        .bank-account-stats strong {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          color: #334155;
          font-size: 9px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .bank-income {
          color: #15803d !important;
        }

        .bank-expense {
          color: #dc2626 !important;
        }

        .bank-empty {
          display: grid;
          min-height: 180px;
          place-items: center;
          padding: 30px;
          color: #94a3b8;
          font-size: 11px;
          text-align: center;
        }

        .bank-error {
          color: #dc2626;
        }

        .bank-modal-backdrop {
          position: fixed;
          z-index: 1000;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgb(15 23 42 / 0.52);
          backdrop-filter: blur(4px);
        }

        .bank-form-modal {
          display: grid;
          width: min(680px, 100%);
          max-height: min(850px, calc(100vh - 40px));
          overflow: hidden;
          border: 1px solid #dbe3ed;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 24px 70px rgb(15 23 42 / 0.24);
        }

        .bank-form-content {
          overflow-y: auto;
          padding: 18px;
        }

        .bank-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .bank-form-grid label {
          display: grid;
          gap: 6px;
        }

        .bank-form-grid label > span {
          color: #64748b;
          font-size: 9px;
          font-weight: 800;
        }

        .bank-form-grid input,
        .bank-form-grid select {
          width: 100%;
          min-height: 40px;
          box-sizing: border-box;
          border: 1px solid #dbe3ed;
          border-radius: 9px;
          background: #fff;
          padding: 0 11px;
          color: #0b132b;
          font-size: 11px;
          outline: none;
        }

        .bank-form-grid input:focus,
        .bank-form-grid select:focus {
          border-color: #94a3b8;
          box-shadow: 0 0 0 3px rgb(148 163 184 / 0.12);
        }

        .bank-form-grid input:disabled,
        .bank-form-grid select:disabled {
          background: #f8fafc;
          color: #94a3b8;
        }

        .bank-form-field-full {
          grid-column: 1 / -1;
        }

        .bank-form-error {
          margin-top: 14px;
          padding: 10px 12px;
          border: 1px solid #fecdd3;
          border-radius: 9px;
          background: #fff1f2;
          color: #be123c;
          font-size: 10px;
        }

        .bank-form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid #eef2f7;
        }

.bank-history-modal {
          display: grid;
          width: min(900px, 100%);
          max-height: min(850px, calc(100vh - 40px));
          overflow: hidden;
          border: 1px solid #dbe3ed;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 24px 70px rgb(15 23 42 / 0.24);
        }

        .bank-history-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          padding: 18px;
          border-bottom: 1px solid #eef2f7;
        }

        .bank-history-modal-header h2 {
          margin: 0;
          color: #0b132b;
          font-size: 16px;
          font-weight: 800;
        }

        .bank-history-modal-header p {
          margin: 4px 0 0;
          color: #94a3b8;
          font-size: 10px;
        }

        .bank-modal-close {
          width: 32px;
          height: 32px;
          border: 1px solid #dbe3ed;
          border-radius: 8px;
          background: #fff;
          color: #64748b;
          font-size: 17px;
          cursor: pointer;
        }

        .bank-history-summary {
          display: grid;
          grid-template-columns: 1.2fr repeat(4, 1fr);
          border-bottom: 1px solid #eef2f7;
        }

        .bank-history-current {
          padding: 15px;
          background: #0b132b;
        }

        .bank-history-current span,
        .bank-history-stat span {
          display: block;
          color: #7f8ca2;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }

        .bank-history-current span {
          color: #94a3b8;
        }

        .bank-history-current strong {
          display: block;
          margin-top: 7px;
          color: #fff;
          font-size: 15px;
        }

        .bank-history-stat {
          padding: 15px;
          border-left: 1px solid #eef2f7;
        }

        .bank-history-stat strong {
          display: block;
          margin-top: 7px;
          color: #334155;
          font-size: 11px;
        }

        .bank-history-content {
          overflow: auto;
          padding: 14px;
        }

        .bank-history-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 14px;
          padding: 14px;
          border: 1px solid #e5eaf0;
          border-radius: 11px;
          background: #fff;
        }

        .bank-history-row + .bank-history-row {
          margin-top: 9px;
        }

        .bank-history-row.incoming {
          border-left: 3px solid #16a34a;
        }

        .bank-history-row.outgoing {
          border-left: 3px solid #dc2626;
        }

        .bank-history-main {
          min-width: 0;
        }

        .bank-history-top {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 7px;
        }

        .bank-history-top strong {
          color: #0b132b;
          font-size: 11px;
          font-weight: 800;
        }

        .bank-history-badge {
          padding: 3px 6px;
          border-radius: 6px;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .bank-history-badge.incoming {
          background: #ecfdf3;
          color: #15803d;
        }

        .bank-history-badge.outgoing {
          background: #fff1f2;
          color: #be123c;
        }

        .bank-history-meta {
          margin-top: 5px;
          color: #94a3b8;
          font-size: 9px;
        }

        .bank-history-purpose {
          margin-top: 8px;
          color: #64748b;
          font-size: 9px;
        }

        .bank-history-purpose strong {
          color: #334155;
        }

        .bank-history-values {
          min-width: 145px;
          text-align: right;
        }

        .bank-history-values > strong {
          display: block;
          color: #0b132b;
          font-size: 12px;
          font-weight: 800;
        }

        .bank-history-values p {
          margin: 5px 0 0;
          color: #94a3b8;
          font-size: 9px;
        }

        .bank-history-balance {
          margin-top: 5px !important;
          color: #334155 !important;
          font-weight: 700;
        }

        .bank-history-actions {
          display: flex;
          justify-content: flex-end;
          gap: 6px;
          margin-top: 8px;
        }

        .bank-history-action {
          min-height: 28px;
          padding: 0 9px;
          border: 1px solid #dbe3ed;
          border-radius: 7px;
          background: #fff;
          color: #475569;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .bank-history-action:hover {
          background: #f8fafc;
        }

        .bank-history-action.edit {
          color: #0f5fbd;
        }

        .bank-history-action.delete {
          border-color: #fecaca;
          color: #dc2626;
        }

        .bank-history-action.delete:hover {
          background: #fff1f2;
        }

        .bank-history-action:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .bank-history-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 2px 2px;
        }

        .bank-history-pagination-info {
          color: #94a3b8;
          font-size: 9px;
        }

        .bank-history-pagination-buttons {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .bank-history-page {
          min-width: 29px;
          height: 29px;
          padding: 0 7px;
          border: 1px solid #dbe3ed;
          border-radius: 7px;
          background: #fff;
          color: #64748b;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .bank-history-page.active {
          border-color: #0b132b;
          background: #0b132b;
          color: #fff;
        }

        .bank-history-page:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        @media (max-width: 1400px) {
          .bank-account-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }

        @media (max-width: 1100px) {
          .bank-account-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .bank-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .bank-account-grid {
            grid-template-columns: 1fr;
          }

          .bank-history-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .bank-history-current {
            grid-column: 1 / -1;
          }

          .bank-history-stat:nth-child(3) {
            border-left: 0;
          }
        }

        @media (max-width: 600px) {
          .bank-hero {
            align-items: flex-start;
            flex-direction: column;
          }

          .bank-summary-grid {
            grid-template-columns: 1fr;
          }

          .bank-form-grid {
            grid-template-columns: 1fr;
          }

          .bank-form-field-full {
            grid-column: auto;
          }

          .bank-form-actions {
            flex-direction: column-reverse;
          }

          .bank-primary-button,
          .bank-secondary-button {
            width: 100%;
          }

          .bank-account-stats {
            grid-template-columns: 1fr;
          }

          .bank-account-stats > div + div {
            border-top: 1px solid #eef2f7;
            border-left: 0;
          }

          .bank-history-summary {
            grid-template-columns: 1fr 1fr;
          }

          .bank-history-row {
            grid-template-columns: 1fr;
          }

          .bank-history-values {
            min-width: 0;
            text-align: left;
          }

          .bank-history-pagination {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      <div className="bank-page">
        <section className="bank-hero">
          <div>
            <p className="bank-eyebrow">SIM SPPG • TRANSAKSI BANK</p>

            <h1>Transaksi Bank</h1>

            <p>Pantau saldo rekening dan riwayat perpindahan dana.</p>
            <p className="bank-period-label">
              Periode: 20 Juli 2026 – Hari Ini
            </p>
          </div>

          {canCreateTransaction ? (
            <button
              type="button"
              className="bank-primary-button"
              onClick={openCreateModal}
              disabled={!overview?.accounts.length}
            >
              + Transfer
            </button>
          ) : null}
        </section>

        {loading ? (
          <section className="bank-accounts-panel">
            <div className="bank-empty">Memuat data rekening...</div>
          </section>
        ) : errorMessage ? (
          <section className="bank-accounts-panel">
            <div className="bank-empty bank-error">{errorMessage}</div>
          </section>
        ) : (
          <>
            <section className="bank-summary-grid">
              <article className="bank-summary-card income">
                <span>Total Pencairan Masuk</span>
                <strong>{formatRupiah(totalSummary.disbursementIncome)}</strong>
                <small>dari pencairan dashboard</small>
              </article>

              <article className="bank-summary-card transfer-in">
                <span>Total Transfer Masuk</span>
                <strong>{formatRupiah(totalSummary.transferIncome)}</strong>
                <small>dari transfer antar rekening</small>
              </article>

              <article className="bank-summary-card expense">
                <span>Total Transfer Keluar</span>
                <strong>{formatRupiah(totalSummary.transferExpense)}</strong>
                <small>termasuk biaya admin</small>
              </article>

              <article className="bank-summary-card balance">
                <span>Total Saldo Akhir</span>
                <strong>{formatRupiah(totalSummary.balance)}</strong>
                <small>(saldo awal + masuk) - keluar</small>
              </article>
            </section>

            <section className="bank-accounts-panel">
              <div className="bank-panel-header">
                <div>
                  <h2>Rekening</h2>

                  <p>Klik History untuk melihat detail per rekening.</p>
                </div>

                <span className="bank-count">
                  {overview?.summaries.length ?? 0} rekening
                </span>
              </div>

              {overview?.summaries.length ? (
                (() => {
                  const groups = getAccountGroups(overview.summaries)

                  const renderGroup = (
                    title: string,
                    items: BankAccountSummary[]
                  ) => {
                    if (items.length === 0) {
                      return null
                    }

                    return (
                      <section className="bank-account-section" key={title}>
                        <div className="bank-account-section-header">
                          <div>
                            <h3>{title}</h3>
                            <span>{items.length} rekening</span>
                          </div>
                        </div>

                        <div className="bank-account-grid">
                          {items.map((summary) => (
                            <AccountCard
                              key={summary.account.id}
                              summary={summary}
                              onOpenHistory={() =>
                                openHistory(summary.account.id)
                              }
                            />
                          ))}
                        </div>
                      </section>
                    )
                  }

                  return (
                    <>
                      {renderGroup('Rekening Penampung', groups.holding)}
                      {renderGroup('Rekening Prioritas', groups.priority)}
                      {renderGroup('Rekening Lainnya', groups.others)}
                    </>
                  )
                })()
              ) : (
                <div className="bank-empty">
                  Tidak ada rekening yang tersedia.
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {isCreateModalOpen ? (
        <div
          className="bank-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal()
            }
          }}
        >
          <section
            className="bank-form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-create-title"
          >
            <header className="bank-history-modal-header">
              <div>
                <h2 id="bank-create-title">
                  {editingTransactionId
                    ? 'Edit Transaksi Bank'
                    : 'Tambah Transaksi Bank'}
                </h2>
                <p>
                  {editingTransactionId
                    ? 'Ubah detail transaksi. Rekening pengirim dan tujuan tetap mengikuti transaksi awal.'
                    : 'Catat transfer antar rekening atau transfer ke penerima bebas.'}
                </p>
              </div>

              <button
                type="button"
                className="bank-modal-close"
                onClick={closeCreateModal}
                disabled={isSavingTransaction}
                aria-label="Tutup form"
              >
                ×
              </button>
            </header>

            <div className="bank-form-content">
              <div className="bank-form-grid">
                <label>
                  <span>Tanggal</span>
                  <input
                    type="date"
                    min={BANK_MODULE_START_DATE}
                    value={transferForm.transactionDate}
                    disabled={isSavingTransaction}
                    onChange={(event) =>
                      handleTransferFormChange(
                        'transactionDate',
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>Rekening Pengirim</span>
                  <select
                    value={transferForm.accountId}
                    disabled={
                      isSavingTransaction || Boolean(editingTransactionId)
                    }
                    onChange={(event) => handleSenderChange(event.target.value)}
                  >
                    <option value="">Pilih rekening</option>
                    {(overview?.accounts ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {getAccountLabel(account)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Rekening Tujuan</span>
                  <select
                    value={transferForm.recipientAccountId}
                    disabled={
                      isSavingTransaction ||
                      Boolean(editingTransactionId) ||
                      !transferForm.accountId
                    }
                    onChange={(event) =>
                      handleRecipientChange(event.target.value)
                    }
                  >
                    <option value="">Transfer bebas / tidak terdaftar</option>
                    {recipientAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {getAccountLabel(account)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Nama Penerima</span>
                  <input
                    type="text"
                    value={transferForm.recipientName}
                    disabled={isSavingTransaction}
                    placeholder="Nama penerima"
                    onChange={(event) =>
                      handleTransferFormChange(
                        'recipientName',
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>Nominal Transfer</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={transferForm.transferAmount}
                    disabled={isSavingTransaction}
                    placeholder="0"
                    onChange={(event) =>
                      handleTransferFormChange(
                        'transferAmount',
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>Biaya Admin</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={transferForm.adminFee}
                    disabled={isSavingTransaction}
                    placeholder="0"
                    onChange={(event) =>
                      handleTransferFormChange('adminFee', event.target.value)
                    }
                  />
                </label>

                <label className="bank-form-field-full">
                  <span>Keperluan</span>
                  <input
                    type="text"
                    value={transferForm.paymentFor}
                    disabled={isSavingTransaction}
                    placeholder="Contoh: transfer dana supplier"
                    onChange={(event) =>
                      handleTransferFormChange('paymentFor', event.target.value)
                    }
                  />
                </label>
              </div>

              {createError ? (
                <div className="bank-form-error" role="alert">
                  {createError}
                </div>
              ) : null}

              <div className="bank-form-actions">
                <button
                  type="button"
                  className="bank-secondary-button"
                  disabled={isSavingTransaction}
                  onClick={closeCreateModal}
                >
                  Batal
                </button>

                <button
                  type="button"
                  className="bank-primary-button"
                  disabled={
                    isSavingTransaction ||
                    !transferForm.accountId ||
                    !transferForm.recipientName.trim() ||
                    !transferForm.transferAmount
                  }
                  onClick={() => void handleCreateTransaction()}
                >
                  {isSavingTransaction
                    ? 'Menyimpan...'
                    : editingTransactionId
                      ? 'Simpan Perubahan'
                      : 'Simpan Transfer'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {historySummary && historyAccountId ? (
        <div
          className="bank-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeHistory()
            }
          }}
        >
          <section
            className="bank-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-history-title"
          >
            <header className="bank-history-modal-header">
              <div>
                <h2 id="bank-history-title">History Rekening</h2>

                <p>
                  {historySummary.account.name}
                  {' • '}
                  {historySummary.account.bank}
                  {' • '}
                  {historySummary.account.account_number || '—'}
                  {' • '}
                  Periode 20 Juli 2026 – Hari Ini
                </p>
              </div>

              <button
                type="button"
                className="bank-modal-close"
                onClick={closeHistory}
                aria-label="Tutup history"
              >
                ×
              </button>
            </header>

            <div className="bank-history-summary">
              <div className="bank-history-current">
                <span>Saldo Saat Ini</span>

                <strong>{formatRupiah(historySummary.balance)}</strong>
              </div>

              <div className="bank-history-stat">
                <span>Saldo Awal</span>

                <strong>
                  {formatRupiah(Number(historySummary.account.opening_balance))}
                </strong>
              </div>

              <div className="bank-history-stat">
                <span>Pencairan Masuk</span>

                <strong className="bank-income">
                  {formatRupiah(historySummary.disbursementIncome)}
                </strong>
              </div>

              <div className="bank-history-stat">
                <span>Transfer Masuk</span>

                <strong className="bank-income">
                  {formatRupiah(historySummary.transferIncome)}
                </strong>
              </div>

              <div className="bank-history-stat">
                <span>Transfer Keluar</span>

                <strong className="bank-expense">
                  {formatRupiah(historySummary.transferExpense)}
                </strong>
              </div>
            </div>

            <div className="bank-history-content">
              {historyPageTransactions.length === 0 ? (
                <div className="bank-empty">
                  Tidak ada transaksi pada periode ini.
                </div>
              ) : (
                <>
                  {historyPageTransactions.map((item) => {
                    const transaction = item.transaction
                    const incoming = item.direction === 'in'
                    const transferAmount =
                      Number(transaction.transfer_amount) || 0
                    const adminFee = Number(transaction.admin_fee) || 0
                    const total = transferAmount + adminFee

                    return (
                      <article
                        className={`bank-history-row ${
                          incoming ? 'incoming' : 'outgoing'
                        }`}
                        key={`${item.direction}-${transaction.id}`}
                      >
                        <div className="bank-history-main">
                          <div className="bank-history-top">
                            <strong>
                              {getPartnerName(transaction, incoming)}
                            </strong>

                            <span
                              className={`bank-history-badge ${
                                incoming ? 'incoming' : 'outgoing'
                              }`}
                            >
                              {incoming ? 'TRANSFER MASUK' : 'TRANSFER KELUAR'}
                            </span>
                          </div>

                          <div className="bank-history-meta">
                            {formatDate(transaction.transaction_date)}
                            {' • '}
                            {formatDateTime(transaction.created_at)}
                          </div>

                          {transaction.payment_for?.trim() ? (
                            <div className="bank-history-purpose">
                              Keperluan:{' '}
                              <strong>{transaction.payment_for.trim()}</strong>
                            </div>
                          ) : null}
                        </div>

                        <div className="bank-history-values">
                          <strong
                            className={
                              incoming ? 'bank-income' : 'bank-expense'
                            }
                          >
                            {incoming ? '+' : '-'}
                            {formatRupiah(incoming ? transferAmount : total)}
                          </strong>

                          {!incoming && adminFee > 0 ? (
                            <p>Admin: {formatRupiah(adminFee)}</p>
                          ) : null}

                          <p className="bank-history-balance">
                            Saldo: {formatRupiah(item.runningBalance)}
                          </p>

                          {canCreateTransaction ? (
                            <div className="bank-history-actions">
                              <button
                                type="button"
                                className="bank-history-action edit"
                                disabled={isDeletingTransaction}
                                onClick={() => openEditModal(transaction)}
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="bank-history-action delete"
                                disabled={isDeletingTransaction}
                                onClick={() =>
                                  void handleDeleteTransaction(transaction)
                                }
                              >
                                Hapus
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    )
                  })}

                  {historyTotalPages > 1 ? (
                    <div className="bank-history-pagination">
                      <span className="bank-history-pagination-info">
                        Menampilkan {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}–
                        {Math.min(
                          historyPage * HISTORY_PAGE_SIZE,
                          historyTransactions.length
                        )}{' '}
                        dari {historyTransactions.length} transaksi
                      </span>

                      <div className="bank-history-pagination-buttons">
                        <button
                          type="button"
                          className="bank-history-page"
                          disabled={historyPage === 1}
                          onClick={() =>
                            setHistoryPage((page) => Math.max(1, page - 1))
                          }
                        >
                          ←
                        </button>

                        {Array.from(
                          { length: historyTotalPages },
                          (_, index) => index + 1
                        ).map((page) => (
                          <button
                            key={page}
                            type="button"
                            className={`bank-history-page ${
                              page === historyPage ? 'active' : ''
                            }`}
                            onClick={() => setHistoryPage(page)}
                          >
                            {page}
                          </button>
                        ))}

                        <button
                          type="button"
                          className="bank-history-page"
                          disabled={historyPage === historyTotalPages}
                          onClick={() =>
                            setHistoryPage((page) =>
                              Math.min(historyTotalPages, page + 1)
                            )
                          }
                        >
                          →
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      <div
        style={{
          display: 'none'
        }}
      >
        {user?.role}
      </div>
    </>
  )
}
