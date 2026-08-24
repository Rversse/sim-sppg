import { useEffect, useState } from 'react'

import {
  getOverallReport,
  getIncomeReport,
  getSupplierReport
} from '@/features/report/reports-service'

import {
  exportOverallReport,
  exportIncomeReport,
  exportSupplierReport
} from '@/features/report/report-export'
import { printReport } from '@/features/report/report-print'
import {
  DateRangePicker,
  type DateRangeValue
} from '@/components/ui/date-range-picker'
import { formatCurrency, getTodayLocal } from '@/lib/formatters'
import { supabase } from '@/lib/supabase'

type ReportTab = 'overall' | 'income' | 'supplier'

type ReportLoader<T> = (startDate: string, endDate: string) => Promise<T>

function loadOverallReport(startDate: string, endDate: string) {
  return getOverallReport({ startDate, endDate, kitchenId: '' })
}

function loadIncomeReport(startDate: string, endDate: string) {
  return getIncomeReport({ startDate, endDate })
}

function loadSupplierReport(startDate: string, endDate: string) {
  return getSupplierReport({ startDate, endDate, kitchenId: '' })
}

function useReportData<T>(
  loader: ReportLoader<T>,
  errorMessage: string
): {
  startDate: string
  endDate: string
  setStartDate: (value: string) => void
  setEndDate: (value: string) => void
  report: T | null
  loading: boolean
  error: string | null
  setError: (value: string | null) => void
} {
  const today = getTodayLocal()
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [report, setReport] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function requestReload() {
    setLoading(true)
  }

  useEffect(() => {
    let cancelled = false

    void loader(startDate, endDate)
      .then((result) => {
        if (cancelled) return
        setReport(result)
        setError(null)
      })
      .catch((loadError: unknown) => {
        console.error(loadError)
        if (!cancelled) {
          setError(errorMessage)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [endDate, errorMessage, loader, startDate])

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

        void loader(startDate, endDate)
          .then((result) => {
            if (cancelled) return
            setReport(result)
            setError(null)
          })
          .catch((loadError: unknown) => {
            console.error('Gagal memperbarui laporan dari Realtime:', loadError)

            if (!cancelled) {
              setError(errorMessage)
            }
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
        `reports-page-live-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
          table: 'accounts'
        },
        scheduleRealtimeRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'income_suppliers'
        },
        scheduleRealtimeRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'suppliers'
        },
        scheduleRealtimeRefresh
      )
      .subscribe((status) => {
        if (cancelled) return

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Reports Realtime] ${status}`)
        }
      })

    return () => {
      cancelled = true

      if (refreshTimer !== null) {
        clearTimeout(refreshTimer)
        refreshTimer = null
      }

      void supabase.removeChannel(channel)
    }
  }, [endDate, errorMessage, loader, startDate])

  const updateStartDate = (value: string) => {
    requestReload()
    setStartDate(value)
  }

  const updateEndDate = (value: string) => {
    requestReload()
    setEndDate(value)
  }

  return {
    startDate,
    endDate,
    setStartDate: updateStartDate,
    setEndDate: updateEndDate,
    report,
    loading,
    error,
    setError
  }
}

function DateFilter({
  startDate,
  endDate,
  onChange
}: {
  startDate: string
  endDate: string
  onChange: (value: DateRangeValue) => void
}) {
  return (
    <div className="reports-date-range-field">
      <DateRangePicker value={{ startDate, endDate }} onChange={onChange} />
    </div>
  )
}

function ReportActions({
  reportAvailable,
  loading,
  onExport
}: {
  reportAvailable: boolean
  loading: boolean
  onExport: () => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={onExport}
        disabled={!reportAvailable || loading}
      >
        Export Excel
      </button>
      <button
        type="button"
        onClick={() => printReport()}
        disabled={!reportAvailable || loading}
      >
        Print
      </button>
    </>
  )
}

