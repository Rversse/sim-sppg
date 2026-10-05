import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import {
  getDailyDisbursementFlowClass,
  getDailyDisbursementFlowLabel,
  getDailyDisbursementKitchens,
  getDailyDisbursementTransactions,
  summarizeDailyDisbursementRows,
  type DailyDisbursementTransaction
} from '@/features/disbursement/disbursement-service'
import { setTransactionDisbursed } from '@/features/transactions/transaction-service'
import { SingleDatePicker } from '@/components/ui/date-picker'
import { AnimatedSelect } from '@/components/ui/animated-select'
import { DAILY_DISBURSEMENT_START_DATE } from '@/lib/app-config'
import { formatCurrency, formatDate, getTodayLocal } from '@/lib/formatters'
import { supabase } from '@/lib/supabase'

const FLOW_OPTIONS = [
  { value: '', label: 'Semua pencairan' },
  { value: 'income', label: 'RAB / Pencairan' },
  { value: 'gas', label: 'OPS / Arutala' },
  { value: 'ops_disbursement', label: 'OPS / Pencairan' }
] as const

function formatAccount(transaction: DailyDisbursementTransaction) {
  if (transaction.destination_label) {
    return transaction.destination_label
  }

  if (!transaction.account) {
    return '-'
  }

  return transaction.account.name || transaction.account.bank || '-'
}

function formatAccountMeta(transaction: DailyDisbursementTransaction) {
  if (!transaction.account) {
    return ''
  }

  const number = transaction.account.account_number?.trim()

  return [transaction.account.bank, number].filter(Boolean).join(' • ')
}

function groupRows(rows: DailyDisbursementTransaction[]) {
  const groups = new Map<string, DailyDisbursementTransaction[]>()

  for (const row of rows) {
    const current = groups.get(row.kitchen_name) ?? []
    current.push(row)
    groups.set(row.kitchen_name, current)
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'id'))
    .map(([kitchenName, transactions]) => ({
      kitchenName,
      transactions
    }))
}

