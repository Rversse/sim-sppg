import { useEffect, useMemo, useState } from 'react'

import {
  getAccountDisplayName,
  getAccountLabel,
  getBankOverview,
  type BankAccountSummary,
  type BankOverview,
  type BankTransaction
} from '@/features/bank/bank-service'

import { useAuth } from '@/features/auth/use-auth'

const HISTORY_PAGE_SIZE = 10

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
          <span className="bank-account-label">REKENING</span>

          <h2>{getAccountDisplayName(account)}</h2>

          <p>{getAccountLabel(account)}</p>
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

  const [startDate, setStartDate] = useState(getTodayLocal)
  const [endDate, setEndDate] = useState(getTodayLocal)

  const [overview, setOverview] = useState<BankOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [historyAccountId, setHistoryAccountId] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(1)

  useEffect(() => {
    let cancelled = false

    void getBankOverview(startDate, endDate)
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
  }, [startDate, endDate])

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

  function openHistory(accountId: string) {
    setHistoryAccountId(accountId)
    setHistoryPage(1)
  }

  function closeHistory() {
    setHistoryAccountId(null)
    setHistoryPage(1)
  }

  function handleStartDateChange(value: string) {
    setStartDate(value)

    if (value > endDate) {
      setEndDate(value)
    }

    closeHistory()
  }

  function handleEndDateChange(value: string) {
    setEndDate(value)
    closeHistory()
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
          min-height: 116px;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          padding: 4px 2px 0;
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
          font-size: clamp(25px, 3vw, 34px);
          font-weight: 800;
          letter-spacing: -0.045em;
        }

        .bank-hero p {
          margin: 6px 0 0;
          color: #94a3b8;
          font-size: 11px;
        }

        .bank-filter-card,
        .bank-summary-card,
        .bank-accounts-panel {
          border: 1px solid #dbe3ed;
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 8px 24px rgb(15 23 42 / 0.04);
        }

        .bank-filter-card {
          padding: 16px;
        }

        .bank-filter-heading {
          margin-bottom: 14px;
        }

        .bank-filter-heading strong {
          display: block;
          color: #0b132b;
          font-size: 12px;
          font-weight: 800;
        }

        .bank-filter-heading span {
          display: block;
          margin-top: 4px;
          color: #94a3b8;
          font-size: 10px;
        }

        .bank-filter-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .bank-filter-grid label {
          display: grid;
          gap: 6px;
        }

        .bank-filter-grid label span {
          color: #64748b;
          font-size: 9px;
          font-weight: 800;
        }

        .bank-filter-grid input {
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

        .bank-filter-grid input:focus {
          border-color: #94a3b8;
          box-shadow: 0 0 0 3px rgb(148 163 184 / 0.12);
        }

        .bank-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .bank-summary-card {
          min-height: 105px;
          padding: 15px;
        }

        .bank-summary-card span {
          color: #7f8ca2;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .bank-summary-card strong {
          display: block;
          margin-top: 12px;
          color: #0b132b;
          font-size: 17px;
          font-weight: 800;
        }

        .bank-summary-card.balance {
          background: #0b132b;
        }

        .bank-summary-card.balance span,
        .bank-summary-card.balance strong {
          color: #fff;
        }

        .bank-summary-card.income strong {
          color: #15803d;
        }

        .bank-summary-card.expense strong {
          color: #dc2626;
        }

        .bank-accounts-panel {
          padding: 16px;
        }

        .bank-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
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

        .bank-account-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
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
          gap: 12px;
          padding: 15px;
          border-bottom: 1px solid #eef2f7;
        }

        .bank-account-label {
          color: #7f8ca2;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .bank-account-card h2 {
          margin: 5px 0 0;
          color: #0b132b;
          font-size: 13px;
          font-weight: 800;
        }

        .bank-account-card p {
          margin: 4px 0 0;
          color: #94a3b8;
          font-size: 9px;
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
          gap: 12px;
          padding: 15px;
          background: #f8fafc;
        }

        .bank-account-balance span {
          color: #64748b;
          font-size: 9px;
          font-weight: 700;
        }

        .bank-account-balance strong {
          color: #0b132b;
          font-size: 17px;
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
          padding: 11px 12px;
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
          margin-top: 5px;
          overflow: hidden;
          color: #334155;
          font-size: 10px;
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

          .bank-filter-grid,
          .bank-summary-grid {
            grid-template-columns: 1fr;
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
          </div>
        </section>

        <section className="bank-filter-card">
          <div className="bank-filter-heading">
            <strong>Filter periode</strong>

            <span>
              Saldo dan riwayat dihitung berdasarkan periode yang dipilih.
            </span>
          </div>

          <div className="bank-filter-grid">
            <label>
              <span>Mulai</span>

              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => handleStartDateChange(event.target.value)}
              />
            </label>

            <label>
              <span>Sampai</span>

              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => handleEndDateChange(event.target.value)}
              />
            </label>
          </div>
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
              <article className="bank-summary-card balance">
                <span>Total Saldo</span>
                <strong>{formatRupiah(totalSummary.balance)}</strong>
              </article>

              <article className="bank-summary-card income">
                <span>Pencairan Masuk</span>
                <strong>{formatRupiah(totalSummary.disbursementIncome)}</strong>
              </article>

              <article className="bank-summary-card income">
                <span>Transfer Masuk</span>
                <strong>{formatRupiah(totalSummary.transferIncome)}</strong>
              </article>

              <article className="bank-summary-card expense">
                <span>Transfer Keluar</span>
                <strong>{formatRupiah(totalSummary.transferExpense)}</strong>
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
                <div className="bank-account-grid">
                  {overview.summaries.map((summary) => (
                    <AccountCard
                      key={summary.account.id}
                      summary={summary}
                      onOpenHistory={() => openHistory(summary.account.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="bank-empty">
                  Tidak ada rekening yang tersedia.
                </div>
              )}
            </section>
          </>
        )}
      </div>

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
                  {getAccountDisplayName(historySummary.account)}
                  {' • '}
                  {formatDate(startDate)}
                  {startDate !== endDate ? ` — ${formatDate(endDate)}` : ''}
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
