import { useEffect, useState } from 'react'

import {
  getOverallReport,
  getIncomeReport,
  getSupplierReport,
  getOperationalKitchenLabel
} from '@/features/report/reports-service'

import {
  exportOverallReport,
  exportPencairanReport,
  exportSupplierReport
} from '@/features/report/report-export'
import { printReport } from '@/features/report/report-print'
import {
  DateRangePicker,
  type DateRangeValue
} from '@/components/ui/date-range-picker'
import { formatCurrency, formatDate, getTodayLocal } from '@/lib/formatters'
import { supabase } from '@/lib/supabase'

type ReportTab = 'overall' | 'pencairan' | 'supplier'

type ReportLoader<T> = (startDate: string, endDate: string) => Promise<T>

function loadOverallReport(startDate: string, endDate: string) {
  return getOverallReport({ startDate, endDate, kitchenId: '' })
}

function loadSupplierReport(startDate: string, endDate: string) {
  return getSupplierReport({ startDate, endDate, kitchenId: '' })
}

type PencairanReport = Awaited<ReturnType<typeof getIncomeReport>>

function loadPencairanReport(
  startDate: string,
  endDate: string
): Promise<PencairanReport> {
  return getIncomeReport({ startDate, endDate })
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
  onExport,
  splitPrint = false
}: {
  reportAvailable: boolean
  loading: boolean
  onExport: () => void
  splitPrint?: boolean
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

      {splitPrint ? (
        <div className="reports-print-actions">
          <button
            type="button"
            onClick={() => printReport('belanja')}
            disabled={!reportAvailable || loading}
          >
            Print Belanja + Pemasukan
          </button>
          <button
            type="button"
            onClick={() => printReport('operational')}
            disabled={!reportAvailable || loading}
          >
            Print Operasional
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => printReport()}
          disabled={!reportAvailable || loading}
        >
          Print
        </button>
      )}
    </>
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
    <section
      className="reports-section"
      data-report-start-date={startDate}
      data-report-end-date={endDate}
    >
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
          splitPrint
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
          <div className="reports-disbursement-block reports-overall-belanja-block">
            <h2 className="reports-subsection-title">
              Pencairan Belanja Harian
            </h2>


            <div className="reports-summary-grid reports-summary-belanja">
              <article className="reports-summary-card reports-summary-card--rab">
                <span>Total RAB</span>
                <strong className={report.totals.totalRAB < 0 ? 'negative' : 'positive'}>
                  {formatCurrency(report.totals.totalRAB)}
                </strong>
                <small>Total belanja harian dikurangi belanja real</small>
              </article>

              <article className="reports-summary-card reports-summary-card--ops">
                <span>Total OPS</span>
                <strong
                  className={
                    report.totals.totalOperational < 0
                      ? 'negative'
                      : 'positive'
                  }
                >
                  {formatCurrency(report.totals.totalOperational)}
                </strong>
                <small>Operasional harian dikurangi operasional real</small>
              </article>

              <article className="reports-summary-card reports-summary-card--arutala">
                <span>OPS / Arutala</span>
                <strong className="positive">
                  {formatCurrency(report.totals.gas)}
                </strong>
                <small>Semua pencairan yang masuk ke rekening Arutala</small>
              </article>
            </div>

            <div className="reports-table-wrapper">
              <table className="reports-table reports-table-overall">
              <thead>
                <tr>
                  <th className="reports-col-kitchen">DAPUR</th>
                  <th className="reports-col-rab">RAB / PENCAIRAN</th>
                  <th className="reports-col-real-rab">RAB / REAL</th>
                  <th className="reports-col-total">TOTAL RAB</th>
                  <th className="reports-col-ops">OPS / PENCAIRAN</th>
                  <th className="reports-col-real-ops">OPS / REAL</th>
                  <th className="reports-col-total">TOTAL OPS</th>
                  <th className="reports-col-gas">OPS / ARUTALA</th>
                </tr>
              </thead>
              <tbody>
                {[...report.kitchens]
                  .sort((a, b) => a.totalRAB - b.totalRAB)
                  .map((item) => (
                    <tr key={item.kitchenId}>
                      <td>
                        <span className="reports-kitchen-name">
                          {item.kitchenName}
                        </span>
                      </td>
                    <td>{formatCurrency(item.income)}</td>
                    <td>{formatCurrency(item.expense)}</td>
                    <td className={item.totalRAB < 0 ? 'negative' : 'positive'}>
                      {formatCurrency(item.totalRAB)}
                    </td>
                    <td>{formatCurrency(item.operational)}</td>
                    <td>{formatCurrency(item.realOperational)}</td>
                    <td
                      className={
                        item.totalOperational < 0 ? 'negative' : 'positive'
                      }
                    >
                      {formatCurrency(item.totalOperational)}
                    </td>
                    <td>{formatCurrency(item.gas)}</td>
                  </tr>
                ))}
                <tr className="reports-total-row">
                  <td>GRAND TOTAL</td>
                  <td>{formatCurrency(report.totals.income)}</td>
                  <td>{formatCurrency(report.totals.expense)}</td>
                  <td
                    className={
                      report.totals.totalRAB < 0 ? 'negative' : 'positive'
                    }
                  >
                    {formatCurrency(report.totals.totalRAB)}
                  </td>
                  <td>{formatCurrency(report.totals.operational)}</td>
                  <td>{formatCurrency(report.totals.realOperational)}</td>
                  <td
                    className={
                      report.totals.totalOperational < 0
                        ? 'negative'
                        : 'positive'
                    }
                  >
                    {formatCurrency(report.totals.totalOperational)}
                  </td>
                  <td>{formatCurrency(report.totals.gas)}</td>
                </tr>
              </tbody>
              </table>
            </div>
          </div>

          {report.otherIncome.length > 0 ? (
            <div className="reports-disbursement-block reports-other-income-block">
              <h2 className="reports-subsection-title">
                Pemasukan Lainnya
              </h2>

              <div className="reports-other-income-summary">
                <span>
                  {report.otherIncome.length} transaksi langsung ke rekening
                </span>
                <strong>
                  {formatCurrency(
                    report.otherIncome.reduce(
                      (total, item) => total + item.amount,
                      0
                    )
                  )}
                </strong>
              </div>

              <div className="reports-table-wrapper">
                <table className="reports-table reports-table-other-income">
                  <thead>
                    <tr>
                      <th>TANGGAL</th>
                      <th>REKENING</th>
                      <th>NOMINAL</th>
                      <th>CATATAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.otherIncome.map((item, index) => (
                      <tr key={`${item.date}-${item.accountName}-${index}`}>
                        <td>{formatDate(item.date)}</td>
                        <td>{item.accountName}</td>
                        <td>{formatCurrency(item.amount)}</td>
                        <td className="reports-other-income-note">
                          {item.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="reports-disbursement-block reports-overall-operational-block">
            <h2 className="reports-subsection-title">
              Pencairan Operasional Harian
            </h2>

            <div className="reports-table-wrapper">
              <table className="reports-table reports-table-overall-operational">
                <thead>
                  <tr>
                    <th>DAPUR</th>
                    <th>GAJI RELAWAN</th>
                    <th>INSENTIF PIC SEKOLAH</th>
                    <th>INSENTIF PIC POSYANDU</th>
                    <th>SEWA KENDARAAN</th>
                    <th>SEWA SPPG</th>
                    <th>TOTAL OPERASIONAL</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.kitchens]
                    .sort((a, b) => a.kitchenName.localeCompare(b.kitchenName, 'id'))
                    .map((item) => (
                      <tr key={item.kitchenId}>
                        <td>
                          {getOperationalKitchenLabel(
                            item.kitchenName,
                            item.recipientName
                          )}
                        </td>
                        <td>{formatCurrency(item.relawanSalary)}</td>
                        <td>{formatCurrency(item.schoolPicIncentive)}</td>
                        <td>{formatCurrency(item.kaderIncentive)}</td>
                        <td>{formatCurrency(item.vehicleRent)}</td>
                        <td>{formatCurrency(item.sppgRent)}</td>
                        <td className="positive">
                          {formatCurrency(item.totalOperationalDisbursement)}
                        </td>
                      </tr>
                    ))}
                  <tr className="reports-total-row">
                    <td>GRAND TOTAL</td>
                    <td>{formatCurrency(report.totals.relawanSalary)}</td>
                    <td>{formatCurrency(report.totals.schoolPicIncentive)}</td>
                    <td>{formatCurrency(report.totals.kaderIncentive)}</td>
                    <td>{formatCurrency(report.totals.vehicleRent)}</td>
                    <td>{formatCurrency(report.totals.sppgRent)}</td>
                    <td>{formatCurrency(report.totals.totalOperationalDisbursement)}</td>
                  </tr>
                </tbody>
              </table>

              <p className="reports-operational-note">
                Catatan: Pencairan operasional dapur disalurkan ke rekening PIC
                Yayasan. Pencairan Sewa Kendaraan ke rekening Berkah Mandiri
                Putra.
              </p>
            </div>
          </div>
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
    <section
      className="reports-section"
      data-report-start-date={startDate}
      data-report-end-date={endDate}
    >
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
                      <td>{formatCurrency(row.Total)}</td>
                    </tr>
                  ))}
                  <tr className="reports-total-row">
                    <td>GRAND TOTAL</td>
                    <td>{formatCurrency(report.totals.Arutala)}</td>
                    <td>{formatCurrency(report.totals.Sukalarang)}</td>
                    <td>{formatCurrency(report.totals.Aris)}</td>
                    <td>{formatCurrency(report.totals.Babinsa)}</td>
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


function PencairanReportView() {
  const {
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    report,
    loading,
    error,
    setError
  } = useReportData(
    loadPencairanReport,
    'Gagal memuat laporan pencairan belanja'
  )

  return (
    <section
      className="reports-section"
      data-report-title="Pencairan Belanja"
      data-report-start-date={startDate}
      data-report-end-date={endDate}
    >
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

            void exportPencairanReport(report, startDate, endDate).catch(
              (exportError: unknown) => {
                console.error(exportError)
                setError('Gagal mengekspor laporan pencairan belanja')
              }
            )
          }}
        />
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {!loading && !error && report && (
        <div className="reports-disbursement-block">
          <h2 className="reports-subsection-title">Pencairan Belanja</h2>

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
        </div>
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
          className={tab === 'pencairan' ? 'active' : ''}
          onClick={() => setTab('pencairan')}
        >
          Pencairan
        </button>
        <button
          type="button"
          className={tab === 'supplier' ? 'active' : ''}
          onClick={() => setTab('supplier')}
        >
          Rekap Pengeluaran
        </button>
      </nav>

      {tab === 'pencairan' && <PencairanReportView />}
      {tab === 'overall' && <OverallReportView />}
      {tab === 'supplier' && <SupplierReportView />}
    </main>
  )
}
