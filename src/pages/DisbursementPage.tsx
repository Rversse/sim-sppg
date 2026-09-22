import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import {
  getOverallReport,
  type OverallReport
} from '@/features/report/reports-service'
import { formatCurrency } from '@/lib/formatters'
import { supabase } from '@/lib/supabase'
import {
  calculateDisbursementProgress,
  DISBURSEMENT_ITEMS,
  getCurrentDisbursementPeriod,
  getDisbursementPeriod,
  getDisbursementPeriods,
  getDisbursementProgressClass,
  getDisbursementRows,
  isDisbursementLocked,
  saveDisbursementCheckbox,
  summarizeDisbursementRows,
  type DisbursementField,
  type DisbursementPeriod,
  type DisbursementRow,
  type DisbursementSummary
} from '@/features/disbursement/disbursement-service'

const DISBURSEMENT_PERIOD_KEY = 'disbursement_selected_period'

function formatLongDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, day))
}

function formatPeriodMonth(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, day))
}

function getChecklistStatus(summary: DisbursementSummary) {
  if (summary.completedKitchens === summary.totalKitchens) {
    return 'Selesai'
  }

  if (summary.completedKitchens > 0 || summary.inProgressCount > 0) {
    return 'Berjalan'
  }

  return 'Belum Mulai'
}