function SummaryCard({
  label,
  value,
  note,
  negative = false
}: {
  label: string
  value: number
  note: string
  negative?: boolean
}) {
  return (
    <div className="reports-summary-card">
      <span>{label}</span>
      <strong className={negative ? 'negative' : ''}>
        {formatCurrency(value)}
      </strong>
      <small>{note}</small>
    </div>
  )
}

function LoadingState() {
  return <div className="reports-empty">Memuat laporan...</div>
}

function ErrorState({ message }: { message: string }) {
  return <div className="reports-error">{message}</div>
}

function EmptyState() {
  return (
    <div className="reports-empty">Belum ada transaksi pada periode ini.</div>
  )
}

function ReportDateRange({
  startDate,
  endDate,
  setStartDate,
  setEndDate
}: {
  startDate: string
  endDate: string
  setStartDate: (value: string) => void
  setEndDate: (value: string) => void
}) {
  return (
    <DateFilter
      startDate={startDate}
      endDate={endDate}
      onChange={({ startDate: nextStartDate, endDate: nextEndDate }) => {
        setStartDate(nextStartDate)
        setEndDate(nextEndDate)
      }}
    />
  )
}

function OverallReportView() {
  const {
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    report,
    loading,
    error,
    setError
  } = useReportData(loadOverallReport, 'Gagal memuat laporan keseluruhan')

  return (
    <section className="reports-section">
      <div className="reports-filter-panel">
        <ReportDateRange
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
        />
        <ReportActions
          reportAvailable={Boolean(report)}
          loading={loading}
          onExport={() => {
            if (!report) return
            void exportOverallReport(report, startDate, endDate).catch(
              (error) => {
                console.error(error)
                setError('Gagal mengekspor laporan keseluruhan')
              }
            )
          }}
        />
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {!loading && !error && report && (
        <>
          <div className="reports-summary-grid">
            <SummaryCard
              label="Total RAB"
              value={report.totals.income}
              note="Total RAB pada periode terpilih"
            />
            <SummaryCard
              label="Total Supplier"
              value={report.totals.expense}
              note="Total pembayaran ke supplier pada periode terpilih"
            />
            <SummaryCard
              label="Total Operasional"
              value={report.totals.operational}
              note="Total transaksi operasional pada periode terpilih"
            />
            <SummaryCard
              label="Total"
              value={report.totals.remaining}
              note="Sisa dana setelah dilakukan pembayaran ke supplier dari RAB pada periode terpilih"
              negative={report.totals.remaining < 0}
            />
          </div>

          <div className="reports-table-wrapper">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>DAPUR</th>
                  <th>RAB</th>
                  <th>SUPPLIER</th>
                  <th>OPS</th>
                  <th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {report.kitchens.map((item) => (
                  <tr key={item.kitchenId}>
                    <td>{item.kitchenName}</td>
                    <td>{formatCurrency(item.income)}</td>
                    <td>{formatCurrency(item.expense)}</td>
                    <td>{formatCurrency(item.operational)}</td>
                    <td
                      className={item.remaining < 0 ? 'negative' : 'positive'}
                    >
                      {formatCurrency(item.remaining)}
                    </td>
                  </tr>
                ))}
                <tr className="reports-total-row">
                  <td>GRAND TOTAL</td>
                  <td>{formatCurrency(report.totals.income)}</td>
                  <td>{formatCurrency(report.totals.expense)}</td>
                  <td>{formatCurrency(report.totals.operational)}</td>
                  <td
                    className={
                      report.totals.remaining < 0 ? 'negative' : 'positive'
                    }
                  >
                    {formatCurrency(report.totals.remaining)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function IncomeReportView() {
  const {
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    report,
    loading,
    error,
    setError
  } = useReportData(loadIncomeReport, 'Gagal memuat rekap pemasukan')

  return (
    <section className="reports-section">
      <div className="reports-filter-panel">
        <ReportDateRange
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
        />
        <ReportActions
          reportAvailable={Boolean(report)}
          loading={loading}
          onExport={() => {
            if (!report) return
            void exportIncomeReport(report, startDate, endDate).catch(
              (error) => {
                console.error(error)
                setError('Gagal mengekspor rekap pemasukan')
              }
            )
          }}
        />
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {!loading && !error && report && (
        <>
          <div className="reports-summary-grid reports-summary-single">
            <SummaryCard
              label="Grand Total Pemasukan"
              value={report.grandTotal}
              note="Total pemasukan pada periode terpilih"
            />
          </div>

          {report.rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="reports-table-wrapper">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>NAMA SUPPLIER</th>
                    <th>NAMA PEMILIK</th>
                    <th>REKENING BANK</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr
                      key={`${row.supplierName}-${row.ownerName}-${row.bank}`}
                    >
                      <td>{row.supplierName}</td>
                      <td>{row.ownerName}</td>
                      <td>{row.bank}</td>
                      <td>{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                  <tr className="reports-total-row">
                    <td colSpan={3}>GRAND TOTAL</td>
                    <td>{formatCurrency(report.grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function SupplierReportView() {
  const {
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    report,
    loading,
    error,
    setError
  } = useReportData(loadSupplierReport, 'Gagal memuat rekap pengeluaran')

  return (
    <section className="reports-section">
      <div className="reports-filter-panel">
        <ReportDateRange
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
        />
        <ReportActions
          reportAvailable={Boolean(report)}
          loading={loading}
          onExport={() => {
            if (!report) return
            void exportSupplierReport(report, startDate, endDate).catch(
              (error) => {
                console.error(error)
                setError('Gagal mengekspor rekap pengeluaran')
              }
            )
          }}
        />
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {!loading && !error && report && (
        <>
          {report.summaryRows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="reports-table-wrapper">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>DAPUR</th>
                    <th>ARUTALA</th>
                    <th>SUKALARANG</th>
                    <th>ARIS</th>
                    <th>BABINSA</th>
                    <th>OPS</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {report.summaryRows.map((row) => (
                    <tr key={row.kitchenName}>
                      <td>{row.kitchenName}</td>
                      <td>{formatCurrency(row.Arutala)}</td>
                      <td>{formatCurrency(row.Sukalarang)}</td>
                      <td>{formatCurrency(row.Aris)}</td>
                      <td>{formatCurrency(row.Babinsa)}</td>
                      <td>{formatCurrency(row.Operational)}</td>
                      <td>{formatCurrency(row.Total)}</td>
                    </tr>
                  ))}
                  <tr className="reports-total-row">
                    <td>GRAND TOTAL</td>
                    <td>{formatCurrency(report.totals.Arutala)}</td>
                    <td>{formatCurrency(report.totals.Sukalarang)}</td>
                    <td>{formatCurrency(report.totals.Aris)}</td>
                    <td>{formatCurrency(report.totals.Babinsa)}</td>
                    <td>{formatCurrency(report.totals.Operational)}</td>
                    <td>{formatCurrency(report.totals.Total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('overall')

  return (
    <main className="reports-page">
      <nav className="reports-tabs">
        <button
          type="button"
          className={tab === 'overall' ? 'active' : ''}
          onClick={() => setTab('overall')}
        >
          Keseluruhan
        </button>
        <button
          type="button"
          className={tab === 'income' ? 'active' : ''}
          onClick={() => setTab('income')}
        >
          Rekap Pemasukan
        </button>
        <button
          type="button"
          className={tab === 'supplier' ? 'active' : ''}
          onClick={() => setTab('supplier')}
        >
          Rekap Pengeluaran
        </button>
      </nav>

      {tab === 'overall' && <OverallReportView />}
      {tab === 'income' && <IncomeReportView />}
      {tab === 'supplier' && <SupplierReportView />}
    </main>
  )
}
