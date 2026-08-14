import { useEffect, useMemo, useState } from 'react'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
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
  vehicle_type: 'car',
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
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
  if (days === null) return { text: 'Belum diisi', className: 'expiry-neutral' }
  if (days < 0)
    return { text: `Lewat ${Math.abs(days)} hari`, className: 'expiry-danger' }
  if (days <= 7)
    return { text: `${days} hari lagi`, className: 'expiry-danger' }
  if (days <= 30)
    return { text: `${days} hari lagi`, className: 'expiry-warning' }
  return { text: `${days} hari lagi`, className: 'expiry-ok' }
}

export function VehiclePage() {
  const { user } = useAuth()
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

  async function load() {
    setLoading(true)
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
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canView) return
    let cancelled = false
    void Promise.all([getVehicles(), getActiveKitchens()])
      .then(([vehicleData, kitchenData]) => {
        if (!cancelled) {
          setVehicles(vehicleData)
          setKitchens(kitchenData)
          setLoading(false)
        }
      })
      .catch((err) => {
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

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return vehicles.filter((vehicle) => {
      const matchesKitchen =
        !kitchenFilter || vehicle.kitchen_id === kitchenFilter
      const matchesSearch =
        !keyword ||
        [vehicle.kitchen?.name, vehicle.vehicle_name, vehicle.plate_number]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      return matchesKitchen && matchesSearch
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
    if (!saving) {
      setFormOpen(false)
      setEditingId(null)
    }
  }

  async function save() {
    if (!canManage || saving) return
    setSaving(true)
    try {
      if (editingId) await updateVehicle(editingId, form)
      else await createVehicle(form)
      closeForm()
      await load()
    } catch (err) {
      console.error(err)
      window.alert(
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
    )
      return
    try {
      await deleteVehicle(vehicle.id)
      await load()
    } catch (err) {
      console.error(err)
      window.alert(
        err instanceof Error ? err.message : 'Gagal menghapus kendaraan.'
      )
    }
  }

  return (
    <div className="vehicle-page">
      <div className="vehicle-header">
        <div>
          <h1>Data Kendaraan</h1>
          <p>Master kendaraan per dapur dengan pemantauan PKB dan STNK.</p>
        </div>
        {canManage && (
          <button className="vehicle-button" onClick={openAdd}>
            + Tambah Kendaraan
          </button>
        )}
      </div>
      {reminderCount > 0 && (
        <div className="vehicle-reminder">
          🔔 <strong>{reminderCount} kendaraan</strong> memiliki PKB atau STNK
          yang jatuh tempo dalam 30 hari atau sudah lewat.
        </div>
      )}
      <div className="vehicle-toolbar">
        <input
          className="vehicle-input vehicle-control-grow"
          placeholder="Cari dapur, kendaraan, atau nomor polisi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="vehicle-select"
          value={kitchenFilter}
          onChange={(e) => setKitchenFilter(e.target.value)}
        >
          <option value="">Semua Dapur</option>
          {kitchens.map((kitchen) => (
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
                <th>Audit</th>
                {canManage && <th>Aksi</th>}
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
                    <td className="vehicle-audit">
                      Dibuat: {vehicle.created_by_name || '—'}
                      <br />
                      {formatDateTime(vehicle.created_at)}
                      <br />
                      Diubah: {vehicle.updated_by_name || '—'}
                      <br />
                      {formatDateTime(vehicle.updated_at)}
                    </td>
                    {canManage && (
                      <td>
                        <div className="vehicle-action-row">
                          <button
                            className="vehicle-button"
                            onClick={() => openEdit(vehicle)}
                          >
                            Edit
                          </button>
                          <button
                            className="vehicle-button vehicle-danger"
                            onClick={() => remove(vehicle)}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {canManage && formOpen && (
        <div
          className="vehicle-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm()
          }}
        >
          <div className="vehicle-modal">
            <div className="vehicle-modal-head">
              <h2>{editingId ? 'Edit Kendaraan' : 'Tambah Kendaraan'}</h2>
              <button
                className="vehicle-button vehicle-secondary"
                onClick={closeForm}
              >
                Tutup
              </button>
            </div>
            <div className="vehicle-modal-body">
              <div className="vehicle-grid">
                <div className="vehicle-field vehicle-full">
                  <label>Dapur</label>
                  <select
                    value={form.kitchen_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, kitchen_id: e.target.value }))
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
                  <label>Jenis Kendaraan</label>
                  <select
                    value={form.vehicle_type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        vehicle_type: e.target.value as VehicleType
                      }))
                    }
                  >
                    <option value="car">Mobil</option>
                    <option value="motorcycle">Motor</option>
                  </select>
                </div>
                <div className="vehicle-field">
                  <label>Nama Kendaraan</label>
                  <input
                    value={form.vehicle_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, vehicle_name: e.target.value }))
                    }
                  />
                </div>
                <div className="vehicle-field">
                  <label>Nomor Polisi</label>
                  <input
                    value={form.plate_number}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, plate_number: e.target.value }))
                    }
                  />
                </div>
                <div className="vehicle-field">
                  <label>Jatuh Tempo PKB</label>
                  <input
                    type="date"
                    value={form.pkb_expiry}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, pkb_expiry: e.target.value }))
                    }
                  />
                </div>
                <div className="vehicle-field">
                  <label>Masa Berlaku STNK</label>
                  <input
                    type="date"
                    value={form.stnk_expiry}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, stnk_expiry: e.target.value }))
                    }
                  />
                </div>
              </div>
              {editingId &&
                (() => {
                  const item = vehicles.find((v) => v.id === editingId)
                  return item ? (
                    <div className="vehicle-audit">
                      Terakhir diubah oleh{' '}
                      <strong>{item.updated_by_name || '—'}</strong> pada{' '}
                      {formatDateTime(item.updated_at)}.<br />
                      Dibuat oleh <strong>
                        {item.created_by_name || '—'}
                      </strong>{' '}
                      pada {formatDateTime(item.created_at)}.
                    </div>
                  ) : null
                })()}
              <div className="vehicle-actions">
                <button
                  className="vehicle-button vehicle-secondary"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  className="vehicle-button"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
