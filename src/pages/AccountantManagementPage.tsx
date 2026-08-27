import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  X
} from 'lucide-react'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import {
  createAccountant,
  deactivateAccountant,
  deleteAccountant,
  getAccountants,
  setAccountantPassword,
  updateAccountant
} from '@/features/admin/admin-accountants-service'
import type {
  AccountantFormInput,
  AccountantRecord
} from '@/features/admin/admin-accountants-types'
import { getActiveKitchens } from '@/features/kitchen/kitchen-service'
import type { Kitchen } from '@/features/kitchen/kitchen-types'

const EMPTY_FORM: AccountantFormInput = {
  email: '',
  password: '',
  name: '',
  kitchenId: '',
  operationalAccountName: '',
  operationalBank: '',
  operationalAccountNumber: ''
}

export function AccountantManagementPage() {
  const { user } = useAuth()
  const { success, error: toastError } = useToast()
  const canManage = canAccess(user?.role, 'accountant.manage')

  const [accountants, setAccountants] = useState<AccountantRecord[]>([])
  const [kitchens, setKitchens] = useState<Pick<Kitchen, 'id' | 'name'>[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<AccountantRecord | null>(null)
  const [form, setForm] = useState<AccountantFormInput>(EMPTY_FORM)
  const [passwordUser, setPasswordUser] = useState<AccountantRecord | null>(
    null
  )
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true)
      try {
        const [accountantData, kitchenData] = await Promise.all([
          getAccountants(),
          getActiveKitchens()
        ])
        setAccountants(accountantData)
        setKitchens(kitchenData)
      } catch (error) {
        console.error(error)
        toastError(
          'Gagal memuat manajemen akuntan',
          error instanceof Error ? error.message : 'Data gagal dimuat.'
        )
      } finally {
        if (showLoading) setLoading(false)
      }
    },
    [toastError]
  )

  useEffect(() => {
    if (!canManage) {
      return
    }

    let cancelled = false

    const loadInitialData = async () => {
      try {
        const [accountantData, kitchenData] = await Promise.all([
          getAccountants(),
          getActiveKitchens()
        ])

        if (cancelled) return

        setAccountants(accountantData)
        setKitchens(kitchenData)
        setLoading(false)
      } catch (error) {
        if (cancelled) return

        console.error(error)
        toastError(
          'Gagal memuat manajemen akuntan',
          error instanceof Error ? error.message : 'Data gagal dimuat.'
        )
        setLoading(false)
      }
    }

    void loadInitialData()

    return () => {
      cancelled = true
    }
  }, [canManage, toastError])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return accountants
    return accountants.filter((accountant) =>
      [
        accountant.name,
        accountant.email,
        accountant.kitchenName,
        accountant.operationalAccount?.name,
        accountant.operationalAccount?.bank,
        accountant.operationalAccount?.accountNumber
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    )
  }, [accountants, search])

  const assignedKitchenIds = useMemo(
    () =>
      new Set(
        accountants
          .filter(
            (accountant) =>
              accountant.active &&
              accountant.id !== editing?.id &&
              accountant.kitchenId
          )
          .map((accountant) => accountant.kitchenId as string)
      ),
    [accountants, editing?.id]
  )

  if (!canManage) return <div className="app-access-denied">Akses ditolak.</div>

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setPasswordConfirmation('')
    setEditorOpen(true)
  }

  function openEdit(accountant: AccountantRecord) {
    setEditing(accountant)
    setForm({
      email: accountant.email,
      name: accountant.name,
      kitchenId: accountant.kitchenId ?? '',
      operationalAccountName: accountant.operationalAccount?.name ?? '',
      operationalBank: accountant.operationalAccount?.bank ?? '',
      operationalAccountNumber:
        accountant.operationalAccount?.accountNumber ?? ''
    })
    setEditorOpen(true)
  }

  function closeEditor() {
    if (saving) return
    setEditorOpen(false)
    setEditing(null)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const normalized = {
        email: form.email.trim().toLowerCase(),
        password: form.password?.trim() ?? '',
        name: form.name.trim(),
        kitchenId: form.kitchenId,
        operationalAccountName: form.operationalAccountName.trim(),
        operationalBank: form.operationalBank.trim().toUpperCase(),
        operationalAccountNumber: form.operationalAccountNumber.trim()
      }

      if (!normalized.email || !normalized.name || !normalized.kitchenId) {
        throw new Error('Nama, email, dan dapur wajib diisi.')
      }
      if (
        !normalized.operationalAccountName ||
        !normalized.operationalBank ||
        !normalized.operationalAccountNumber
      ) {
        throw new Error('Rekening Biaya Operasional wajib diisi.')
      }
      if (!editing && normalized.password.length < 8) {
        throw new Error('Password awal minimal 8 karakter.')
      }
      if (assignedKitchenIds.has(normalized.kitchenId)) {
        throw new Error('Dapur tersebut sudah memiliki akuntan aktif.')
      }

      if (editing) {
        await updateAccountant(editing.id, {
          email: normalized.email,
          name: normalized.name,
          kitchenId: normalized.kitchenId,
          operationalAccountName: normalized.operationalAccountName,
          operationalBank: normalized.operationalBank,
          operationalAccountNumber: normalized.operationalAccountNumber
        })
        success('Akuntan diperbarui', 'Data akuntan berhasil diperbarui.')
      } else {
        await createAccountant(normalized)
        success('Akuntan ditambahkan', 'Akun akuntan berhasil dibuat.')
      }

      closeEditor()
      await load(false)
    } catch (error) {
      console.error(error)
      toastError(
        'Gagal menyimpan akuntan',
        error instanceof Error ? error.message : 'Data akuntan gagal disimpan.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(accountant: AccountantRecord) {
    if (saving) return

    if (!accountant.active) {
      openEdit(accountant)
      return
    }

    if (
      !window.confirm(
        `Nonaktifkan ${accountant.email}? Assignment dapur akan dilepas dan akun tidak akan bisa memakai Portal Akuntan sampai ditugaskan kembali.`
      )
    ) {
      return
    }

    try {
      await deactivateAccountant(accountant.id)
      success('Akuntan dinonaktifkan', 'Assignment dapur berhasil dilepas.')
      await load(false)
    } catch (error) {
      console.error(error)
      toastError(
        'Gagal menonaktifkan akuntan',
        error instanceof Error ? error.message : 'Status akuntan gagal diubah.'
      )
    }
  }

  async function hardDelete(accountant: AccountantRecord) {
    if (saving) return
    if (
      !window.confirm(
        `Hapus permanen ${accountant.email}? Sistem hanya mengizinkan ini jika akun tidak memiliki histori.`
      )
    ) {
      return
    }

    try {
      await deleteAccountant(accountant.id)
      success('Akuntan dihapus', 'Akun Auth berhasil dihapus.')
      await load(false)
    } catch (error) {
      console.error(error)
      toastError(
        'Akun tidak dapat dihapus',
        error instanceof Error ? error.message : 'Akun tidak dapat dihapus.'
      )
    }
  }

  async function changePassword() {
    const nextPassword = password.trim()
    if (!passwordUser || nextPassword.length < 8) return

    try {
      setSaving(true)
      await setAccountantPassword(passwordUser.id, nextPassword)
      success('Password diperbarui', 'Password akun berhasil diganti.')
      setPassword('')
      setPasswordConfirmation('')
      setPasswordUser(null)
    } catch (error) {
      console.error(error)
      toastError(
        'Gagal mengganti password',
        error instanceof Error ? error.message : 'Password gagal diganti.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="accountant-admin-page">
      <section className="accountant-admin-card">
        <header className="accountant-admin-header">
          <div>
            <span className="accountant-admin-kicker">ADMIN</span>
            <h2>Manajemen Akuntan</h2>
            <p>
              Kelola akun Portal Akuntan, assignment dapur, dan rekening Biaya
              Operasional.
            </p>
          </div>
          <button
            type="button"
            className="app-action-button"
            onClick={openCreate}
          >
            <Plus aria-hidden="true" />
            <span>Tambah Akuntan</span>
          </button>
        </header>

        <div className="accountant-admin-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama, email, dapur, atau rekening..."
            aria-label="Cari akuntan"
          />
          <button
            type="button"
            className="app-action-button app-action-button--secondary app-action-button--icon"
            onClick={() => void load(false)}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw aria-hidden="true" />
          </button>
          <span>{filtered.length} akun</span>
        </div>

        <div className="accountant-admin-table-wrap">
          {loading ? (
            <div className="accountant-admin-empty">Memuat data akuntan...</div>
          ) : !filtered.length ? (
            <div className="accountant-admin-empty">
              Belum ada akun akuntan.
            </div>
          ) : (
            <table className="accountant-admin-table">
              <thead>
                <tr>
                  <th>Akuntan</th>
                  <th>Dapur</th>
                  <th>Rekening Operasional</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((accountant) => (
                  <tr key={accountant.id}>
                    <td>
                      <strong>{accountant.name}</strong>
                      <span>{accountant.email}</span>
                    </td>
                    <td>{accountant.kitchenName ?? 'Belum ditugaskan'}</td>
                    <td>
                      {accountant.operationalAccount ? (
                        <>
                          <strong>{accountant.operationalAccount.name}</strong>
                          <span>
                            {accountant.operationalAccount.bank} —{' '}
                            {accountant.operationalAccount.accountNumber ?? '-'}
                          </span>
                        </>
                      ) : (
                        'Belum ada mapping'
                      )}
                    </td>
                    <td>
                      <span
                        className={`accountant-admin-badge ${
                          accountant.active ? 'is-active' : 'is-inactive'
                        }`}
                      >
                        {accountant.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td>
                      <div className="accountant-admin-actions">
                        <button
                          type="button"
                          className="app-action-button app-action-button--secondary app-action-button--icon"
                          onClick={() => openEdit(accountant)}
                          aria-label={`Edit ${accountant.email}`}
                          title="Edit"
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="app-action-button app-action-button--secondary app-action-button--icon"
                          onClick={() => {
                            setPasswordUser(accountant)
                            setPassword('')
                            setPasswordConfirmation('')
                          }}
                          aria-label={`Ganti password ${accountant.email}`}
                          title="Ganti password"
                        >
                          <KeyRound aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={`app-action-button app-action-button--icon ${
                            accountant.active
                              ? 'app-action-button--danger'
                              : 'app-action-button--secondary'
                          }`}
                          onClick={() => void toggleActive(accountant)}
                          aria-label={
                            accountant.active
                              ? `Nonaktifkan ${accountant.email}`
                              : `Aktifkan ${accountant.email}`
                          }
                          title={accountant.active ? 'Nonaktifkan' : 'Aktifkan'}
                        >
                          {accountant.active ? (
                            <UserMinus aria-hidden="true" />
                          ) : (
                            <UserCheck aria-hidden="true" />
                          )}
                        </button>
                        <button
                          type="button"
                          className="app-action-button app-action-button--danger app-action-button--icon"
                          onClick={() => void hardDelete(accountant)}
                          aria-label={`Hapus ${accountant.email}`}
                          title="Hapus permanen"
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {editorOpen ? (
        <div
          className="accountant-admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor()
          }}
        >
          <section
            className="accountant-admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accountant-admin-modal-title"
          >
            <header>
              <div>
                <span className="accountant-admin-kicker">AKUN AKUNTAN</span>
                <h3 id="accountant-admin-modal-title">
                  {editing ? 'Edit Akuntan' : 'Tambah Akuntan'}
                </h3>
              </div>
              <button
                type="button"
                className="app-action-button app-action-button--secondary app-action-button--icon"
                onClick={closeEditor}
                disabled={saving}
                aria-label="Tutup"
                title="Tutup"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="accountant-admin-form">
              <label>
                <span>Nama</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                  autoComplete="off"
                />
              </label>
              {!editing ? (
                <>
                  <label>
                    <span>Password awal</span>
                    <input
                      type="password"
                      value={form.password ?? ''}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          password: event.target.value
                        }))
                      }
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    <span>Konfirmasi password</span>
                    <input
                      type="password"
                      value={passwordConfirmation}
                      onChange={(event) =>
                        setPasswordConfirmation(event.target.value)
                      }
                      autoComplete="new-password"
                    />
                  </label>
                </>
              ) : null}
              <label>
                <span>Dapur</span>
                <select
                  value={form.kitchenId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      kitchenId: event.target.value
                    }))
                  }
                >
                  <option value="">Pilih dapur</option>
                  {kitchens.map((kitchen) => (
                    <option
                      key={kitchen.id}
                      value={kitchen.id}
                      disabled={assignedKitchenIds.has(kitchen.id)}
                    >
                      {kitchen.name}
                      {assignedKitchenIds.has(kitchen.id)
                        ? ' — sudah memiliki akuntan'
                        : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="accountant-admin-form-section">
                <div>
                  <strong>Rekening Biaya Operasional</strong>
                  <span>
                    Satu rekening operasional aktif untuk setiap dapur.
                  </span>
                </div>
                <label>
                  <span>Nama Pemilik</span>
                  <input
                    value={form.operationalAccountName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        operationalAccountName: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Bank</span>
                  <input
                    value={form.operationalBank}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        operationalBank: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Nomor Rekening</span>
                  <input
                    inputMode="numeric"
                    value={form.operationalAccountNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        operationalAccountNumber: event.target.value
                      }))
                    }
                  />
                </label>
              </div>

              <div className="accountant-admin-form-note">
                <ShieldCheck aria-hidden="true" />
                <span>
                  Password tetap dikelola Supabase Auth dan tidak disimpan di
                  database aplikasi.
                </span>
              </div>

              <footer>
                <button
                  type="button"
                  className="app-action-button app-action-button--secondary"
                  onClick={closeEditor}
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
                  <UserCheck aria-hidden="true" />
                  <span>{saving ? 'Menyimpan...' : 'Simpan'}</span>
                </button>
              </footer>
            </div>
          </section>
        </div>
      ) : null}

      {passwordUser ? (
        <div
          className="accountant-admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setPasswordUser(null)
              setPassword('')
              setPasswordConfirmation('')
            }
          }}
        >
          <section
            className="accountant-admin-modal accountant-admin-modal--password"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accountant-password-modal-title"
          >
            <header>
              <div>
                <span className="accountant-admin-kicker">KEAMANAN</span>
                <h3 id="accountant-password-modal-title">Ganti Password</h3>
                <p>{passwordUser.email}</p>
              </div>
              <button
                type="button"
                className="app-action-button app-action-button--secondary app-action-button--icon"
                onClick={() => {
                  if (!saving) {
                    setPasswordUser(null)
                    setPassword('')
                    setPasswordConfirmation('')
                  }
                }}
                disabled={saving}
                aria-label="Tutup"
                title="Tutup"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="accountant-admin-form">
              <label>
                <span>Password baru</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Minimal 8 karakter"
                />
              </label>
              <div className="accountant-admin-form-note">
                <KeyRound aria-hidden="true" />
                <span>
                  Admin tidak dapat melihat password lama. Password baru
                  langsung diterapkan ke akun tersebut.
                </span>
              </div>
              <footer>
                <button
                  type="button"
                  className="app-action-button app-action-button--secondary"
                  onClick={() => {
                    if (!saving) {
                      setPasswordUser(null)
                      setPassword('')
                    }
                  }}
                  disabled={saving}
                >
                  <X aria-hidden="true" />
                  <span>Batal</span>
                </button>
                <button
                  type="button"
                  className="app-action-button"
                  onClick={() => void changePassword()}
                  disabled={
                    saving ||
                    password.trim().length < 8 ||
                    password !== passwordConfirmation
                  }
                >
                  <KeyRound aria-hidden="true" />
                  <span>{saving ? 'Menyimpan...' : 'Ganti Password'}</span>
                </button>
              </footer>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
