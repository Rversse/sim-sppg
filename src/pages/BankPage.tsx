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
    if (!canCreateTransaction) return

    const firstAccountId = overview?.accounts[0]?.id ?? ''

    setEditingTransactionId(null)
    setTransferForm(createEmptyTransferForm(firstAccountId))
    setCreateError('')
    setIsCreateModalOpen(true)
  }

  function openEditModal(transaction: BankTransaction) {
    if (!canCreateTransaction) return

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
    if (!canCreateTransaction || isDeletingTransaction) {
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

      <div className="app-sr-only">{user?.role}</div>
    </>
  )
}
