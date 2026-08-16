import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react'

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
    const result = keyword
      ? kitchens.filter((kitchen) =>
          [kitchen.name, kitchen.pic, kitchen.foundation, kitchen.address]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword))
        )
      : kitchens

    return [...result].sort((a, b) =>
      a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
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
    if (saving) return
    setIsFormOpen(false)
    setEditingId(null)
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
      toastError(
        'Gagal menyimpan dapur',
        err instanceof Error ? err.message : 'Gagal menyimpan data dapur.'
      )
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
      toastError(
        'Gagal menghapus dapur',
        err instanceof Error ? err.message : 'Gagal menghapus data dapur.'
      )
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

        {canManage ? (
          <button type="button" className="app-action-button" onClick={openAdd}>
            <Plus aria-hidden="true" />
            <span>Tambah Dapur</span>
          </button>
        ) : null}
      </div>

      <div className="kitchen-toolbar">
        <input
          className="kitchen-input kitchen-control-grow"
          placeholder="Cari dapur..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
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
                {canManage ? (
                  <th className="kitchen-action-column">Aksi</th>
                ) : null}
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
                      className={`kitchen-badge ${
                        kitchen.is_active
                          ? 'kitchen-badge-active'
                          : 'kitchen-badge-off'
                      }`}
                    >
                      {kitchen.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  {canManage ? (
                    <td className="kitchen-action-cell">
                      <div className="app-action-row">
                        <button
                          type="button"
                          className="app-action-button app-action-button--icon app-action-button--secondary"
                          onClick={() => openEdit(kitchen)}
                          aria-label={`Edit ${kitchen.name}`}
                          title={`Edit ${kitchen.name}`}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="app-action-button app-action-button--icon app-action-button--danger"
                          onClick={() => void remove(kitchen)}
                          aria-label={`Hapus ${kitchen.name}`}
                          title={`Hapus ${kitchen.name}`}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canManage && isFormOpen ? (
        <div
          className="kitchen-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm()
          }}
        >
          <section
            className="kitchen-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kitchen-modal-title"
          >
            <div className="kitchen-modal-head">
              <h2 id="kitchen-modal-title">
                {editingId ? 'Edit Dapur' : 'Tambah Dapur'}
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

            <div className="kitchen-modal-body">
              <div className="kitchen-form-grid">
                <div className="kitchen-field kitchen-full">
                  <label htmlFor="kitchen-name">Nama Dapur</label>
                  <input
                    id="kitchen-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="kitchen-field">
                  <label htmlFor="kitchen-foundation">Yayasan</label>
                  <input
                    id="kitchen-foundation"
                    value={form.foundation}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        foundation: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="kitchen-field">
                  <label htmlFor="kitchen-pic">Perwakilan Yayasan</label>
                  <input
                    id="kitchen-pic"
                    value={form.pic}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        pic: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="kitchen-field kitchen-full">
                  <label htmlFor="kitchen-address">Alamat</label>
                  <input
                    id="kitchen-address"
                    value={form.address}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        address: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="kitchen-field">
                  <label htmlFor="kitchen-status">Status</label>
                  <select
                    id="kitchen-status"
                    value={String(form.is_active)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        is_active: event.target.value === 'true'
                      }))
                    }
                  >
                    <option value="true">Aktif</option>
                    <option value="false">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="kitchen-modal-actions">
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