function FinancialSummary({ report }: { report: OverallReport | null }) {
  if (!report) {
    return (
      <div className="disbursement-financial-empty">
        Ringkasan transaksi periode sedang dimuat...
      </div>
    )
  }

  const cards = [
    {
      label: 'Pencairan / RAB',
      value: report.totals.income,
      className: 'is-rab'
    },
    {
      label: 'Real / RAB',
      value: report.totals.expense,
      className: 'is-real-rab'
    },
    {
      label: 'GAS',
      value: report.totals.gas,
      className: 'is-gas'
    },
    {
      label: 'Pencairan / Ops',
      value: report.totals.operational,
      className: 'is-ops'
    },
    {
      label: 'Real / Ops',
      value: report.totals.realOperational,
      className: 'is-real-ops'
    }
  ]

  return (
    <section className="disbursement-financial-panel">
      <div className="disbursement-section-heading">
        <div>
          <h2>Ringkasan Keuangan Periode</h2>
          <p>
            Referensi transaksi dari tanggal {report.startDate} sampai{' '}
            {report.endDate}.
          </p>
        </div>
      </div>

      <div className="disbursement-financial-grid">
        {cards.map((card) => (
          <article
            className={`disbursement-financial-card ${card.className}`}
            key={card.label}
          >
            <span>{card.label}</span>
            <strong>{formatCurrency(card.value)}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}

export function DisbursementPage() {
  const { user } = useAuth()
  const { error: toastError } = useToast()
  const canView = canAccess(user?.role, 'disbursement.view')

  const availablePeriods = useMemo(() => getDisbursementPeriods(), [])
  const currentPeriod = useMemo(() => getCurrentDisbursementPeriod(), [])
  const currentStoredPeriod = Number(
    localStorage.getItem(DISBURSEMENT_PERIOD_KEY) ?? currentPeriod.number
  )
  const initialPeriodNumber =
    Number.isFinite(currentStoredPeriod) &&
    currentStoredPeriod >= 1 &&
    currentStoredPeriod <= currentPeriod.number
      ? currentStoredPeriod
      : currentPeriod.number

  const [selectedPeriodNumber, setSelectedPeriodNumber] = useState(
    initialPeriodNumber
  )
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false)
  const [periodSearch, setPeriodSearch] = useState('')
  const [rows, setRows] = useState<DisbursementRow[]>([])
  const [financialReport, setFinancialReport] =
    useState<OverallReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState('')

  const selectedPeriod = useMemo(
    () => getDisbursementPeriod(selectedPeriodNumber),
    [selectedPeriodNumber]
  )

  const locked = useMemo(
    () => isDisbursementLocked(selectedPeriod.checklistDate),
    [selectedPeriod.checklistDate]
  )

  const filteredPeriods = useMemo(() => {
    const query = periodSearch.trim().toLowerCase()

    if (!query) {
      return availablePeriods
    }

    return availablePeriods.filter((period) =>
      [
        String(period.number),
        period.startDate,
        period.endDate,
        period.checklistDate,
        period.label
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    )
  }, [availablePeriods, periodSearch])

  const groupedPeriods = useMemo(() => {
    const groups = new Map<string, DisbursementPeriod[]>()

    for (const period of filteredPeriods) {
      const groupKey = period.startDate.slice(0, 7)
      const current = groups.get(groupKey) ?? []
      current.push(period)
      groups.set(groupKey, current)
    }

    return [...groups.entries()]
  }, [filteredPeriods])

  const summary = useMemo(() => summarizeDisbursementRows(rows), [rows])
  const checklistStatus = useMemo(
    () => getChecklistStatus(summary),
    [summary]
  )

  const loadPeriodData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [nextRows, nextReport] = await Promise.all([
        getDisbursementRows(selectedPeriod.checklistDate),
        getOverallReport({
          startDate: selectedPeriod.startDate,
          endDate: selectedPeriod.endDate,
          kitchenId: ''
        })
      ])

      setRows(nextRows)
      setFinancialReport(nextReport)
    } catch (loadError: unknown) {
      console.error(loadError)
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Gagal memuat data periode.'

      setError(message)
    } finally {
      setLoading(false)
    }
  }, [
    selectedPeriod.checklistDate,
    selectedPeriod.endDate,
    selectedPeriod.startDate
  ])

  useEffect(() => {
    localStorage.setItem(
      DISBURSEMENT_PERIOD_KEY,
      String(selectedPeriod.number)
    )
  }, [selectedPeriod.number])

  useEffect(() => {
    void loadPeriodData()
  }, [loadPeriodData])

  useEffect(() => {
    if (!periodPickerOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPeriodPickerOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [periodPickerOpen])

  useEffect(() => {
    let cancelled = false
    let refreshInFlight = false
    let refreshQueued = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRealtimeRefresh = () => {
      if (cancelled || refreshTimer !== null) {
        return
      }

      refreshTimer = setTimeout(() => {
        refreshTimer = null

        if (cancelled) {
          return
        }

        if (refreshInFlight) {
          refreshQueued = true
          return
        }

        refreshInFlight = true

        void loadPeriodData()
          .catch((refreshError: unknown) => {
            console.error(
              'Gagal memperbarui checklist periode dari Realtime:',
              refreshError
            )
          })
          .finally(() => {
            refreshInFlight = false

            if (refreshQueued && !cancelled) {
              refreshQueued = false
              scheduleRealtimeRefresh()
            }
          })
      }, 150)
    }

    const channel = supabase
      .channel(
        `disbursement-period-live-${selectedPeriod.number}-${Date.now()}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'disbursement_checklists'
        },
        scheduleRealtimeRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kitchens'
        },
        scheduleRealtimeRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        scheduleRealtimeRefresh
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!cancelled) {
            console.warn(`[Disbursement Period Realtime] ${status}`)
          }
        }
      })

    return () => {
      cancelled = true

      if (refreshTimer !== null) {
        clearTimeout(refreshTimer)
      }

      void supabase.removeChannel(channel)
    }
  }, [loadPeriodData, selectedPeriod.number])

  function selectPeriod(periodNumber: number) {
    setLoading(true)
    setFinancialReport(null)
    setPeriodSearch('')
    setPeriodPickerOpen(false)
    setSelectedPeriodNumber(periodNumber)
  }

  function goToPreviousPeriod() {
    if (selectedPeriod.number <= 1) {
      return
    }

    selectPeriod(selectedPeriod.number - 1)
  }

  function goToNextPeriod() {
    if (selectedPeriod.number >= currentPeriod.number) {
      return
    }

    selectPeriod(selectedPeriod.number + 1)
  }

  async function handleToggle(
    row: DisbursementRow,
    field: DisbursementField,
    value: boolean
  ) {
    if (!canView || locked || savingKey) return

    const key = `${row.kitchen.id}:${field}`
    setSavingKey(key)
    setError('')

    setRows((current) =>
      current.map((item) => {
        if (item.kitchen.id !== row.kitchen.id) {
          return item
        }

        const nextChecklist = item.checklist
          ? { ...item.checklist, [field]: value }
          : {
              id: '',
              kitchen_id: row.kitchen.id,
              checklist_date: selectedPeriod.checklistDate,
              relawan: false,
              pic_sekolah: false,
              kader_posyandu: false,
              sewa_kendaraan: false,
              fasilitas_sppg: false,
              [field]: value
            }

        return {
          ...item,
          checklist: nextChecklist,
          progress: calculateDisbursementProgress(nextChecklist)
        }
      })
    )

    try {
      await saveDisbursementCheckbox(
        row.kitchen.id,
        selectedPeriod.checklistDate,
        field,
        value
      )
    } catch (saveError: unknown) {
      console.error(saveError)

      try {
        await loadPeriodData()
      } catch (reloadError) {
        console.error(reloadError)
      }

      const message =
        saveError instanceof Error
          ? saveError.message
          : 'Gagal menyimpan checklist pencairan.'

      setError(message)
      toastError('Checklist gagal disimpan', message)
    } finally {
      setSavingKey(null)
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
          <span>Checklist Pencairan Periode</span>
          <p>
            Hanya Admin. Satu periode berlangsung 14 hari dan checklist
            pencairan dilakukan pada Jumat minggu kedua.
          </p>
        </div>

        <div className="disbursement-period-picker">
          <div className="disbursement-period-picker-actions">
            <button
              type="button"
              className="disbursement-period-nav"
              onClick={goToPreviousPeriod}
              disabled={selectedPeriod.number <= 1}
              aria-label="Periode sebelumnya"
              title="Periode sebelumnya"
            >
              <ChevronLeft aria-hidden="true" />
            </button>

            <button
              type="button"
              className="disbursement-period-trigger"
              onClick={() => setPeriodPickerOpen((current) => !current)}
              aria-expanded={periodPickerOpen}
              aria-haspopup="dialog"
            >
              <span className="disbursement-period-trigger-kicker">
                PERIODE {selectedPeriod.number}
              </span>
              <strong>{selectedPeriod.label}</strong>
              <small>
                Checklist / pencairan: {formatLongDate(selectedPeriod.checklistDate)}
              </small>
            </button>

            <button
              type="button"
              className="disbursement-period-nav"
              onClick={goToNextPeriod}
              disabled={selectedPeriod.number >= currentPeriod.number}
              aria-label="Periode berikutnya"
              title="Periode berikutnya"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>

          {periodPickerOpen ? (
            <div className="disbursement-period-picker-popover" role="dialog">
              <div className="disbursement-period-search">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  value={periodSearch}
                  onChange={(event) => setPeriodSearch(event.target.value)}
                  placeholder="Cari periode, tanggal, atau tahun..."
                  autoFocus
                />
              </div>

              <div className="disbursement-period-list">
                {groupedPeriods.length === 0 ? (
                  <div className="disbursement-period-empty">
                    Periode tidak ditemukan.
                  </div>
                ) : (
                  groupedPeriods.map(([groupKey, periods]) => (
                    <section
                      className="disbursement-period-group"
                      key={groupKey}
                    >
                      <strong>{formatPeriodMonth(periods[0].startDate)}</strong>

                      <div>
                        {periods.map((period) => (
                          <button
                            type="button"
                            className={
                              period.number === selectedPeriod.number
                                ? 'is-active'
                                : ''
                            }
                            key={period.number}
                            onClick={() => selectPeriod(period.number)}
                          >
                            <span>Periode {period.number}</span>
                            <small>
                              {period.startDate} — {period.endDate}
                            </small>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="disbursement-error" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <section
          className="disbursement-panel disbursement-loading"
          aria-busy="true"
          aria-label="Memuat data periode"
        >
          <div className="disbursement-skeleton disbursement-skeleton-summary" />
          <div className="disbursement-skeleton" />
          <div className="disbursement-skeleton" />
          <div className="disbursement-skeleton" />
        </section>
      ) : (
        <>
          <section className="disbursement-summary-card">
            <div className="disbursement-summary-main">
              <div className="disbursement-period-meta">
                <span>Periode</span>
                <strong>{selectedPeriod.label}</strong>
                <small>
                  Tanggal pencairan / checklist: {formatLongDate(selectedPeriod.checklistDate)}
                </small>
              </div>

              <div className="disbursement-summary-progress-label">
                <span>Progress Checklist</span>
                <strong>{summary.overallProgress}%</strong>
              </div>
            </div>

            <div className="disbursement-status-summary">
              <span className="is-danger">
                <b>{summary.notStartedCount}</b>
                <small>Belum Mulai</small>
              </span>

              <span className="is-warning">
                <b>{summary.inProgressCount}</b>
                <small>Berjalan</small>
              </span>

              <span className="is-success">
                <b>{summary.completedKitchens}</b>
                <small>Selesai</small>
              </span>
            </div>

            <div className="disbursement-period-status">
              Status periode: <strong>{checklistStatus}</strong>
            </div>

            <div
              className="disbursement-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summary.overallProgress}
              aria-label="Progress Checklist"
            >
              <span style={{ width: `${summary.overallProgress}%` }} />
            </div>

            {locked ? (
              <div className="disbursement-lock">
                Data terkunci karena tanggal checklist sudah lebih dari 7 hari
                berlalu.
              </div>
            ) : null}
          </section>

          <FinancialSummary report={financialReport} />

          <section className="disbursement-panel">
            <div className="disbursement-panel-header">
              <div>
                <h2>Checklist Pencairan</h2>
                <p>
                  Centang komponen yang sudah dicek untuk setiap dapur.
                  Perubahan tersimpan otomatis.
                </p>
              </div>
              <span>{rows.length} dapur</span>
            </div>

            {rows.length === 0 ? (
              <div className="disbursement-empty">
                Tidak ada dapur yang masuk daftar pencairan.
              </div>
            ) : (
              <div className="disbursement-table-wrap">
                <table className="disbursement-table">
                  <thead>
                    <tr>
                      <th scope="col">Dapur</th>
                      {DISBURSEMENT_ITEMS.map((item) => (
                        <th key={item.key} scope="col">
                          {item.label}
                        </th>
                      ))}
                      <th scope="col">Progress</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.kitchen.id}>
                        <td>
                          <strong>{row.kitchen.name}</strong>
                        </td>

                        {DISBURSEMENT_ITEMS.map((item) => {
                          const checked = Boolean(row.checklist?.[item.key])

                          return (
                            <td key={item.key}>
                              <label className="disbursement-checkbox">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={locked || Boolean(savingKey)}
                                  onChange={(event) =>
                                    void handleToggle(
                                      row,
                                      item.key,
                                      event.target.checked
                                    )
                                  }
                                />
                                <span />
                              </label>
                            </td>
                          )
                        })}

                        <td>
                          <span
                            className={`disbursement-progress-badge ${getDisbursementProgressClass(row.progress)}`}
                          >
                            {row.progress === 100
                              ? '✓ Selesai'
                              : `${row.progress}%`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
