import { useEffect, useMemo, useState } from 'react'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import {
  createKitchen,
  deleteKitchen,
  getKitchens,
  updateKitchen
} from '@/features/kitchen/kitchen-service'
import type { Kitchen, KitchenInput } from '@/features/kitchen/kitchen-types'

const EMPTY_INPUT: KitchenInput = {
  name: '',
  pic: '',
  foundation: '',
  address: '',
  is_active: true
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

export function KitchenPage() {
  const { user } = useAuth()
  const { success, error: toastError } = useToast()
  const canView = canAccess(user?.role, 'kitchen.view')
  const canManage = canAccess(user?.role, 'kitchen.manage')
  const [kitchens, setKitchens] = useState<Kitchen[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<KitchenInput>(EMPTY_INPUT)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setKitchens(await getKitchens())
    } catch (err) {
      console.error(err)
      setError('Gagal memuat data dapur.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canView) return
    let cancelled = false
    void getKitchens()
      .then((data) => {
        if (!cancelled) {
          setKitchens(data)
          setError('')
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err)
          setError('Gagal memuat data dapur.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [canView])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return kitchens
    return kitchens.filter((kitchen) =>
      [kitchen.name, kitchen.pic, kitchen.foundation, kitchen.address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    )
  }, [kitchens, search])

  if (!canView) return <div className="app-access-denied">Akses ditolak.</div>

  function openAdd() {
    if (!canManage) return

    setEditingId(null)
    setForm({ ...EMPTY_INPUT })
    setIsFormOpen(true)
  }

  function openEdit(kitchen: Kitchen) {
    if (!canManage) return

    setEditingId(kitchen.id)
    setForm({
      name: kitchen.name,
      pic: kitchen.pic ?? '',
      foundation: kitchen.foundation ?? '',
      address: kitchen.address ?? '',
      is_active: kitchen.is_active
    })
    setIsFormOpen(true)
  }

  function closeForm() {
    if (!saving) {
      setIsFormOpen(false)
      setEditingId(null)
    }
  }

  async function save() {
    if (!canManage || saving) return
    setSaving(true)
    try {
      if (editingId) {
        await updateKitchen(editingId, form)
        success('Dapur diperbarui', 'Data dapur berhasil diperbarui.')
      } else {
        await createKitchen(form)
        success('Dapur ditambahkan', 'Data dapur berhasil ditambahkan.')
      }
      closeForm()
      await load()
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error ? err.message : 'Gagal menyimpan data dapur.'
      toastError('Gagal menyimpan dapur', message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(kitchen: Kitchen) {
    if (!canManage) return
    if (!window.confirm(`Hapus dapur "${kitchen.name}"?`)) return
    try {
      await deleteKitchen(kitchen.id)
      success('Dapur dihapus', 'Data dapur berhasil dihapus.')
      await load()
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error ? err.message : 'Gagal menghapus data dapur.'
      toastError('Gagal menghapus dapur', message)
    }
  }

  return (
    <div className="kitchen-page">
      <div className="kitchen-header">
        <div>
          <h1>Data Dapur</h1>
          <p>
            Master identitas dapur. Data kendaraan dikelola di modul terpisah.
          </p>
        </div>
        {canManage && (
          <button className="kitchen-button" onClick={openAdd}>
            + Tambah Dapur
          </button>
        )}
      </div>
      <div className="kitchen-toolbar">
        <input
          className="kitchen-input kitchen-control-grow"
          placeholder="Cari dapur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="kitchen-count">{filtered.length} dapur</span>
      </div>
      <div className="kitchen-panel">
        {loading ? (
          <div className="kitchen-empty">Memuat data dapur...</div>
        ) : error ? (
          <div className="kitchen-empty kitchen-state-error">{error}</div>
        ) : !filtered.length ? (
          <div className="kitchen-empty">Belum ada data dapur.</div>
        ) : (
          <table className="kitchen-table">
            <thead>
              <tr>
                <th>Dapur</th>
                <th>Yayasan</th>
                <th>Perwakilan</th>
                <th>Alamat</th>
                <th>Status</th>
                <th>Audit</th>
                {canManage && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((kitchen) => (
                <tr key={kitchen.id}>
                  <td>
                    <strong>{kitchen.name}</strong>
                  </td>
                  <td>{kitchen.foundation || '-'}</td>
                  <td>{kitchen.pic || '-'}</td>
                  <td>{kitchen.address || '-'}</td>
                  <td>
                    <span
                      className={`kitchen-badge ${kitchen.is_active ? 'kitchen-badge-active' : 'kitchen-badge-off'}`}
                    >
                      {kitchen.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="kitchen-audit">
                    Dibuat: {kitchen.created_by_name || '—'}
                    <br />
                    {formatDateTime(kitchen.created_at)}
                    <br />
                    Diubah: {kitchen.updated_by_name || '—'}
                    <br />
                    {formatDateTime(kitchen.updated_at)}
                  </td>
                  {canManage && (
                    <td>
                      <div className="kitchen-action-row">
                        <button
                          className="kitchen-button"
                          onClick={() => openEdit(kitchen)}
                        >
                          Edit
                        </button>
                        <button
                          className="kitchen-button kitchen-danger"
                          onClick={() => remove(kitchen)}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canManage && isFormOpen && (
        <div
          className="kitchen-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm()
          }}
        >
          <div className="kitchen-modal">
            <div className="kitchen-modal-head">
              <h2>{editingId ? 'Edit Dapur' : 'Tambah Dapur'}</h2>
              <button
                className="kitchen-button kitchen-secondary"
                onClick={closeForm}
              >
                Tutup
              </button>
            </div>
            <div className="kitchen-modal-body">
              <div className="kitchen-form-grid">
                <div className="kitchen-field kitchen-full">
                  <label>Nama Dapur</label>
                  <input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div className="kitchen-field">
                  <label>Yayasan</label>
                  <input
                    value={form.foundation}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, foundation: e.target.value }))
                    }
                  />
                </div>
                <div className="kitchen-field">
                  <label>Perwakilan Yayasan</label>
                  <input
                    value={form.pic}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, pic: e.target.value }))
                    }
                  />
                </div>
                <div className="kitchen-field kitchen-full">
                  <label>Alamat</label>
                  <input
                    value={form.address}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, address: e.target.value }))
                    }
                  />
                </div>
                <div className="kitchen-field">
                  <label>Status</label>
                  <select
                    value={String(form.is_active)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        is_active: e.target.value === 'true'
                      }))
                    }
                  >
                    <option value="true">Aktif</option>
                    <option value="false">Nonaktif</option>
                  </select>
                </div>
              </div>
              {editingId &&
                (() => {
                  const item = kitchens.find((k) => k.id === editingId)
                  return item ? (
                    <div className="kitchen-audit-box kitchen-audit">
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
              <div className="kitchen-modal-actions">
                <button
                  className="kitchen-button kitchen-secondary"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  className="kitchen-button"
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
