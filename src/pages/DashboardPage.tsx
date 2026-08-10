import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '@/features/auth/use-auth'
import {
  getActiveKitchens,
  getDashboardActivity,
  getDashboardSummary,
  getDashboardTransactionPage,
  getDailyStatus,
  getSupplierOptions,
  type DashboardActivity,
  type DashboardFilters,
  type DashboardKitchen,
  type DashboardSummary,
  type DashboardTransaction,
  type DashboardFlow
} from '@/features/dashboard/dashboard-service'

import {
  createTransaction,
  deleteTransaction,
  hasDuplicateTransaction,
  updateTransaction
} from '@/features/transactions/transaction-service'

import {
  getAccountsForFlow,
  getDefaultOperationalAccount,
  getDefaultSupplier,
  getSuppliersForKitchen,
  type TransactionOption
} from '@/features/transactions/transaction-options-service'

const FLOW_OPTIONS: { value: DashboardFlow | ''; label: string }[] = [
  { value: '', label: 'Semua transaksi' },
  { value: 'income', label: 'RAB' },
  { value: 'expense', label: 'Pembayaran Supplier' },
  { value: 'neutral', label: 'Operasional' }
]

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

function flowLabel(flow: DashboardFlow) {
  if (flow === 'income') return 'RAB'
  if (flow === 'expense') return 'Supplier'
  return 'Operasional'
}

function flowClass(flow: DashboardFlow) {
  if (flow === 'income') return 'dashboard-flow dashboard-flow-income'
  if (flow === 'expense') return 'dashboard-flow dashboard-flow-expense'
  return 'dashboard-flow dashboard-flow-neutral'
}

type StatusData = Awaited<ReturnType<typeof getDailyStatus>>

