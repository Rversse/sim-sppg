import { useEffect, useState } from 'react'

import {
  getActiveKitchens,
  getOverallReport,
  getIncomeReport,
  getSupplierReport,
  type ReportKitchen,
  type OverallReport,
  type IncomeReport,
  type SupplierReport
} from '@/features/report/reports-service'

import {
  exportOverallReport,
  exportIncomeReport,
  exportSupplierReport
} from '@/features/report/report-export'
import { printReport } from '@/features/report/report-print'

type ReportTab = 'overall' | 'income' | 'supplier'

function getTodayLocal() {
  const now = new Date()
  const offset = now.getTimezoneOffset()

  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
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
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00`))
}

function DateFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply
}: {
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onApply: () => void
}) {
  return (
    <div className="reports-filter">
      <label>
        <span>Tanggal Mulai</span>

        <input
          type="date"
          value={startDate}
          onChange={(event) => {
            const value = event.target.value

            onStartDateChange(value)
            onEndDateChange(value)
          }}
        />
      </label>

      <label>
        <span>Tanggal Akhir</span>

        <input
          type="date"
          min={startDate}
          value={endDate}
          onChange={(event) => {
            const value = event.target.value

            if (value < startDate) {
              return
            }

            onEndDateChange(value)
          }}
        />
      </label>

      <button type="button" onClick={onApply}>
        Terapkan
      </button>
    </div>
  )
}

function KitchenFilter({
  kitchens,
  value,
  onChange
}: {
  kitchens: ReportKitchen[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span>Dapur</span>

      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Semua Dapur</option>

        {kitchens.map((kitchen) => (
          <option key={kitchen.id} value={kitchen.id}>
            {kitchen.name}
          </option>
        ))}
      </select>
    </label>
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
        {formatRupiah(value)}
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

function OverallReportView({
  kitchens,
  selectedKitchen,
  onKitchenChange
}: {
  kitchens: ReportKitchen[]
  selectedKitchen: string
  onKitchenChange: (value: string) => void
}) {
  const today = getTodayLocal()

  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)

  const [report, setReport] = useState<OverallReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectedKitchenName = kitchens.find(
    (kitchen) => kitchen.id === selectedKitchen
  )?.name

  async function loadReport() {
    setLoading(true)
    setError(null)

    try {
      const result = await getOverallReport({
        startDate,
        endDate,
        kitchenId: selectedKitchen
      })

      setReport(result)
    } catch (error) {
      console.error(error)
      setError('Gagal memuat laporan keseluruhan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadInitialReport = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await getOverallReport({
          startDate: today,
          endDate: today,
          kitchenId: selectedKitchen
        })

        if (!cancelled) {
          setReport(result)
        }
      } catch (error) {
        console.error(error)

        if (!cancelled) {
          setError('Gagal memuat laporan keseluruhan')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitialReport()

    return () => {
      cancelled = true
    }
  }, [selectedKitchen, today])

  return (
    <section className="reports-section">
      <div className="reports-filter-panel">
        <DateFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onApply={() => void loadReport()}
        />

        <KitchenFilter
          kitchens={kitchens}
          value={selectedKitchen}
          onChange={onKitchenChange}
        />

        <button
          type="button"
          onClick={() => {
            if (!report) return

            void exportOverallReport(
              report,
              startDate,
              endDate,
              selectedKitchenName
            ).catch((error) => {
              console.error(error)
              setError('Gagal mengekspor laporan keseluruhan')
            })
          }}
          disabled={!report || loading}
        >
          Export Excel
        </button>
        <button
          type="button"
          onClick={() => printReport()}
          disabled={!report || loading}
        >
          Print
        </button>
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
                    <td>{formatRupiah(item.income)}</td>
                    <td>{formatRupiah(item.expense)}</td>
                    <td>{formatRupiah(item.operational)}</td>
                    <td
                      className={item.remaining < 0 ? 'negative' : 'positive'}
                    >
                      {formatRupiah(item.remaining)}
                    </td>
                  </tr>
                ))}

                <tr className="reports-total-row">
                  <td>GRAND TOTAL</td>
                  <td>{formatRupiah(report.totals.income)}</td>
                  <td>{formatRupiah(report.totals.expense)}</td>
                  <td>{formatRupiah(report.totals.operational)}</td>
                  <td
                    className={
                      report.totals.remaining < 0 ? 'negative' : 'positive'
                    }
                  >
                    {formatRupiah(report.totals.remaining)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {report.kitchens
            .filter(
              (item) =>
                item.income > 0 || item.expense > 0 || item.operational > 0
            )
            .map((kitchen) => (
              <details key={kitchen.kitchenId} className="reports-detail">
                <summary>
                  <span>{kitchen.kitchenName}</span>

                  <strong
                    className={kitchen.remaining < 0 ? 'negative' : 'positive'}
                  >
                    {formatRupiah(kitchen.remaining)}
                  </strong>
                </summary>

                <div className="reports-detail-body">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>TANGGAL</th>
                        <th>RAB</th>
                        <th>SUPPLIER</th>
                        <th>OPS</th>
                        <th>TOTAL</th>
                      </tr>
                    </thead>

                    <tbody>
                      {report.daily.map((item) => (
                        <tr key={item.date}>
                          <td>{formatDate(item.date)}</td>
                          <td>{formatRupiah(item.income)}</td>
                          <td>{formatRupiah(item.expense)}</td>
                          <td>{formatRupiah(item.operational)}</td>
                          <td
                            className={
                              item.remaining < 0 ? 'negative' : 'positive'
                            }
                          >
                            {formatRupiah(item.remaining)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
        </>
      )}
    </section>
  )
}

function IncomeReportView() {
  const today = getTodayLocal()

  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)

  const [report, setReport] = useState<IncomeReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadReport() {
    setLoading(true)
    setError(null)

    try {
      const result = await getIncomeReport({
        startDate,
        endDate
      })

      setReport(result)
    } catch (error) {
      console.error(error)

      setError('Gagal memuat rekap pemasukan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialReport() {
      try {
        const result = await getIncomeReport({
          startDate,
          endDate
        })

        if (!cancelled) {
          setReport(result)
        }
      } catch (error) {
        console.error(error)

        if (!cancelled) {
          setError('Gagal memuat rekap pemasukan')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitialReport()

    return () => {
      cancelled = true
    }
  }, [startDate, endDate])

  return (
    <section className="reports-section">
      <div className="reports-filter-panel">
        <DateFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onApply={() => void loadReport()}
        />

        <button
          type="button"
          onClick={() => {
            if (!report) return

            void exportIncomeReport(report, startDate, endDate).catch(
              (error) => {
                console.error(error)
                setError('Gagal mengekspor rekap pemasukan')
              }
            )
          }}
          disabled={!report || loading}
        >
          Export Excel
        </button>
        <button
          type="button"
          onClick={() => printReport()}
          disabled={!report || loading}
        >
          Print
        </button>
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
            <>
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

                        <td>{formatRupiah(row.total)}</td>
                      </tr>
                    ))}

                    <tr className="reports-total-row">
                      <td colSpan={3}>GRAND TOTAL</td>

                      <td>{formatRupiah(report.grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {startDate !== endDate && (
                <div className="reports-detail-list">
                  {report.rows.map((row) => (
                    <details
                      key={`${row.supplierName}-${row.ownerName}-${row.bank}`}
                      className="reports-detail"
                    >
                      <summary>
                        <span>
                          <strong>{row.supplierName}</strong>

                          {' • '}

                          {row.ownerName}

                          {' • '}

                          {row.bank}
                        </span>

                        <strong>{formatRupiah(row.total)}</strong>
                      </summary>

                      <div className="reports-detail-body">
                        <table className="reports-table">
                          <thead>
                            <tr>
                              <th>TANGGAL</th>
                              <th>TOTAL</th>
                            </tr>
                          </thead>

                          <tbody>
                            {Object.entries(row.dates)
                              .sort(([a], [b]) => b.localeCompare(a))
                              .map(([date, amount]) => (
                                <tr key={date}>
                                  <td>{formatDate(date)}</td>

                                  <td>{formatRupiah(amount)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

function SupplierReportView({
  kitchens,
  selectedKitchen,
  onKitchenChange
}: {
  kitchens: ReportKitchen[]
  selectedKitchen: string
  onKitchenChange: (value: string) => void
}) {
  const initialDates = useState(() => {
    const today = getTodayLocal()

    return {
      startDate: today,
      endDate: today
    }
  })[0]

  const [startDate, setStartDate] = useState(initialDates.startDate)
  const [endDate, setEndDate] = useState(initialDates.endDate)

  const [report, setReport] = useState<SupplierReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectedKitchenName = kitchens.find(
    (kitchen) => kitchen.id === selectedKitchen
  )?.name

  async function loadReport() {
    setLoading(true)
    setError(null)

    try {
      const result = await getSupplierReport({
        startDate,
        endDate,
        kitchenId: selectedKitchen
      })

      setReport(result)
    } catch (error) {
      console.error(error)

      setError('Gagal memuat rekap pengeluaran')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const timer = window.setTimeout(() => {
      void getSupplierReport({
        startDate: initialDates.startDate,
        endDate: initialDates.endDate,
        kitchenId: selectedKitchen
      })
        .then((result) => {
          if (!cancelled) {
            setReport(result)
          }
        })
        .catch((error) => {
          console.error(error)

          if (!cancelled) {
            setError('Gagal memuat rekap pengeluaran')
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false)
          }
        })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [selectedKitchen, initialDates])

  return (
    <section className="reports-section">
      <div className="reports-filter-panel">
        <DateFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onApply={() => void loadReport()}
        />

        <KitchenFilter
          kitchens={kitchens}
          value={selectedKitchen}
          onChange={onKitchenChange}
        />

        <button
          type="button"
          onClick={() => {
            if (!report) return

            void exportSupplierReport(
              report,
              startDate,
              endDate,
              selectedKitchenName
            ).catch((error) => {
              console.error(error)
              setError('Gagal mengekspor rekap pengeluaran')
            })
          }}
          disabled={!report || loading}
        >
          Export Excel
        </button>
        <button
          type="button"
          onClick={() => printReport()}
          disabled={!report || loading}
        >
          Print
        </button>
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

                      <td>{formatRupiah(row.Arutala)}</td>

                      <td>{formatRupiah(row.Sukalarang)}</td>

                      <td>{formatRupiah(row.Aris)}</td>

                      <td>{formatRupiah(row.Babinsa)}</td>

                      <td>{formatRupiah(row.Operational)}</td>

                      <td>{formatRupiah(row.Total)}</td>
                    </tr>
                  ))}

                  <tr className="reports-total-row">
                    <td>GRAND TOTAL</td>

                    <td>{formatRupiah(report.totals.Arutala)}</td>

                    <td>{formatRupiah(report.totals.Sukalarang)}</td>

                    <td>{formatRupiah(report.totals.Aris)}</td>

                    <td>{formatRupiah(report.totals.Babinsa)}</td>

                    <td>{formatRupiah(report.totals.Operational)}</td>

                    <td>{formatRupiah(report.totals.Total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {startDate !== endDate &&
            report.dailyRows.map((day) => (
              <details key={day.date} className="reports-detail">
                <summary>
                  <span>Detail Pengeluaran • {formatDate(day.date)}</span>

                  <span>▶</span>
                </summary>

                <div className="reports-detail-body">
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
                      {day.kitchens.map((row) => (
                        <tr key={row.kitchenName}>
                          <td>{row.kitchenName}</td>

                          <td>{formatRupiah(row.Arutala)}</td>

                          <td>{formatRupiah(row.Sukalarang)}</td>

                          <td>{formatRupiah(row.Aris)}</td>

                          <td>{formatRupiah(row.Babinsa)}</td>

                          <td>{formatRupiah(row.Operational)}</td>

                          <td>{formatRupiah(row.Total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
        </>
      )}
    </section>
  )
}

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('overall')

  const [kitchens, setKitchens] = useState<ReportKitchen[]>([])
  const [selectedKitchen, setSelectedKitchen] = useState('')

  useEffect(() => {
    let active = true

    getActiveKitchens()
      .then((data) => {
        if (!active) return

        setKitchens(data)
      })
      .catch((error) => {
        console.error(error)
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <main className="reports-page">
      <header className="reports-header">
        <div>
          <h1>Laporan & Rekap</h1>

          <p>Rekap transaksi berdasarkan periode dan dapur.</p>
        </div>
      </header>

      <nav className="reports-tabs">
        <button
          type="button"
          className={tab === 'overall' ? 'active' : ''}
          onClick={() => setTab('overall')}
        >
          Laporan Keseluruhan
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

      {tab === 'overall' && (
        <OverallReportView
          kitchens={kitchens}
          selectedKitchen={selectedKitchen}
          onKitchenChange={setSelectedKitchen}
        />
      )}

      {tab === 'income' && <IncomeReportView />}

      {tab === 'supplier' && (
        <SupplierReportView
          kitchens={kitchens}
          selectedKitchen={selectedKitchen}
          onKitchenChange={setSelectedKitchen}
        />
      )}
    </main>
  )
}
