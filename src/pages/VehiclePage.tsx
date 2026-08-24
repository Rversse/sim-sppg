import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Pencil, Plus, Save, Trash2, X } from 'lucide-react'

import { canAccess } from '@/features/auth/role-policy'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import { getActiveKitchens } from '@/features/kitchen/kitchen-service'
import {
  createVehicle,
  deleteVehicle,
  getVehicles,
  updateVehicle
} from '@/features/vehicle/vehicle-service'
import type {
  Vehicle,
  VehicleInput,
  VehicleType
} from '@/features/vehicle/vehicle-types'

const EMPTY: VehicleInput = {
  kitchen_id: '',
  vehicle_type: '' as VehicleType,
  vehicle_name: '',
  plate_number: '',
  pkb_expiry: '',
  stnk_expiry: ''
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function daysUntil(value: string | null) {
  if (!value) return null
  const target = new Date(`${value}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function expiryLabel(value: string | null) {
  const days = daysUntil(value)

  if (days === null) {
    return { text: 'Belum diisi', className: 'expiry-neutral' }
  }

  if (days < 0) {
    return {
      text: `Lewat ${Math.abs(days)} hari`,
      className: 'expiry-danger'
    }
  }

  if (days <= 7) {
    return { text: `${days} hari lagi`, className: 'expiry-danger' }
  }

  if (days <= 30) {
    return { text: `${days} hari lagi`, className: 'expiry-warning' }
  }

  return { text: `${days} hari lagi`, className: 'expiry-ok' }
}

export function VehiclePage() {
  const { user } = useAuth()
  const { success, error: toastError } = useToast()
  const canView = canAccess(user?.role, 'vehicle.view')
  const canManage = canAccess(user?.role, 'vehicle.manage')

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [kitchens, setKitchens] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState('')
  const [kitchenFilter, setKitchenFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<VehicleInput>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    }

    setError('')

    try {
      const [vehicleData, kitchenData] = await Promise.all([
        getVehicles(),
        getActiveKitchens()
      ])

      setVehicles(vehicleData)
      setKitchens(kitchenData)
    } catch (err) {
      console.error(err)
      setError('Gagal memuat data kendaraan.')
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!canView) return

    let cancelled = false

    void Promise.all([getVehicles(), getActiveKitchens()])
      .then(([vehicleData, kitchenData]) => {
        if (!cancelled) {
          setVehicles(vehicleData)
          setKitchens(kitchenData)
          setError('')
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error(err)
          setError('Gagal memuat data kendaraan.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [canView])

  useEffect(() => {
    if (!canView) {
      return
    }

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

        void load(false)
          .catch((err: unknown) => {
            console.error('Gagal memperbarui kendaraan dari Realtime:', err)
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
      .channel(`vehicle-page-live-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kitchen_vehicles'
        },
        scheduleRealtimeRefresh
      )
      .subscribe((status) => {
        if (cancelled) return

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Vehicle Realtime] ${status}`)
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
  }, [canView, load])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    const result = vehicles.filter((vehicle) => {
      const matchesKitchen =
        !kitchenFilter || vehicle.kitchen_id === kitchenFilter

      const matchesSearch =
        !keyword ||
        [vehicle.kitchen?.name, vehicle.vehicle_name, vehicle.plate_number]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))

      return matchesKitchen && matchesSearch
    })

    return [...result].sort((a, b) => {
      const kitchen = (a.kitchen?.name ?? '').localeCompare(
        b.kitchen?.name ?? '',
        'id',
        { sensitivity: 'base' }
      )

      if (kitchen !== 0) return kitchen

      const vehicle = (a.vehicle_name ?? '').localeCompare(
        b.vehicle_name ?? '',
        'id',
        { sensitivity: 'base' }
      )

      if (vehicle !== 0) return vehicle

      return a.plate_number.localeCompare(b.plate_number, 'id', {
        sensitivity: 'base'
      })
    })
  }, [vehicles, search, kitchenFilter])

  const reminderCount = useMemo(
    () =>
      vehicles.filter(
        (vehicle) =>
          (daysUntil(vehicle.pkb_expiry) ?? 9999) <= 30 ||
          (daysUntil(vehicle.stnk_expiry) ?? 9999) <= 30
      ).length,
    [vehicles]
  )

  if (!canView) return <div className="app-access-denied">Akses ditolak.</div>

  function openAdd() {
    if (!canManage) return

    setEditingId(null)
    setForm({ ...EMPTY })
    setFormOpen(true)
  }

  function openEdit(vehicle: Vehicle) {
    if (!canManage) return

    setEditingId(vehicle.id)
    setForm({
      kitchen_id: vehicle.kitchen_id,
      vehicle_type: vehicle.vehicle_type,
      vehicle_name: vehicle.vehicle_name ?? '',
      plate_number: vehicle.plate_number,
      pkb_expiry: vehicle.pkb_expiry ?? '',
      stnk_expiry: vehicle.stnk_expiry ?? ''
    })
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return

    setFormOpen(false)
    setEditingId(null)
  }

  async function save() {
    if (!canManage || saving) return

    setSaving(true)

    try {
      if (editingId) {
        await updateVehicle(editingId, form)
        success('Kendaraan diperbarui', 'Data kendaraan berhasil diperbarui.')
      } else {
        await createVehicle(form)
        success('Kendaraan ditambahkan', 'Data kendaraan berhasil ditambahkan.')
      }

      closeForm()
      await load(false)
    } catch (err) {
      console.error(err)
      toastError(
        'Gagal menyimpan kendaraan',
        err instanceof Error ? err.message : 'Gagal menyimpan kendaraan.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function remove(vehicle: Vehicle) {
    if (!canManage) return

    if (
      !window.confirm(
        `Hapus kendaraan ${vehicle.vehicle_name || vehicle.plate_number}?`
      )
    ) {
      return
    }

    try {
      await deleteVehicle(vehicle.id)
      success('Kendaraan dihapus', 'Data kendaraan berhasil dihapus.')
      await load(false)
    } catch (err) {
      console.error(err)
      toastError(
        'Gagal menghapus kendaraan',
        err instanceof Error ? err.message : 'Gagal menghapus kendaraan.'
      )
    }
  }

  return (
    <div className="vehicle-page">
      <div className="vehicle-header">
        {canManage ? (
          <button type="button" className="app-action-button" onClick={openAdd}>
            <Plus aria-hidden="true" />
            <span>Tambah Kendaraan</span>
          </button>
        ) : null}
      </div>

      {reminderCount > 0 ? (
        <div className="vehicle-reminder">
          <Bell aria-hidden="true" />
          <span>
            <strong>{reminderCount} kendaraan</strong> memiliki PKB atau STNK
            yang jatuh tempo dalam 30 hari atau sudah lewat.
          </span>
        </div>
      ) : null}

      <div className="vehicle-toolbar">
        <input
          className="vehicle-input vehicle-control-grow"
          placeholder="Cari dapur, kendaraan, atau nomor polisi..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          className="vehicle-select"
          value={kitchenFilter}
          onChange={(event) => setKitchenFilter(event.target.value)}
        >
          <option value="">Semua Dapur</option>
          {kitchens
            .slice()
            .sort((a, b) =>
              a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
            )
            .map((kitchen) => (
              <option key={kitchen.id} value={kitchen.id}>
                {kitchen.name}
              </option>
            ))}
        </select>

        <span className="vehicle-count">{filtered.length} kendaraan</span>
      </div>

      <div className="vehicle-panel">
        {loading ? (
          <div className="vehicle-state">Memuat data kendaraan...</div>
        ) : error ? (
          <div className="vehicle-state vehicle-state-error">{error}</div>
        ) : !filtered.length ? (
          <div className="vehicle-state">Belum ada data kendaraan.</div>
        ) : (
          <table className="vehicle-table">
            <thead>
              <tr>
                <th>Dapur</th>
                <th>Jenis</th>
                <th>Kendaraan</th>
                <th>No. Polisi</th>
                <th>PKB</th>
                <th>STNK</th>
                {canManage ? (
                  <th className="vehicle-action-column">Aksi</th>
                ) : null}
              </tr>
            </thead>

            <tbody>
              {filtered.map((vehicle) => {
                const pkb = expiryLabel(vehicle.pkb_expiry)
                const stnk = expiryLabel(vehicle.stnk_expiry)

                return (
                  <tr key={vehicle.id}>
                    <td>
                      <strong>{vehicle.kitchen?.name || '—'}</strong>
                    </td>
                    <td>
                      {vehicle.vehicle_type === 'car' ? 'Mobil' : 'Motor'}
                    </td>
                    <td>{vehicle.vehicle_name || '—'}</td>
                    <td>
                      <strong>{vehicle.plate_number}</strong>
                    </td>
                    <td>
                      <div className="vehicle-expiry">
                        <span>{formatDate(vehicle.pkb_expiry)}</span>
                        <span className={pkb.className}>{pkb.text}</span>
                      </div>
                    </td>
                    <td>
                      <div className="vehicle-expiry">
                        <span>{formatDate(vehicle.stnk_expiry)}</span>
                        <span className={stnk.className}>{stnk.text}</span>
                      </div>
                    </td>

                    {canManage ? (
                      <td className="vehicle-action-cell">
                        <div className="app-action-row">
                          <button
                            type="button"
                            className="app-action-button app-action-button--icon app-action-button--secondary"
                            onClick={() => openEdit(vehicle)}
                            aria-label={`Edit ${vehicle.plate_number}`}
                            title={`Edit ${vehicle.plate_number}`}
                          >
                            <Pencil aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            className="app-action-button app-action-button--icon app-action-button--danger"
                            onClick={() => void remove(vehicle)}
                            aria-label={`Hapus ${vehicle.plate_number}`}
                            title={`Hapus ${vehicle.plate_number}`}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {canManage && formOpen ? (
        <div
          className="vehicle-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm()
          }}
        >
          <section
            className="vehicle-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vehicle-modal-title"
          >
            <div className="vehicle-modal-head">
              <h2 id="vehicle-modal-title">
                {editingId ? 'Edit Kendaraan' : 'Tambah Kendaraan'}
              </h2>

              <button
                type="button"
                className="app-action-button app-action-button--icon app-action-button--secondary"
                onClick={closeForm}
                disabled={saving}
                aria-label="Tutup"
                title="Tutup"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="vehicle-modal-body">
              <div className="vehicle-grid">
                <div className="vehicle-field">
                  <label htmlFor="vehicle-kitchen">Dapur</label>
                  <select
                    id="vehicle-kitchen"
                    value={form.kitchen_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        kitchen_id: event.target.value
                      }))
                    }
                  >
                    <option value="">Pilih dapur</option>
                    {kitchens.map((kitchen) => (
                      <option key={kitchen.id} value={kitchen.id}>
                        {kitchen.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="vehicle-field">
                  <label htmlFor="vehicle-type">Jenis Kendaraan</label>
                  <select
                    id="vehicle-type"
                    value={form.vehicle_type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        vehicle_type: event.target.value as VehicleType
                      }))
                    }
                  >
                    <option value="" disabled>
                      Pilih Kendaraan
                    </option>
                    <option value="car">Mobil</option>
                    <option value="motorcycle">Motor</option>
                  </select>
                </div>

                <div className="vehicle-field">
                  <label htmlFor="vehicle-name">Nama Kendaraan</label>
                  <input
                    id="vehicle-name"
                    value={form.vehicle_name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        vehicle_name: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="vehicle-field">
                  <label htmlFor="vehicle-plate">Nomor Polisi</label>
                  <input
                    id="vehicle-plate"
                    value={form.plate_number}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        plate_number: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="vehicle-field">
                  <label htmlFor="vehicle-stnk">Masa Berlaku STNK</label>
                  <input
                    id="vehicle-stnk"
                    type="date"
                    value={form.stnk_expiry}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        stnk_expiry: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="vehicle-field">
                  <label htmlFor="vehicle-pkb">Jatuh Tempo PKB</label>
                  <input
                    id="vehicle-pkb"
                    type="date"
                    value={form.pkb_expiry}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        pkb_expiry: event.target.value
                      }))
                    }
                  />
                </div>
              </div>

              <div className="vehicle-actions">
                <button
                  type="button"
                  className="app-action-button app-action-button--secondary"
                  onClick={closeForm}
                  disabled={saving}
                >
                  <X aria-hidden="true" />
                  <span>Batal</span>
                </button>

                <button
                  type="button"
                  className="app-action-button"
                  onClick={() => void save()}
                  disabled={saving}
                >
                  <Save aria-hidden="true" />
                  <span>{saving ? 'Menyimpan...' : 'Simpan'}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
