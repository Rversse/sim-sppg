import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import { supabase } from '@/lib/supabase'
import { SingleDatePicker } from '@/components/ui/date-picker'
import { AnimatedSelect } from '@/components/ui/animated-select'
import { DAILY_DISBURSEMENT_START_DATE } from '@/lib/app-config'
import { getTodayLocal } from '@/lib/formatters'
import {
  DISBURSEMENT_ITEMS,
  getDailyDisbursementKitchens,
  getDailyDisbursementRows,
  getDisbursementProgressClass,
  saveDisbursementCheckbox,
  summarizeDisbursementRows,
  type DailyDisbursementRow,
  type DisbursementField
} from '@/features/disbursement/disbursement-service'

export function DisbursementPage() {
  const { user } = useAuth()
  const { error: toastError } = useToast()
  const canView = canAccess(user?.role, 'disbursement.view')

  const today = getTodayLocal()
  const initialDate =
    today < DAILY_DISBURSEMENT_START_DATE
      ? DAILY_DISBURSEMENT_START_DATE
      : today

  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedKitchenId, setSelectedKitchenId] = useState('')
  const [kitchens, setKitchens] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [rows, setRows] = useState<DailyDisbursementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
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

  const summary = useMemo(() => summarizeDisbursementRows(rows), [rows])

  const loadData = useCallback(async () => {
    setLoading(true)

    try {
      const [nextRows, nextKitchens] = await Promise.all([
        getDailyDisbursementRows(selectedDate, selectedKitchenId),
        kitchens.length
          ? Promise.resolve(kitchens)
          : getDailyDisbursementKitchens()
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
  }, [kitchens, selectedDate, selectedKitchenId])

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
      .channel(`daily-checklist-${selectedDate}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'disbursement_checklists'
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
    row: DailyDisbursementRow,
    field: DisbursementField,
    value: boolean
  ) {
    if (savingKey) return

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

        const completed = DISBURSEMENT_ITEMS.filter(
          ({ key: itemKey }) => nextChecklist[itemKey]
        ).length

        return {
          ...item,
          checklist: nextChecklist,
          progress: Math.round(
            (completed / DISBURSEMENT_ITEMS.length) * 100
          )
        }
      })
    )

    try {
      await saveDisbursementCheckbox(
        row.kitchen.id,
        selectedDate,
        field,
        value
      )
    } catch (saveError: unknown) {
      console.error(saveError)

      try {
        await loadData()
      } catch (reloadError) {
        console.error(reloadError)
      }

      const message =
        saveError instanceof Error
          ? saveError.message
          : 'Gagal menyimpan checklist pencairan harian.'

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
      <section className="disbursement-toolbar">
        <div className="disbursement-toolbar-field disbursement-toolbar-date">
          <SingleDatePicker
            label="Tanggal"
            value={selectedDate}
            minDate={DAILY_DISBURSEMENT_START_DATE}
            maxDate={today}
            onChange={setSelectedDate}
          />
        </div>

        <div className="disbursement-toolbar-field disbursement-toolbar-kitchen">
          <AnimatedSelect
            label="Dapur"
            value={selectedKitchenId}
            options={kitchenOptions}
            onChange={setSelectedKitchenId}
          />
        </div>

        <div className="disbursement-toolbar-progress">
          <div className="disbursement-toolbar-progress-heading">
            <span>Progress Checklist</span>
            <strong>{summary.overallProgress}%</strong>
          </div>

          <div className="disbursement-toolbar-progress-cards">
            <span className="is-danger" title="Dapur yang belum memulai checklist">
              <b>{summary.notStartedCount}</b>
              <small>Belum Mulai</small>
            </span>

            <span className="is-warning" title="Dapur yang checklist-nya masih berjalan">
              <b>{summary.inProgressCount}</b>
              <small>Berjalan</small>
            </span>

            <span className="is-success" title="Dapur yang seluruh checklist-nya selesai">
              <b>{summary.completedKitchens}</b>
              <small>Selesai</small>
            </span>
          </div>
        </div>

        <button
          type="button"
          className="disbursement-refresh-button"
          onClick={() => void loadData()}
          disabled={loading}
        >
          <RefreshCw
            aria-hidden="true"
            className={loading ? 'is-spinning' : ''}
          />
          Segarkan
        </button>
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
          aria-label="Memuat checklist harian"
        >
          <div className="disbursement-skeleton disbursement-skeleton-summary" />
          <div className="disbursement-skeleton" />
          <div className="disbursement-skeleton" />
          <div className="disbursement-skeleton" />
        </section>
      ) : (
        <>
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
                Tidak ada dapur yang masuk checklist pada tanggal ini.
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
                                  disabled={Boolean(savingKey)}
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
