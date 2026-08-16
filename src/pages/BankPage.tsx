import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'

import {
  createBankTransaction,
  deleteBankTransaction,
  getAccountDisplayName,
  getAccountLabel,
  getBankHistoryPage,
  getBankOverview,
  getPaymentHistory,
  getRecipientAccounts,
  getRecipientHistory,
  isPriorityAccount,
  updateBankTransaction,
  type BankAccount,
  type BankAccountSummary,
  type BankHistoryPage,
  type BankOverview,
  type BankTransaction,
  type RecipientHistoryOption
} from '@/features/bank/bank-service'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'

const HISTORY_PAGE_SIZE = 10
const BANK_MODULE_START_DATE = '2026-07-20'
const MAX_AUTOCOMPLETE_RESULTS = 5

const PRIORITY_OWNERS = [
  'DEDE JAELANI',
  'AYI SUHERLAN',
  'TAUFIK SUKALARANG'
] as const

type TransferDestinationMode = '' | 'holding' | 'priority' | 'free'

type TransferFormState = {
  transactionDate: string
  accountId: string
  destinationMode: TransferDestinationMode
  recipientAccountId: string
  recipientName: string
  transferAmount: string
  adminFee: string
  paymentFor: string
}

function getTodayLocal() {
  const now = new Date()

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')
}

function createEmptyTransferForm(): TransferFormState {
  return {
    transactionDate: getTodayLocal(),
    accountId: '',
    destinationMode: '',
    recipientAccountId: '',
    recipientName: '',
    transferAmount: '',
    adminFee: '',
    paymentFor: ''
  }
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value)
}

function formatIntegerInput(value: string) {
  const digits = value.replace(/\\D/g, '')

  if (!digits) return ''

  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0
  }).format(Number(digits))
}