export function DisbursementPage() {
  const { user } = useAuth()
  const { error: toastError, success: toastSuccess } = useToast()

  const canView = canAccess(user?.role, 'disbursement.view')
  const today = getTodayLocal()

  const [selectedDate, setSelectedDate] = useState(
    today < DAILY_DISBURSEMENT_START_DATE ? DAILY_DISBURSEMENT_START_DATE : today
  )
  const [selectedKitchenId, setSelectedKitchenId] = useState('')
  const [selectedFlowType, setSelectedFlowType] = useState('')
  const [kitchens, setKitchens] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [rows, setRows] = useState<DailyDisbursementTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const kitchenOptions = useMemo(
    () => [
      { value: '', label: 'Semua dapur' },
      ...kitchens.map((kitchen) => ({
        value: kitchen.id,
        label: kitchen.name
      }))
    ],
    [kitchens]
  )

  const summary = useMemo(
    () => summarizeDailyDisbursementRows(rows),
    [rows]
  )

  const groupedRows = useMemo(() => groupRows(rows), [rows])

  const loadData = useCallback(async () => {
    setLoading(true)

    try {
      const [nextRows, nextKitchens] = await Promise.all([
        getDailyDisbursementTransactions(
          selectedDate,
          selectedKitchenId,
          selectedFlowType
        ),
        kitchens.length ? Promise.resolve(kitchens) : getDailyDisbursementKitchens()
      ])

      setRows(nextRows)
      setKitchens(nextKitchens)
      setError('')
    } catch (loadError: unknown) {
      console.error(loadError)
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Gagal memuat checklist pencairan harian.'
      )
    } finally {
      setLoading(false)
    }
  }, [kitchens, selectedDate, selectedFlowType, selectedKitchenId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [loadData])

  useEffect(() => {
    const channel = supabase
      .channel(`daily-disbursement-${selectedDate}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        () => {
          void loadData()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadData, selectedDate])

  async function handleToggle(
    transaction: DailyDisbursementTransaction,
    checked: boolean
  ) {
    if (savingId) return

    setSavingId(transaction.id)
    setError('')

    setRows((current) =>
      current.map((row) =>
        row.id === transaction.id
          ? { ...row, is_disbursed: checked }
          : row
      )
    )

    try {
      await setTransactionDisbursed(transaction.id, checked)
      toastSuccess(
        checked ? 'Pencairan ditandai selesai' : 'Checklist dibatalkan',
        `${transaction.kitchen_name} • ${getDailyDisbursementFlowLabel(transaction.flow_type)}`
      )
    } catch (saveError: unknown) {
      console.error(saveError)
      setRows((current) =>
        current.map((row) =>
          row.id === transaction.id
            ? { ...row, is_disbursed: transaction.is_disbursed }
            : row
        )
      )

      const message =
        saveError instanceof Error
          ? saveError.message
          : 'Gagal menyimpan checklist.'

      setError(message)
      toastError('Checklist gagal disimpan', message)
    } finally {
      setSavingId(null)
    }
  }

  if (!user) return null

  if (!canView) {
    return <div className="app-access-denied">Akses ditolak.</div>
  }

  return (
    <div className="disbursement-page">
      <section className="disbursement-header">
        <div className="disbursement-header-copy">
          <span>Checklist Pencairan Harian</span>
          <p>
            Mulai 5 Oktober 2026, pencairan dicek per transaksi setiap hari.
            RAB / Real dan OPS / Real tidak masuk checklist.
          </p>
        </div>

        <div className="disbursement-date-picker">
          <SingleDatePicker
            label="Tanggal Pencairan"
            value={selectedDate}
            minDate={DAILY_DISBURSEMENT_START_DATE}
            maxDate={today}
            onChange={setSelectedDate}
          />
        </div>
      </section>

      {error ? (
        <div className="disbursement-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="disbursement-filter-panel">
        <AnimatedSelect
          label="Dapur"
          value={selectedKitchenId}
          options={kitchenOptions}
          onChange={setSelectedKitchenId}
        />

        <AnimatedSelect
          label="Jenis pencairan"
          value={selectedFlowType}
          options={FLOW_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label
          }))}
          onChange={setSelectedFlowType}
        />

        <button
          type="button"
          className="disbursement-refresh-button"
          onClick={() => void loadData()}
          disabled={loading}
        >
          <RefreshCw aria-hidden="true" className={loading ? 'is-spinning' : ''} />
          Segarkan
        </button>
      </section>

      {loading ? (
        <section
          className="disbursement-panel disbursement-loading"
          aria-busy="true"
          aria-label="Memuat checklist"
        >
          <div className="disbursement-skeleton disbursement-skeleton-summary" />
          <div className="disbursement-skeleton" />
          <div className="disbursement-skeleton" />
        </section>
      ) : (
        <>
          <section className="disbursement-summary-card">
            <div className="disbursement-summary-main">
              <div>
                <span className="disbursement-summary-kicker">
                  Checklist {formatDate(selectedDate)}
                </span>
                <strong>
                  {summary.checkedTransactions} / {summary.totalTransactions}
                </strong>
                <small>transaksi sudah dicek</small>
              </div>

              <div className="disbursement-progress-track">
                <span style={{ width: `${summary.progress}%` }} />
              </div>
            </div>

            <div className="disbursement-status-summary">
              <span className="is-success">
                <b>{summary.checkedTransactions}</b>
                <small>Sudah Dicek</small>
              </span>
              <span className="is-warning">
                <b>{summary.pendingTransactions}</b>
                <small>Belum Dicek</small>
              </span>
              <span>
                <b>{formatCurrency(summary.totalAmount)}</b>
                <small>Total Pencairan</small>
              </span>
            </div>
          </section>

          <section className="disbursement-panel">
            <div className="disbursement-panel-header">
              <div>
                <h2>Daftar Pencairan</h2>
                <p>
                  Centang satu per satu transaksi yang sudah selesai dicek /
                  dicairkan.
                </p>
              </div>
              <span>{rows.length} transaksi</span>
            </div>

            {rows.length === 0 ? (
              <div className="disbursement-empty">
                Tidak ada transaksi pencairan untuk tanggal dan filter ini.
              </div>
            ) : (
              <div className="disbursement-kitchen-groups">
                {groupedRows.map((group) => (
                  <section
                    className="disbursement-kitchen-group"
                    key={group.kitchenName}
                  >
                    <div className="disbursement-kitchen-group-header">
                      <strong>{group.kitchenName}</strong>
                      <span>
                        {group.transactions.filter((row) => row.is_disbursed).length}
                        /{group.transactions.length} dicek
                      </span>
                    </div>

                    <div className="disbursement-table-wrap">
                      <table className="disbursement-table">
                        <thead>
                          <tr>
                            <th>Jenis</th>
                            <th>Catatan</th>
                            <th>Tujuan / Rekening</th>
                            <th>Nominal</th>
                            <th>Status</th>
                            <th>Cek</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.transactions.map((transaction) => {
                            const flowLabel = getDailyDisbursementFlowLabel(
                              transaction.flow_type
                            )
                            const flowClass = getDailyDisbursementFlowClass(
                              transaction.flow_type
                            )

                            return (
                              <tr
                                key={transaction.id}
                                className={
                                  transaction.is_disbursed
                                    ? 'is-checked'
                                    : 'is-pending'
                                }
                              >
                                <td>
                                  <span
                                    className={`disbursement-flow-badge disbursement-flow-badge--${flowClass}`}
                                  >
                                    {flowLabel}
                                  </span>
                                </td>
                                <td>
                                  <span className="disbursement-note">
                                    {transaction.note?.trim() || '-'}
                                  </span>
                                </td>
                                <td>
                                  <div className="disbursement-destination">
                                    <strong>{formatAccount(transaction)}</strong>
                                    {formatAccountMeta(transaction) ? (
                                      <small>{formatAccountMeta(transaction)}</small>
                                    ) : null}
                                  </div>
                                </td>
                                <td>
                                  <strong className="disbursement-amount">
                                    {formatCurrency(transaction.amount)}
                                  </strong>
                                </td>
                                <td>
                                  <span
                                    className={
                                      transaction.is_disbursed
                                        ? 'disbursement-check-status is-checked'
                                        : 'disbursement-check-status is-pending'
                                    }
                                  >
                                    {transaction.is_disbursed
                                      ? 'Sudah dicek'
                                      : 'Belum dicek'}
                                  </span>
                                </td>
                                <td>
                                  <label className="disbursement-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={transaction.is_disbursed}
                                      disabled={savingId === transaction.id}
                                      onChange={(event) =>
                                        void handleToggle(
                                          transaction,
                                          event.target.checked
                                        )
                                      }
                                    />
                                    <span aria-hidden="true">
                                      {transaction.is_disbursed ? (
                                        <Check aria-hidden="true" />
                                      ) : null}
                                    </span>
                                    <span className="sr-only">
                                      {transaction.is_disbursed
                                        ? 'Batalkan checklist'
                                        : 'Tandai sudah dicek'}
                                    </span>
                                  </label>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default DisbursementPage
