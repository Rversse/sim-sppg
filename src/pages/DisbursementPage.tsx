import { useCallback, useEffect, useMemo, useState } from 'react'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import {
  calculateDisbursementProgress,
  DISBURSEMENT_ITEMS,
  getDisbursementProgressClass,
  getDisbursementRows,
  getNearestFriday,
  isDisbursementLocked,
  saveDisbursementCheckbox,
  summarizeDisbursementRows,
  type DisbursementField,
  type DisbursementRow
} from '@/features/disbursement/disbursement-service'

import { formatDateLong } from '@/lib/formatters'
import { supabase } from '@/lib/supabase'

const DISBURSEMENT_DATE_KEY = 'disbursement_selected_date'

export function DisbursementPage() {
  const { user } = useAuth()
  const { error: toastError } = useToast()
  const canView = canAccess(user?.role, 'disbursement.view')

  const [selectedDate, setSelectedDate] = useState(() => {
    return localStorage.getItem(DISBURSEMENT_DATE_KEY) ?? getNearestFriday()
  })
  const [rows, setRows] = useState<DisbursementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState('')

  const locked = useMemo(
    () => isDisbursementLocked(selectedDate),
    [selectedDate]
  )

  useEffect(() => {
    localStorage.setItem(DISBURSEMENT_DATE_KEY, selectedDate)
  }, [selectedDate])

  useEffect(() => {
    let cancelled = false

    void getDisbursementRows(selectedDate)
      .then((data) => {
        if (cancelled) return

        setRows(data)
        setError('')
      })
      .catch((err: unknown) => {
        if (cancelled) return

        console.error(err)
        const message =
          err instanceof Error ? err.message : 'Gagal memuat data pencairan.'

        setError(message)
      })
      .finally(() => {
        if (cancelled) return

        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedDate])

  const summary = useMemo(() => summarizeDisbursementRows(rows), [rows])

  function handleDateChange(value: string) {
    setLoading(true)
    setRows([])
    setError('')
    setSelectedDate(value)
  }

  const reloadCurrentDate = useCallback(async () => {
    const data = await getDisbursementRows(selectedDate)
    setRows(data)
  }, [selectedDate])

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

        void reloadCurrentDate()
          .catch((err: unknown) => {
            console.error(
              'Gagal memperbarui checklist pencairan dari Realtime:',
              err
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
      .channel('disbursement-checklist-live')
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
      .subscribe((status) => {
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          console.warn(`[Disbursement Realtime] ${status}`)
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
  }, [reloadCurrentDate])

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
              checklist_date: selectedDate,
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
      await saveDisbursementCheckbox(row.kitchen.id, selectedDate, field, value)
    } catch (err: unknown) {
      console.error(err)

      try {
        await reloadCurrentDate()
      } catch (reloadError) {
        console.error(reloadError)
      }

      const message =
        err instanceof Error
          ? err.message
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
        <div className="disbursement-date-card">
          <label>
            <span>Tanggal Pencairan</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => handleDateChange(event.target.value)}
            />
          </label>
          <strong>{formatDateLong(selectedDate)}</strong>
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
          aria-label="Memuat data pencairan"
        >
          <div className="disbursement-skeleton disbursement-skeleton-summary" />
          <div className="disbursement-skeleton" />
          <div className="disbursement-skeleton" />
          <div className="disbursement-skeleton" />
          <div className="disbursement-skeleton" />
        </section>
      ) : (
        <>
          <section className="disbursement-summary-card">
            <div className="disbursement-summary-main">
              <strong>
                {summary.completedKitchens} / {summary.totalKitchens} Dapur
                Selesai
              </strong>
              <span>Progress: {summary.overallProgress}%</span>
            </div>

            <div className="disbursement-status-summary">
              <span className="is-danger">
                <b>{summary.notStartedCount}</b>
                Belum Mulai
              </span>
              <span className="is-warning">
                <b>{summary.inProgressCount}</b>
                Berjalan
              </span>
              <span className="is-success">
                <b>{summary.completedKitchens}</b>
                Selesai
              </span>
            </div>

            <div
              className="disbursement-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summary.overallProgress}
              aria-label="Progress pencairan keseluruhan"
            >
              <span style={{ width: `${summary.overallProgress}%` }} />
            </div>

            {locked ? (
              <div className="disbursement-lock">
                🔒 Data terkunci karena tanggal pencairan sudah lebih dari 7
                hari.
              </div>
            ) : null}
          </section>

          <section className="disbursement-panel">
            <div className="disbursement-panel-header">
              <div>
                <h2>Checklist Dapur</h2>
                <p>
                  {locked
                    ? 'Checklist sudah terkunci dan hanya dapat dilihat.'
                    : 'Perubahan tersimpan otomatis saat checkbox diubah.'}
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