function parseIntegerInput(value: string) {
  const digits = value.replace(/\\D/g, '')

  return digits ? Number(digits) : 0
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

function getPaginationPages(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages: Array<number | 'ellipsis'> = [1]

  if (currentPage > 4) pages.push('ellipsis')

  for (
    let page = Math.max(2, currentPage - 1);
    page <= Math.min(totalPages - 1, currentPage + 1);
    page += 1
  ) {
    pages.push(page)
  }

  if (currentPage < totalPages - 3) pages.push('ellipsis')

  pages.push(totalPages)

  return pages
}

function getPriorityIndex(account: BankAccount) {
  const owner = getAccountDisplayName(account).trim().toUpperCase()

  return PRIORITY_OWNERS.indexOf(owner as (typeof PRIORITY_OWNERS)[number])
}

function getAccountGroups(summaries: BankAccountSummary[]) {
  const holding: BankAccountSummary[] = []
  const priority: BankAccountSummary[] = []
  const others: BankAccountSummary[] = []

  for (const summary of summaries) {
    if (summary.account.is_holding_destination) {
      holding.push(summary)
      continue
    }

    if (isPriorityAccount(summary.account, PRIORITY_OWNERS)) {
      priority.push(summary)
      continue
    }

    others.push(summary)
  }

  const sortByName = (a: BankAccountSummary, b: BankAccountSummary) =>
    getAccountDisplayName(a.account).localeCompare(
      getAccountDisplayName(b.account),
      'id'
    )

  holding.sort(sortByName)
  priority.sort((a, b) => {
    const priorityDelta =
      getPriorityIndex(a.account) - getPriorityIndex(b.account)

    return priorityDelta !== 0 ? priorityDelta : sortByName(a, b)
  })
  others.sort(sortByName)

  return { holding, priority, others }
}

function getSenderBalance(overview: BankOverview | null, accountId: string) {
  const summary = overview?.summaries.find(
    (item) => item.account.id === accountId
  )

  if (summary) {
    return summary.balance
  }

  const account = overview?.accounts.find((item) => item.id === accountId)

  return Number(account?.opening_balance) || 0
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

function AccountCard({
  summary,
  onOpenHistory
}: {
  summary: BankAccountSummary
  onOpenHistory: () => void
}) {
  const account = summary.account

  return (
    <article className="bank-account-card">
      <div className="bank-account-card-header">
        <div>
          <span className="bank-account-label">
            {account.is_holding_destination ? 'PENAMPUNG' : 'REKENING'}
          </span>
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
          Riwayat
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
  const [historyPageData, setHistoryPageData] =
    useState<BankHistoryPage | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null)
  const [editingTransactionCreatedBy, setEditingTransactionCreatedBy] =
    useState('')
  const [isSavingTransaction, setIsSavingTransaction] = useState(false)
  const [isDeletingTransaction, setIsDeletingTransaction] = useState(false)
  const [createError, setCreateError] = useState('')

  const [transferForm, setTransferForm] = useState<TransferFormState>(
    createEmptyTransferForm()
  )

  const [recipientHistory, setRecipientHistory] = useState<
    RecipientHistoryOption[]
  >([])
  const [paymentHistory, setPaymentHistory] = useState<string[]>([])
  const [recipientQuery, setRecipientQuery] = useState('')
  const [paymentQuery, setPaymentQuery] = useState('')
  const [recipientAutocompleteOpen, setRecipientAutocompleteOpen] =
    useState(false)
  const [paymentAutocompleteOpen, setPaymentAutocompleteOpen] = useState(false)

  const canCreateTransaction = canAccess(user?.role, 'bank.transaction.create')

  useEffect(() => {
    let cancelled = false

    void getBankOverview()
      .then((data) => {
        if (cancelled) return

        setOverview(data)
        setErrorMessage('')
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return

        console.error(error)
        setOverview(null)
        setErrorMessage('Gagal memuat transaksi bank.')
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

  const historySummary = useMemo(
    () =>
      overview?.summaries.find(
        (summary) => summary.account.id === historyAccountId
      ) ?? null,
    [historyAccountId, overview]
  )

  const historyTotal = historyPageData?.total ?? 0
  const historyTotalPages = Math.max(
    1,
    Math.ceil(historyTotal / HISTORY_PAGE_SIZE)
  )
  const historyTransactions = historyPageData?.transactions ?? []
  const historyPages = getPaginationPages(historyPage, historyTotalPages)

  const senderAccounts = useMemo(() => {
    if (!overview) {
      return {
        holding: [] as BankAccount[],
        priority: [] as BankAccount[],
        others: [] as BankAccount[]
      }
    }

    const holding: BankAccount[] = []
    const priority: BankAccount[] = []
    const others: BankAccount[] = []

    for (const account of overview.accounts) {
      if (account.is_holding_destination) {
        holding.push(account)
        continue
      }

      if (isPriorityAccount(account, PRIORITY_OWNERS)) {
        priority.push(account)
        continue
      }

      others.push(account)
    }

    const sortByName = (a: BankAccount, b: BankAccount) =>
      getAccountDisplayName(a).localeCompare(getAccountDisplayName(b), 'id', {
        sensitivity: 'base'
      })

    holding.sort(sortByName)
    others.sort(sortByName)

    priority.sort((a, b) => {
      const aIndex = PRIORITY_OWNERS.indexOf(
        getAccountDisplayName(a)
          .trim()
          .toUpperCase() as (typeof PRIORITY_OWNERS)[number]
      )
      const bIndex = PRIORITY_OWNERS.indexOf(
        getAccountDisplayName(b)
          .trim()
          .toUpperCase() as (typeof PRIORITY_OWNERS)[number]
      )

      if (aIndex !== bIndex) return aIndex - bIndex

      return sortByName(a, b)
    })

    return { holding, priority, others }
  }, [overview])

  const registeredRecipientAccounts = useMemo(() => {
    if (!overview || !transferForm.accountId) return []

    if (transferForm.destinationMode === 'holding') {
      return getRecipientAccounts(
        overview.accounts,
        transferForm.accountId,
        'holding',
        PRIORITY_OWNERS
      )
    }

    if (transferForm.destinationMode === 'priority') {
      return getRecipientAccounts(
        overview.accounts,
        transferForm.accountId,
        'priority',
        PRIORITY_OWNERS
      )
    }

    return []
  }, [overview, transferForm.accountId, transferForm.destinationMode])

  const senderBalance = useMemo(
    () => getSenderBalance(overview, transferForm.accountId),
    [overview, transferForm.accountId]
  )

  const isRegisteredMode =
    transferForm.destinationMode === 'holding' ||
    transferForm.destinationMode === 'priority'

  const hasDestination = isRegisteredMode
    ? Boolean(transferForm.recipientAccountId)
    : transferForm.destinationMode === 'free'
      ? Boolean(transferForm.recipientName.trim())
      : false

  const recipientSuggestions = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase()

    return recipientHistory
      .filter((item) => !query || item.label.toLowerCase().includes(query))
      .slice(0, MAX_AUTOCOMPLETE_RESULTS)
  }, [recipientHistory, recipientQuery])

  const paymentSuggestions = useMemo(() => {
    const query = paymentQuery.trim().toLowerCase()

    return paymentHistory
      .filter((item) => !query || item.toLowerCase().includes(query))
      .slice(0, MAX_AUTOCOMPLETE_RESULTS)
  }, [paymentHistory, paymentQuery])

  useEffect(() => {
    if (!historyAccountId || !historySummary) return

    let cancelled = false

    void getBankHistoryPage(
      historyAccountId,
      historyPage,
      HISTORY_PAGE_SIZE,
      historySummary.balance
    )
      .then((data) => {
        if (cancelled) return

        setHistoryPageData(data)
        setHistoryError('')
      })
      .catch((error: unknown) => {
        if (cancelled) return

        console.error(error)
        setHistoryPageData(null)
        setHistoryError(
          error instanceof Error
            ? error.message
            : 'Gagal memuat riwayat rekening.'
        )
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [historyAccountId, historyPage, historySummary])

  useEffect(() => {
    if (!isCreateModalOpen) return

    let cancelled = false

    void Promise.all([
      getRecipientHistory(BANK_MODULE_START_DATE),
      getPaymentHistory(BANK_MODULE_START_DATE)
    ])
      .then(([recipientData, paymentData]) => {
        if (cancelled) return

        setRecipientHistory(recipientData)
        setPaymentHistory(paymentData)
      })
      .catch((error: unknown) => {
        console.error(error)
      })

    return () => {
      cancelled = true
    }
  }, [isCreateModalOpen])

  function resetAutocomplete() {
    setRecipientQuery('')
    setPaymentQuery('')
    setRecipientAutocompleteOpen(false)
    setPaymentAutocompleteOpen(false)
  }

  function openHistory(accountId: string) {
    setHistoryLoading(true)
    setHistoryAccountId(accountId)
    setHistoryPage(1)
    setHistoryPageData(null)
    setHistoryError('')
  }

  function closeHistory() {
    setHistoryAccountId(null)
    setHistoryPage(1)
    setHistoryPageData(null)
    setHistoryError('')
  }

  function openCreateModal() {
    setEditingTransactionId(null)
    setEditingTransactionCreatedBy('')
    setTransferForm(createEmptyTransferForm())
    setCreateError('')
    resetAutocomplete()
    setIsCreateModalOpen(true)
  }

  function openEditModal(transaction: BankTransaction) {
    const editMode: TransferDestinationMode = transaction.recipient_account_id
      ? transaction.recipient
        ? transaction.recipient.is_holding_destination
          ? 'holding'
          : isPriorityAccount(transaction.recipient, PRIORITY_OWNERS)
            ? 'priority'
            : 'holding'
        : 'holding'
      : 'free'

    setHistoryAccountId(null)
    setEditingTransactionId(transaction.id)
    setEditingTransactionCreatedBy(transaction.created_by ?? '')
    setTransferForm({
      transactionDate: transaction.transaction_date,
      accountId: transaction.account_id,
      destinationMode: editMode,
      recipientAccountId: transaction.recipient_account_id ?? '',
      recipientName: transaction.recipient_name ?? '',
      transferAmount: formatIntegerInput(String(transaction.transfer_amount)),
      adminFee: formatIntegerInput(String(transaction.admin_fee)),
      paymentFor: transaction.payment_for ?? ''
    })
    setRecipientQuery(transaction.recipient_name ?? '')
    setPaymentQuery(transaction.payment_for ?? '')
    setRecipientAutocompleteOpen(false)
    setPaymentAutocompleteOpen(false)
    setCreateError('')
    setIsCreateModalOpen(true)
  }

  function closeCreateModal() {
    if (isSavingTransaction) return

    setIsCreateModalOpen(false)
    setEditingTransactionId(null)
    setEditingTransactionCreatedBy('')
    setCreateError('')
    resetAutocomplete()
  }

  function handleSenderChange(accountId: string) {
    setTransferForm((current) => ({
      ...current,
      accountId,
      destinationMode: '',
      recipientAccountId: '',
      recipientName: '',
      transferAmount: '',
      adminFee: '',
      paymentFor: ''
    }))

    resetAutocomplete()
  }

  function handleDestinationModeChange(mode: TransferDestinationMode) {
    setTransferForm((current) => ({
      ...current,
      destinationMode: mode,
      recipientAccountId: '',
      recipientName: ''
    }))

    resetAutocomplete()
  }

  function handleRegisteredRecipientChange(recipientAccountId: string) {
    const recipient = registeredRecipientAccounts.find(
      (account) => account.id === recipientAccountId
    )

    setTransferForm((current) => ({
      ...current,
      recipientAccountId,
      recipientName: recipient ? getAccountDisplayName(recipient) : ''
    }))

    setPaymentQuery('')
    setPaymentAutocompleteOpen(false)
  }

  function handleFreeRecipientChange(value: string) {
    setTransferForm((current) => ({
      ...current,
      recipientAccountId: '',
      recipientName: value
    }))

    setRecipientQuery(value)
    setRecipientAutocompleteOpen(true)
  }

  function selectRecipientSuggestion(option: RecipientHistoryOption) {
    setTransferForm((current) => ({
      ...current,
      recipientAccountId: '',
      recipientName: option.value
    }))

    setRecipientQuery(option.value)
    setRecipientAutocompleteOpen(false)
  }

  function selectPaymentSuggestion(value: string) {
    setTransferForm((current) => ({
      ...current,
      paymentFor: value
    }))

    setPaymentQuery(value)
    setPaymentAutocompleteOpen(false)
  }

  async function handleSaveTransaction() {
    if (isSavingTransaction || !user) return

    setCreateError('')

    if (!transferForm.accountId) {
      setCreateError('Pilih rekening pengirim.')
      return
    }

    if (!hasDestination) {
      setCreateError('Pilih atau isi tujuan transfer.')
      return
    }

    const transferAmount = parseIntegerInput(transferForm.transferAmount)
    const adminFee = parseIntegerInput(transferForm.adminFee)

    if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
      setCreateError('Nominal transfer harus lebih dari 0.')
      return
    }

    if (!Number.isFinite(adminFee) || adminFee < 0) {
      setCreateError('Biaya admin tidak boleh negatif.')
      return
    }

    setIsSavingTransaction(true)

    try {
      const payload = {
        transaction_date: transferForm.transactionDate,
        account_id: transferForm.accountId,
        recipient_account_id:
          isRegisteredMode && transferForm.recipientAccountId
            ? transferForm.recipientAccountId
            : null,
        recipient_name: transferForm.recipientName.trim(),
        transfer_amount: transferAmount,
        admin_fee: adminFee,
        payment_for: transferForm.paymentFor.trim(),
        transfer_type: 'normal' as const,
        created_by: editingTransactionId
          ? editingTransactionCreatedBy || user.id
          : user.id
      }

      if (editingTransactionId) {
        await updateBankTransaction(editingTransactionId, payload)
      } else {
        await createBankTransaction(payload)
      }

      const refreshedOverview = await getBankOverview()

      setOverview(refreshedOverview)
      closeCreateModal()
    } catch (error: unknown) {
      console.error(error)

      setCreateError(
        error instanceof Error
          ? error.message
          : editingTransactionId
            ? 'Gagal mengubah transfer.'
            : 'Gagal menyimpan transfer.'
      )
    } finally {
      setIsSavingTransaction(false)
    }
  }

  async function handleDeleteTransaction(transaction: BankTransaction) {
    if (isDeletingTransaction) return

    const confirmed = window.confirm(
      `Hapus transfer ${formatRupiah(Number(transaction.transfer_amount) || 0)}?\n\nTindakan ini tidak dapat dibatalkan.`
    )

    if (!confirmed) return

    setIsDeletingTransaction(true)

    try {
      await deleteBankTransaction(transaction.id)

      if (editingTransactionId === transaction.id) {
        closeCreateModal()
      }

      const refreshedOverview = await getBankOverview()
      setOverview(refreshedOverview)
      setHistoryPage(1)
    } catch (error: unknown) {
      console.error(error)
      window.alert(
        error instanceof Error ? error.message : 'Gagal menghapus transfer.'
      )
    } finally {
      setIsDeletingTransaction(false)
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
                  <p>Klik Riwayat untuk melihat detail per rekening.</p>
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
                    if (!items.length) return null

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
            if (event.target === event.currentTarget) closeCreateModal()
          }}
        >
          <section
            className="bank-form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-transfer-title"
          >
            <header className="bank-history-modal-header">
              <div>
                <h2 id="bank-transfer-title">
                  {editingTransactionId
                    ? 'Edit Transaksi Bank'
                    : 'Tambah Transaksi Bank'}
                </h2>
                <p>
                  {editingTransactionId
                    ? 'Ubah detail transaksi bank sesuai transaksi awal.'
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
                <X aria-hidden="true" />
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
                      setTransferForm((current) => ({
                        ...current,
                        transactionDate: event.target.value
                      }))
                    }
                  />
                </label>

                <label>
                  <span>Nama Pengirim</span>
                  <select
                    value={transferForm.accountId}
                    disabled={
                      isSavingTransaction || Boolean(editingTransactionId)
                    }
                    onChange={(event) => handleSenderChange(event.target.value)}
                  >
                    <option value="">Pilih Pengirim</option>

                    {senderAccounts.holding.length ? (
                      <optgroup label="Rekening Penampung">
                        {senderAccounts.holding.map((account) => (
                          <option key={account.id} value={account.id}>
                            {getAccountLabel(account)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}

                    {senderAccounts.priority.length ? (
                      <optgroup label="Rekening Prioritas">
                        {senderAccounts.priority.map((account) => (
                          <option key={account.id} value={account.id}>
                            {getAccountLabel(account)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}

                    {senderAccounts.others.length ? (
                      <optgroup label="Rekening Lainnya">
                        {senderAccounts.others.map((account) => (
                          <option key={account.id} value={account.id}>
                            {getAccountLabel(account)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>

                <label>
                  <span>Tujuan Transfer</span>
                  <select
                    value={transferForm.destinationMode}
                    disabled={
                      isSavingTransaction ||
                      Boolean(editingTransactionId) ||
                      !transferForm.accountId
                    }
                    onChange={(event) =>
                      handleDestinationModeChange(
                        event.target.value as TransferDestinationMode
                      )
                    }
                  >
                    <option value="">
                      {transferForm.accountId
                        ? 'Pilih Tujuan Transfer'
                        : 'Pilih Pengirim terlebih dahulu'}
                    </option>
                    <option value="holding">Rekening Penampung</option>
                    <option value="priority">Rekening Prioritas</option>
                    <option value="free">Transfer Biasa</option>
                  </select>
                </label>

                <label>
                  <span>Saldo Pengirim</span>
                  <input
                    type="text"
                    value={
                      transferForm.accountId ? formatRupiah(senderBalance) : ''
                    }
                    placeholder="Saldo Pengirim"
                    disabled
                    className="bank-balance-field"
                  />
                </label>

                <label className="bank-transfer-destination-field">
                  <span>
                    {transferForm.destinationMode === 'priority'
                      ? 'Rekening Prioritas'
                      : 'Rekening Penampung'}
                  </span>
                  <select
                    value={transferForm.recipientAccountId}
                    disabled={
                      isSavingTransaction ||
                      Boolean(editingTransactionId) ||
                      !transferForm.accountId ||
                      !isRegisteredMode
                    }
                    onChange={(event) =>
                      handleRegisteredRecipientChange(event.target.value)
                    }
                  >
                    <option value="">
                      {!transferForm.destinationMode
                        ? 'Pilih Tujuan Transfer terlebih dahulu'
                        : transferForm.destinationMode === 'priority'
                          ? 'Pilih rekening prioritas'
                          : 'Pilih rekening penampung'}
                    </option>

                    {registeredRecipientAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {getAccountLabel(account)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="bank-autocomplete">
                  <span>Nama Penerima</span>
                  <input
                    type="text"
                    value={transferForm.recipientName}
                    readOnly={isRegisteredMode}
                    disabled={
                      isSavingTransaction ||
                      (Boolean(editingTransactionId) && isRegisteredMode) ||
                      !transferForm.accountId ||
                      (!isRegisteredMode &&
                        transferForm.destinationMode !== 'free')
                    }
                    placeholder={
                      isRegisteredMode
                        ? 'Nama penerima otomatis'
                        : 'Ketik nama penerima...'
                    }
                    onChange={(event) => {
                      if (isRegisteredMode) return
                      handleFreeRecipientChange(event.target.value)
                    }}
                    onFocus={() => {
                      if (transferForm.destinationMode === 'free') {
                        setRecipientAutocompleteOpen(true)
                      }
                    }}
                    onBlur={() =>
                      window.setTimeout(
                        () => setRecipientAutocompleteOpen(false),
                        120
                      )
                    }
                    className={isRegisteredMode ? 'bank-recipient-locked' : ''}
                  />

                  {transferForm.destinationMode === 'free' &&
                  recipientAutocompleteOpen &&
                  recipientSuggestions.length ? (
                    <div className="bank-autocomplete-menu">
                      {recipientSuggestions.map((item) => (
                        <button
                          key={`${item.value}-${item.label}`}
                          type="button"
                          className="bank-autocomplete-item"
                          onMouseDown={(event) => {
                            event.preventDefault()
                            selectRecipientSuggestion(item)
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </label>

                <label className="bank-autocomplete">
                  <span>Keperluan</span>
                  <input
                    type="text"
                    value={transferForm.paymentFor}
                    disabled={!hasDestination || isSavingTransaction}
                    placeholder="Contoh: transfer dana supplier"
                    onChange={(event) => {
                      setTransferForm((current) => ({
                        ...current,
                        paymentFor: event.target.value
                      }))
                      setPaymentQuery(event.target.value)
                      setPaymentAutocompleteOpen(true)
                    }}
                    onFocus={() => setPaymentAutocompleteOpen(true)}
                    onBlur={() =>
                      window.setTimeout(
                        () => setPaymentAutocompleteOpen(false),
                        120
                      )
                    }
                  />

                  {paymentAutocompleteOpen && paymentSuggestions.length ? (
                    <div className="bank-autocomplete-menu">
                      {paymentSuggestions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="bank-autocomplete-item"
                          onMouseDown={(event) => {
                            event.preventDefault()
                            selectPaymentSuggestion(item)
                          }}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </label>

                <label>
                  <span>Nominal Transfer</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={transferForm.transferAmount}
                    disabled={!hasDestination || isSavingTransaction}
                    placeholder="0"
                    onChange={(event) =>
                      setTransferForm((current) => ({
                        ...current,
                        transferAmount: formatIntegerInput(event.target.value)
                      }))
                    }
                  />
                </label>

                <label className="bank-admin-row-field">
                  <span>Biaya Admin</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={transferForm.adminFee}
                    disabled={!hasDestination || isSavingTransaction}
                    placeholder="0"
                    onChange={(event) =>
                      setTransferForm((current) => ({
                        ...current,
                        adminFee: formatIntegerInput(event.target.value)
                      }))
                    }
                  />
                </label>

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
                      !hasDestination ||
                      !transferForm.transferAmount
                    }
                    onClick={() => void handleSaveTransaction()}
                  >
                    {isSavingTransaction
                      ? 'Menyimpan...'
                      : editingTransactionId
                        ? 'Simpan Perubahan'
                        : 'Simpan Transaksi'}
                  </button>
                </div>
              </div>
              {createError ? (
                <div className="bank-form-error" role="alert">
                  {createError}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {historySummary && historyAccountId ? (
        <div
          className="bank-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeHistory()
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
                <h2 id="bank-history-title">Riwayat Rekening</h2>
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
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="bank-history-summary">
              <div className="bank-history-current">
                <span>Saldo Saat Ini</span>
                <strong>{formatRupiah(historySummary.balance)}</strong>
              </div>

              <div className="bank-history-stats">
                {Number(historySummary.account.opening_balance) !== 0 ? (
                  <div className="bank-history-stat">
                    <span>Saldo Awal</span>
                    <strong>
                      {formatRupiah(
                        Number(historySummary.account.opening_balance)
                      )}
                    </strong>
                  </div>
                ) : null}

                {historySummary.disbursementIncome !== 0 ? (
                  <div className="bank-history-stat">
                    <span>Pencairan Masuk</span>
                    <strong className="bank-income">
                      {formatRupiah(historySummary.disbursementIncome)}
                    </strong>
                  </div>
                ) : null}

                {historySummary.transferIncome !== 0 ? (
                  <div className="bank-history-stat">
                    <span>Transfer Masuk</span>
                    <strong className="bank-income">
                      {formatRupiah(historySummary.transferIncome)}
                    </strong>
                  </div>
                ) : null}

                {historySummary.transferExpense !== 0 ? (
                  <div className="bank-history-stat">
                    <span>Transfer Keluar</span>
                    <strong className="bank-expense">
                      {formatRupiah(historySummary.transferExpense)}
                    </strong>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="bank-history-content">
              {historyLoading ? (
                <div className="bank-empty">Memuat riwayat rekening...</div>
              ) : historyError ? (
                <div className="bank-error">{historyError}</div>
              ) : historyTransactions.length === 0 ? (
                <div className="bank-empty">
                  Tidak ada transaksi pada periode ini.
                </div>
              ) : (
                historyTransactions.map((item) => {
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
                          className={incoming ? 'bank-income' : 'bank-expense'}
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
                              <Pencil aria-hidden="true" />
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
                              <Trash2 aria-hidden="true" />
                              Hapus
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  )
                })
              )}
            </div>

            {historyTotal > 0 ? (
              <footer className="bank-history-pagination">
                <span className="bank-history-pagination-info">
                  Menampilkan {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}–
                  {Math.min(historyPage * HISTORY_PAGE_SIZE, historyTotal)} dari{' '}
                  {historyTotal} transaksi
                </span>

                <div className="bank-history-pagination-buttons">
                  <button
                    type="button"
                    className="bank-history-page"
                    disabled={historyPage === 1 || historyLoading}
                    onClick={() =>
                      setHistoryPage((current) => Math.max(1, current - 1))
                    }
                    aria-label="Halaman sebelumnya"
                  >
                    ←
                  </button>

                  {historyPages.map((pageItem, index) =>
                    pageItem === 'ellipsis' ? (
                      <button
                        key={`ellipsis-${index}`}
                        type="button"
                        className="bank-history-page"
                        disabled
                        aria-hidden="true"
                      >
                        …
                      </button>
                    ) : (
                      <button
                        key={pageItem}
                        type="button"
                        className={`bank-history-page ${
                          pageItem === historyPage ? 'active' : ''
                        }`}
                        disabled={historyLoading}
                        onClick={() => setHistoryPage(pageItem)}
                        aria-current={
                          pageItem === historyPage ? 'page' : undefined
                        }
                      >
                        {pageItem}
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    className="bank-history-page"
                    disabled={
                      historyPage === historyTotalPages || historyLoading
                    }
                    onClick={() =>
                      setHistoryPage((current) =>
                        Math.min(historyTotalPages, current + 1)
                      )
                    }
                    aria-label="Halaman berikutnya"
                  >
                    →
                  </button>
                </div>
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  )
}