export function DashboardPage() {
  const { user } = useAuth()
  const today = getTodayLocal()

  const [filters, setFilters] = useState<DashboardFilters>({
    startDate: today,
    endDate: today,
    kitchenId: '',
    flowType: '',
    supplierFilter: ''
  })

  const [kitchens, setKitchens] = useState<DashboardKitchen[]>([])
  const [supplierOptions, setSupplierOptions] = useState<
    { value: string; label: string }[]
  >([])
  const [summary, setSummary] = useState<DashboardSummary>({
    income: 0,
    expense: 0,
    operational: 0
  })
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([])
  const [totalTransactions, setTotalTransactions] = useState(0)
  const [transactionPage, setTransactionPage] = useState(1)
  const [activity, setActivity] = useState<DashboardActivity[]>([])
  const [dailyStatus, setDailyStatus] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [formDate, setFormDate] = useState(today)
  const [formKitchenId, setFormKitchenId] = useState('')
  const [formFlowType, setFormFlowType] = useState<DashboardFlow | ''>('')
  const [formAccountId, setFormAccountId] = useState('')
  const [formSupplierId, setFormSupplierId] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formNote, setFormNote] = useState('')

  const [formAccounts, setFormAccounts] = useState<TransactionOption[]>([])
  const [formSuppliers, setFormSuppliers] = useState<TransactionOption[]>([])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [nextSummary, nextActivity, nextStatus, nextKitchens] =
        await Promise.all([
          getDashboardSummary(filters),
          getDashboardActivity(filters),
          getDailyStatus(filters.startDate),
          kitchens.length ? Promise.resolve(kitchens) : getActiveKitchens()
        ])

      const nextTransactions = await getDashboardTransactionPage(
        filters,
        transactionPage,
        10
      )

      setSummary(nextSummary)
      setTransactions(nextTransactions.data)
      setTotalTransactions(nextTransactions.total)
      setActivity(nextActivity)
      setDailyStatus(nextStatus)

      if (!kitchens.length) {
        setKitchens(nextKitchens)
      }

      const nextSuppliers = await getSupplierOptions(filters)
      setSupplierOptions(nextSuppliers)
    } catch (loadError) {
      console.error(loadError)
      setError(
        'Data Dashboard gagal dimuat. Coba refresh atau periksa koneksi.'
      )
    } finally {
      setLoading(false)
    }
  }, [filters, kitchens, transactionPage])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [loadDashboard])

  const net = filters.flowType === '' ? summary.income - summary.expense : 0
  const supplierDisabled = filters.flowType === 'neutral'

  const chartData = activity.map(
    (item) =>
      [
        item.date,
        {
          income: item.income,
          expense: item.expense,
          operational: item.operational
        }
      ] as const
  )

  const maxChartValue = Math.max(
    1,
    ...chartData.flatMap(([, values]) => [
      values.income,
      values.expense,
      values.operational
    ])
  )

  function updateFilter<K extends keyof DashboardFilters>(
    key: K,
    value: DashboardFilters[K]
  ) {
    setTransactionPage(1)
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function handleStartDate(value: string) {
    setTransactionPage(1)
    setFilters((current) => ({
      ...current,
      startDate: value,
      endDate: value,
      supplierFilter: ''
    }))
  }

  function handleKitchen(value: string) {
    setTransactionPage(1)
    setFilters((current) => ({
      ...current,
      kitchenId: value,
      supplierFilter: ''
    }))
  }

  function handleFlow(value: DashboardFlow | '') {
    setTransactionPage(1)
    setFilters((current) => ({
      ...current,
      flowType: value,
      supplierFilter: ''
    }))
  }

  function resetTransactionForm() {
    setFormDate(today)
    setFormKitchenId('')
    setFormFlowType('')
    setFormAccountId('')
    setFormSupplierId('')
    setFormAmount('')
    setFormNote('')
    setFormError(null)
    setFormAccounts([])
    setFormSuppliers([])
  }

  function closeTransactionModal() {
    if (saving) return

    setModalOpen(false)
    setModalMode('create')
    setEditingId(null)
    resetTransactionForm()
  }

  async function loadFormOptions(
    kitchenId: string,
    flowType: DashboardFlow | '',
    preserveAccountId = '',
    preserveSupplierId = ''
  ) {
    if (!kitchenId || !flowType) {
      setFormAccounts([])
      setFormSuppliers([])
      return
    }

    if (flowType === 'income' || flowType === 'neutral') {
      const accounts = await getAccountsForFlow(kitchenId, flowType)

      setFormAccounts(accounts)
      setFormSuppliers([])
      setFormSupplierId('')

      if (
        preserveAccountId &&
        accounts.some((item) => item.value === preserveAccountId)
      ) {
        setFormAccountId(preserveAccountId)
      } else if (flowType === 'neutral') {
        setFormAccountId(getDefaultOperationalAccount(accounts))
      } else {
        setFormAccountId(accounts.length === 1 ? accounts[0].value : '')
      }

      return
    }

    const suppliers = await getSuppliersForKitchen(kitchenId)

    setFormSuppliers(suppliers)
    setFormAccounts([])
    setFormAccountId('')

    if (
      preserveSupplierId &&
      suppliers.some((item) => item.value === preserveSupplierId)
    ) {
      setFormSupplierId(preserveSupplierId)
    } else {
      setFormSupplierId(getDefaultSupplier(suppliers))
    }
  }

  function openCreateTransactionModal() {
    if (user?.role !== 'admin') return

    resetTransactionForm()
    setModalMode('create')
    setEditingId(null)
    setModalOpen(true)
  }

  async function openEditTransactionModal(transaction: DashboardTransaction) {
    if (user?.role !== 'admin') return

    setModalMode('edit')
    setEditingId(transaction.id)
    setFormError(null)
    setFormDate(transaction.transaction_date)
    setFormKitchenId(transaction.kitchen_id ?? '')
    setFormFlowType(transaction.flow_type)
    setFormAmount(String(Number(transaction.amount) || 0))
    setFormNote(transaction.note ?? '')
    setFormAccountId(transaction.account_id ?? '')
    setFormSupplierId(transaction.supplier_id ?? '')
    setFormAccounts([])
    setFormSuppliers([])
    setModalOpen(true)

    try {
      await loadFormOptions(
        transaction.kitchen_id ?? '',
        transaction.flow_type,
        transaction.account_id ?? '',
        transaction.supplier_id ?? ''
      )
    } catch (loadError) {
      console.error(loadError)
      setFormError('Gagal memuat rekening atau supplier transaksi.')
    }
  }

  async function handleFormKitchenChange(value: string) {
    setFormKitchenId(value)
    setFormAccountId('')
    setFormSupplierId('')
    setFormAccounts([])
    setFormSuppliers([])
    setFormError(null)

    if (!value || !formFlowType) return

    try {
      await loadFormOptions(value, formFlowType)
    } catch (loadError) {
      console.error(loadError)
      setFormError('Gagal memuat rekening atau supplier transaksi.')
    }
  }

  async function handleFormFlowChange(value: DashboardFlow | '') {
    setFormFlowType(value)
    setFormAccountId('')
    setFormSupplierId('')
    setFormAccounts([])
    setFormSuppliers([])
    setFormError(null)

    if (!formKitchenId || !value) return

    try {
      await loadFormOptions(formKitchenId, value)
    } catch (loadError) {
      console.error(loadError)
      setFormError('Gagal memuat rekening atau supplier transaksi.')
    }
  }

  async function handleTransactionSubmit() {
    if (saving) return

    if (!formDate) {
      setFormError('Tanggal wajib dipilih.')
      return
    }

    if (!formKitchenId) {
      setFormError('Dapur wajib dipilih.')
      return
    }

    if (!formFlowType) {
      setFormError('Jenis transaksi wajib dipilih.')
      return
    }

    const amount = Number(formAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Nominal harus lebih dari 0.')
      return
    }

    if (
      (formFlowType === 'income' || formFlowType === 'neutral') &&
      !formAccountId
    ) {
      setFormError('Rekening wajib dipilih.')
      return
    }

    if (formFlowType === 'expense' && !formSupplierId) {
      setFormError('Supplier wajib dipilih.')
      return
    }

    const payload = {
      transaction_date: formDate,
      kitchen_id: formKitchenId,
      amount,
      note: formNote.trim() || null,
      flow_type: formFlowType,
      category:
        formFlowType === 'income'
          ? 'RAB'
          : formFlowType === 'expense'
            ? 'Supplier'
            : 'OPS',
      account_id:
        formFlowType === 'income' || formFlowType === 'neutral'
          ? formAccountId
          : null,
      supplier_id: formFlowType === 'expense' ? formSupplierId : null
    } as const

    setSaving(true)
    setFormError(null)

    try {
      if (modalMode === 'create') {
        const duplicate = await hasDuplicateTransaction(payload)

        if (duplicate) {
          const confirmed = window.confirm(
            'Transaksi dengan tanggal, dapur, rekening/supplier, dan nominal yang sama sudah ada.\n\nTetap simpan?'
          )

          if (!confirmed) {
            setSaving(false)
            return
          }
        }

        await createTransaction(payload)
      } else {
        if (!editingId) {
          throw new Error('ID transaksi tidak ditemukan')
        }

        await updateTransaction(editingId, payload)
      }

      setModalOpen(false)
      setModalMode('create')
      setEditingId(null)
      resetTransactionForm()

      if (transactionPage !== 1) {
        setTransactionPage(1)
      } else {
        await loadDashboard()
      }
    } catch (saveError) {
      console.error(saveError)
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : 'Transaksi gagal disimpan.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleTransactionDelete(transaction: DashboardTransaction) {
    if (user?.role !== 'admin') return

    const confirmed = window.confirm(
      `Hapus transaksi ${formatDate(transaction.transaction_date)} sebesar ${formatRupiah(
        Number(transaction.amount) || 0
      )}?`
    )

    if (!confirmed) return

    try {
      await deleteTransaction(transaction.id)

      if (transactionPage > 1 && transactions.length === 1) {
        setTransactionPage((current) => current - 1)
      } else {
        await loadDashboard()
      }
    } catch (deleteError) {
      console.error(deleteError)
      setError('Transaksi gagal dihapus.')
    }
  }

  const roleLabel =
    user?.role === 'admin'
      ? 'Administrator'
      : user?.role === 'viewer'
        ? 'Viewer'
        : 'Operator'

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">SIM SPPG • {roleLabel}</p>
          <h1>Dashboard</h1>
          <p>Pantau aktivitas dan penggunaan dana SPPG dalam satu tampilan.</p>
        </div>

        <div className="dashboard-hero-actions">
          <div className="dashboard-date-chip">
            <span>Periode</span>
            <strong>
              {formatDate(filters.startDate)}
              {filters.endDate !== filters.startDate
                ? ` — ${formatDate(filters.endDate)}`
                : ''}
            </strong>
          </div>

          {user?.role === 'admin' ? (
            <button
              type="button"
              className="dashboard-transaction-action"
              onClick={openCreateTransactionModal}
            >
              + Transaksi
            </button>
          ) : null}
        </div>
      </section>

      <section className="dashboard-filter-card">
        <div className="dashboard-filter-heading">
          <div>
            <strong>Filter Dashboard</strong>
            <span>
              Gunakan filter untuk mempersempit data yang ditampilkan.
            </span>
          </div>
          <button
            type="button"
            className="dashboard-reset"
            onClick={() => {
              setTransactionPage(1)
              setFilters({
                startDate: today,
                endDate: today,
                kitchenId: '',
                flowType: '',
                supplierFilter: ''
              })
            }}
          >
            Reset
          </button>
        </div>

        <div className="dashboard-filter-grid">
          <label>
            <span>Mulai</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => handleStartDate(event.target.value)}
            />
          </label>

          <label>
            <span>Sampai</span>
            <input
              type="date"
              min={filters.startDate}
              value={filters.endDate}
              onChange={(event) =>
                updateFilter(
                  'endDate',
                  event.target.value < filters.startDate
                    ? filters.startDate
                    : event.target.value
                )
              }
            />
          </label>

          <label>
            <span>Dapur</span>
            <select
              value={filters.kitchenId}
              onChange={(event) => handleKitchen(event.target.value)}
            >
              <option value="">Semua dapur</option>
              {kitchens.map((kitchen) => (
                <option key={kitchen.id} value={kitchen.id}>
                  {kitchen.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Jenis transaksi</span>
            <select
              value={filters.flowType}
              onChange={(event) =>
                handleFlow(event.target.value as DashboardFlow | '')
              }
            >
              {FLOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Supplier</span>
            <select
              value={filters.supplierFilter}
              disabled={supplierDisabled}
              onChange={(event) =>
                updateFilter('supplierFilter', event.target.value)
              }
            >
              <option value="">
                {supplierDisabled ? 'Tidak berlaku' : 'Semua supplier'}
              </option>
              {supplierOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? <div className="dashboard-error">{error}</div> : null}

      <section className="dashboard-kpi-grid">
        <article
          className={`dashboard-kpi ${
            filters.flowType === 'income' ? 'dashboard-kpi-primary' : ''
          }`}
        >
          <span>Pencairan / RAB</span>
          <strong>{loading ? 'Memuat…' : formatRupiah(summary.income)}</strong>
          <small>Total RAB pada periode terpilih</small>
        </article>

        <article
          className={`dashboard-kpi ${
            filters.flowType === 'expense' ? 'dashboard-kpi-primary' : ''
          }`}
        >
          <span>Pembayaran Supplier</span>
          <strong>{loading ? 'Memuat…' : formatRupiah(summary.expense)}</strong>
          <small>Total pembayaran ke supplier pada periode terpilih</small>
        </article>

        <article
          className={`dashboard-kpi ${
            filters.flowType === 'neutral' ? 'dashboard-kpi-primary' : ''
          }`}
        >
          <span>Operasional</span>
          <strong>
            {loading ? 'Memuat…' : formatRupiah(summary.operational)}
          </strong>
          <small>Total transaksi operasional pada periode terpilih</small>
        </article>

        <article
          className={`dashboard-kpi ${
            filters.flowType === '' ? 'dashboard-kpi-primary' : ''
          }`}
        >
          <span>RAB − Pembayaran Supplier</span>
          <strong>
            {loading
              ? 'Memuat…'
              : formatRupiah(filters.flowType === '' ? net : 0)}
          </strong>
          <small>
            Sisa dana setelah dilakukan pembayaran ke supplier pada periode
            terpilih
          </small>
        </article>
      </section>

      <section className="dashboard-main-grid">
        <article className="dashboard-panel dashboard-chart-panel">
          <div className="dashboard-panel-header">
            <div>
              <h3>
                {filters.flowType === ''
                  ? 'Aktivitas Transaksi'
                  : filters.flowType === 'income'
                    ? 'Aktivitas RAB'
                    : filters.flowType === 'expense'
                      ? 'Aktivitas Pembayaran Supplier'
                      : 'Aktivitas Operasional'}
              </h3>
              <p>
                {filters.flowType === ''
                  ? 'Tren seluruh transaksi pada periode yang dipilih.'
                  : filters.flowType === 'income'
                    ? 'Tren pencairan dan RAB pada periode yang dipilih.'
                    : filters.flowType === 'expense'
                      ? 'Tren pembayaran supplier pada periode yang dipilih.'
                      : 'Tren transaksi operasional pada periode yang dipilih.'}
              </p>
            </div>

            <span className="dashboard-panel-badge">
              {totalTransactions} transaksi
            </span>
          </div>

          <div className="dashboard-chart">
            {chartData.length ? (
              chartData.map(([date, values]) => (
                <div className="dashboard-chart-column" key={date}>
                  <div className="dashboard-bars">
                    {(filters.flowType === '' ||
                      filters.flowType === 'income') && (
                      <span
                        className="dashboard-bar dashboard-bar-income"
                        style={{
                          height: `${Math.max(
                            4,
                            (values.income / maxChartValue) * 100
                          )}%`
                        }}
                        title={`RAB ${formatRupiah(values.income)}`}
                      />
                    )}

                    {(filters.flowType === '' ||
                      filters.flowType === 'expense') && (
                      <span
                        className="dashboard-bar dashboard-bar-expense"
                        style={{
                          height: `${Math.max(
                            4,
                            (values.expense / maxChartValue) * 100
                          )}%`
                        }}
                        title={`Supplier ${formatRupiah(values.expense)}`}
                      />
                    )}

                    {(filters.flowType === '' ||
                      filters.flowType === 'neutral') && (
                      <span
                        className="dashboard-bar dashboard-bar-operational"
                        style={{
                          height: `${Math.max(
                            4,
                            (values.operational / maxChartValue) * 100
                          )}%`
                        }}
                        title={`Operasional ${formatRupiah(values.operational)}`}
                      />
                    )}
                  </div>

                  <small>
                    {new Intl.DateTimeFormat('id-ID', {
                      day: '2-digit',
                      month: 'short'
                    }).format(new Date(`${date}T00:00:00`))}
                  </small>
                </div>
              ))
            ) : (
              <div className="dashboard-empty">
                Belum ada transaksi pada periode ini.
              </div>
            )}
          </div>

          <div className="dashboard-legend">
            {(filters.flowType === '' || filters.flowType === 'income') && (
              <span>
                <i className="dashboard-dot dashboard-dot-income" /> RAB
              </span>
            )}

            {(filters.flowType === '' || filters.flowType === 'expense') && (
              <span>
                <i className="dashboard-dot dashboard-dot-expense" /> Supplier
              </span>
            )}

            {(filters.flowType === '' || filters.flowType === 'neutral') && (
              <span>
                <i className="dashboard-dot dashboard-dot-operational" />{' '}
                Operasional
              </span>
            )}
          </div>
        </article>

        <article className="dashboard-panel dashboard-status-panel">
          <div className="dashboard-panel-header">
            <div>
              <h2>Status Dapur</h2>
              <p>Status operasional untuk {formatDate(filters.startDate)}.</p>
            </div>
          </div>

          {dailyStatus ? (
            <>
              <div className="dashboard-status-summary">
                <span className="status-summary-green">
                  <b>{dailyStatus.green}</b> Lengkap
                </span>
                <span className="status-summary-yellow">
                  <b>{dailyStatus.yellow}</b> Proses
                </span>
                <span className="status-summary-red">
                  <b>{dailyStatus.red}</b> Belum
                </span>
              </div>

              <div className="dashboard-status-list">
                {dailyStatus.rows.map((row) => (
                  <div className="dashboard-status-row" key={row.kitchen}>
                    <div>
                      <strong>{row.kitchen}</strong>
                      <span>
                        {row.completed}/{row.required} aktivitas
                      </span>
                    </div>
                    <div className="dashboard-status-flags">
                      <span className={row.income ? 'is-done' : ''}>B</span>
                      <span className={row.expense ? 'is-done' : ''}>S</span>
                      {row.required === 3 ? (
                        <span className={row.operational ? 'is-done' : ''}>
                          O
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="dashboard-empty">Memuat status dapur…</div>
          )}
        </article>
      </section>

      <section className="dashboard-panel dashboard-history-panel">
        <div className="dashboard-panel-header">
          <div>
            <h2>Riwayat Transaksi</h2>
            <p>
              Menampilkan {transactions.length} dari {totalTransactions}{' '}
              transaksi sesuai filter.
            </p>
          </div>
          <span className="dashboard-panel-badge">Live dari Supabase</span>
        </div>

        <div className="dashboard-history">
          {transactions.length ? (
            transactions.map((transaction) => {
              const kitchen = kitchens.find(
                (item) => item.id === transaction.kitchen_id
              )

              return (
                <div className="dashboard-history-row" key={transaction.id}>
                  <div className="dashboard-history-date">
                    <strong>{formatDate(transaction.transaction_date)}</strong>
                    <span>{kitchen?.name ?? 'Dapur tidak diketahui'}</span>
                  </div>

                  <div className="dashboard-history-detail">
                    <span className={flowClass(transaction.flow_type)}>
                      {flowLabel(transaction.flow_type)}
                    </span>
                    <strong>{transaction.category || 'Transaksi'}</strong>
                    {transaction.note ? (
                      <small>{transaction.note}</small>
                    ) : null}
                  </div>

                  <div className="dashboard-history-side">
                    <strong className="dashboard-history-amount">
                      {formatRupiah(Number(transaction.amount))}
                    </strong>

                    {user?.role === 'admin' ? (
                      <div className="dashboard-history-actions">
                        <button
                          type="button"
                          onClick={() =>
                            void openEditTransactionModal(transaction)
                          }
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleTransactionDelete(transaction)
                          }
                        >
                          Hapus
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="dashboard-empty">
              Tidak ada transaksi yang cocok dengan filter.
            </div>
          )}
        </div>

        {totalTransactions > 10 ? (
          <div className="dashboard-pagination">
            <button
              type="button"
              className="dashboard-pagination-button"
              disabled={transactionPage === 1 || loading}
              onClick={() =>
                setTransactionPage((current) => Math.max(1, current - 1))
              }
            >
              Sebelumnya
            </button>

            <span>
              Halaman {transactionPage} dari {Math.ceil(totalTransactions / 10)}
            </span>

            <button
              type="button"
              className="dashboard-pagination-button"
              disabled={
                transactionPage >= Math.ceil(totalTransactions / 10) || loading
              }
              onClick={() =>
                setTransactionPage((current) =>
                  Math.min(Math.ceil(totalTransactions / 10), current + 1)
                )
              }
            >
              Berikutnya
            </button>
          </div>
        ) : null}
      </section>

      {modalOpen ? (
        <div
          className="dashboard-transaction-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTransactionModal()
            }
          }}
        >
          <section
            className="dashboard-transaction-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-transaction-modal-title"
          >
            <div className="dashboard-transaction-modal-header">
              <div>
                <span>
                  {modalMode === 'edit' ? 'UBAH TRANSAKSI' : 'TRANSAKSI BARU'}
                </span>
                <h2 id="dashboard-transaction-modal-title">
                  {modalMode === 'edit' ? 'Edit Transaksi' : 'Tambah Transaksi'}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeTransactionModal}
                disabled={saving}
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            {formError ? (
              <div className="dashboard-transaction-form-error">
                {formError}
              </div>
            ) : null}

            <div className="dashboard-transaction-form-grid">
              <label>
                <span>Tanggal</span>
                <input
                  type="date"
                  value={formDate}
                  onChange={(event) => setFormDate(event.target.value)}
                />
              </label>

              <label>
                <span>Dapur</span>
                <select
                  value={formKitchenId}
                  disabled={modalMode === 'edit'}
                  onChange={(event) =>
                    void handleFormKitchenChange(event.target.value)
                  }
                >
                  <option value="">Pilih dapur</option>
                  {kitchens.map((kitchen) => (
                    <option key={kitchen.id} value={kitchen.id}>
                      {kitchen.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Jenis transaksi</span>
                <select
                  value={formFlowType}
                  disabled={!formKitchenId || modalMode === 'edit'}
                  onChange={(event) =>
                    void handleFormFlowChange(
                      event.target.value as DashboardFlow | ''
                    )
                  }
                >
                  <option value="">Pilih jenis transaksi</option>
                  {FLOW_OPTIONS.filter((option) => option.value !== '').map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    )
                  )}
                </select>
              </label>

              {formFlowType === 'expense' ? (
                <label>
                  <span>Supplier</span>
                  <select
                    value={formSupplierId}
                    disabled={modalMode === 'edit'}
                    onChange={(event) => setFormSupplierId(event.target.value)}
                  >
                    <option value="">Pilih supplier</option>
                    {formSuppliers.map((supplier) => (
                      <option key={supplier.value} value={supplier.value}>
                        {supplier.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : formFlowType ? (
                <label>
                  <span>Rekening</span>
                  <select
                    value={formAccountId}
                    disabled={
                      formFlowType === 'neutral' || modalMode === 'edit'
                    }
                    onChange={(event) => setFormAccountId(event.target.value)}
                  >
                    <option value="">Pilih rekening</option>
                    {formAccounts.map((account) => (
                      <option key={account.value} value={account.value}>
                        {account.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label>
                <span>Nominal</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formAmount}
                  onChange={(event) => setFormAmount(event.target.value)}
                  placeholder="0"
                />
              </label>

              <label className="dashboard-transaction-form-note">
                <span>Catatan</span>
                <textarea
                  rows={3}
                  value={formNote}
                  onChange={(event) => setFormNote(event.target.value)}
                  placeholder="Opsional"
                />
              </label>
            </div>

            <div className="dashboard-transaction-modal-actions">
              <button
                type="button"
                onClick={closeTransactionModal}
                disabled={saving}
              >
                Batal
              </button>

              <button
                type="button"
                className="dashboard-transaction-action"
                onClick={() => void handleTransactionSubmit()}
                disabled={saving}
              >
                {saving
                  ? 'Menyimpan…'
                  : modalMode === 'edit'
                    ? 'Update Transaksi'
                    : 'Simpan Transaksi'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
