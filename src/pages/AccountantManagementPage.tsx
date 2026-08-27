import { useEffect, useMemo, useState } from 'react'
import {
  Eye,
  EyeOff,
  History,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  X
} from 'lucide-react'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import {
  createAccountant,
  deactivateAccountant,
  deleteAccountant,
  getAccountantHistory,
  getAccountants,
  setAccountantPassword,
  updateAccountant
} from '@/features/admin/admin-accountants-service'
import type {
  AccountantAssignmentHistoryRecord,
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

function titleCaseName(value: string) {
  const normalized = value.toLocaleLowerCase('id-ID')
  return normalized
    .split(/(\s+)/)
    .map((part) =>
      /^\s+$/.test(part)
        ? part
        : part.charAt(0).toLocaleUpperCase('id-ID') + part.slice(1)
    )
    .join('')
}

function sanitizeBank(value: string) {
  return value
    .toLocaleUpperCase('id-ID')
    .replace(/[^A-Z\s]/g, '')
    .replace(/\s+/g, ' ')
}

function sanitizeAccountNumber(value: string) {
  return value.replace(/\D/g, '')
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

function assignmentAccount(
  assignment: AccountantAssignmentHistoryRecord | null
) {
  if (!assignment?.operationalAccount) return 'Tidak ada snapshot rekening'
  const account = assignment.operationalAccount
  return `${account.name ?? '-'} — ${account.bank ?? '-'} — ${
    account.accountNumber ?? '-'
  }`
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
  const [replacementMode, setReplacementMode] = useState(false)
  const [form, setForm] = useState<AccountantFormInput>(EMPTY_FORM)

  const [passwordUser, setPasswordUser] =
    useState<AccountantRecord | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [createPasswordVisible, setCreatePasswordVisible] = useState(false)
  const [createConfirmationVisible, setCreateConfirmationVisible] =
    useState(false)

  const [historyUser, setHistoryUser] =
    useState<AccountantRecord | null>(null)
  const [historyRows, setHistoryRows] = useState<
    AccountantAssignmentHistoryRecord[]
  >([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!canManage) return

    let cancelled = false

    async function loadInitialData() {
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
        accountant.operationalAccount?.accountNumber,
        accountant.lastAssignment?.accountantName,
        accountant.lastAssignment?.accountantEmail,
        accountant.lastAssignment?.kitchenName
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

  if (!canManage) {
    return <div className="app-access-denied">Akses ditolak.</div>
  }

  async function load(showLoading = false) {
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
  }

  function openCreate() {
    setEditing(null)
    setReplacementMode(false)
    setForm({ ...EMPTY_FORM })
    setPasswordConfirmation('')
    setCreatePasswordVisible(false)
    setCreateConfirmationVisible(false)
    setEditorOpen(true)
  }

  function openReplacement(accountant: AccountantRecord) {
    setEditing(null)
    setReplacementMode(true)
    setForm({
      email: '',
      password: '',
      name: '',
      kitchenId: accountant.kitchenId ?? '',
      operationalAccountName:
        accountant.operationalAccount?.name ??
        accountant.lastAssignment?.operationalAccount?.name ??
        '',
      operationalBank:
        accountant.operationalAccount?.bank ??
        accountant.lastAssignment?.operationalAccount?.bank ??
        '',
      operationalAccountNumber:
        accountant.operationalAccount?.accountNumber ??
        accountant.lastAssignment?.operationalAccount?.accountNumber ??
        ''
    })
    setPasswordConfirmation('')
    setCreatePasswordVisible(false)
    setCreateConfirmationVisible(false)
    setEditorOpen(true)
  }

  function openEdit(accountant: AccountantRecord) {
    if (!accountant.active) return

    setEditing(accountant)
    setReplacementMode(false)
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
    setReplacementMode(false)
  }

  async function save() {
    if (saving) return
    setSaving(true)

    try {
      const normalized = {
        email: form.email.trim().toLowerCase(),
        password: form.password?.trim() ?? '',
        name: titleCaseName(form.name.trim()),
        kitchenId: form.kitchenId,
        operationalAccountName: titleCaseName(
          form.operationalAccountName.trim()
        ),
        operationalBank: sanitizeBank(form.operationalBank).trim(),
        operationalAccountNumber: sanitizeAccountNumber(
          form.operationalAccountNumber
        )
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

      if (!editing && normalized.password !== passwordConfirmation) {
        throw new Error('Konfirmasi password tidak cocok.')
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
        success(
          'Akuntan diperbarui',
          'Data akun dan mapping berhasil diperbarui.'
        )
      } else {
        await createAccountant(normalized)
        success(
          replacementMode ? 'Akuntan pengganti ditambahkan' : 'Akuntan ditambahkan',
          replacementMode
            ? 'Akun baru sekarang menjadi akuntan aktif untuk dapur tersebut.'
            : 'Akun akuntan berhasil dibuat.'
        )
      }

      closeEditor()
      await load()
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
      openReplacement(accountant)
      return
    }

    if (
      !window.confirm(
        `Nonaktifkan ${accountant.name}? Assignment ${accountant.kitchenName ?? ''} akan dilepas dan riwayat assignment akan disimpan.`
      )
    ) {
      return
    }

    try {
      await deactivateAccountant(accountant.id)
      success(
        'Akuntan dinonaktifkan',
        'Assignment dilepas dan riwayat akun disimpan.'
      )
      await load()
    } catch (error) {
      console.error(error)
      toastError(
        'Gagal menonaktifkan akuntan',
        error instanceof Error ? error.message : 'Status akun gagal diubah.'
      )
    }
  }

  async function hardDelete(accountant: AccountantRecord) {
    if (saving) return

    if (accountant.historyCount > 0) {
      toastError(
        'Akun tidak dapat dihapus',
        'Akun sudah memiliki riwayat assignment dan harus dipertahankan untuk audit.'
      )
      return
    }

    if (
      !window.confirm(
        `Hapus permanen ${accountant.email}? Ini hanya boleh untuk akun tanpa histori.`
      )
    ) {
      return
    }

    try {
      await deleteAccountant(accountant.id)
      success('Akuntan dihapus', 'Akun Auth berhasil dihapus.')
      await load()
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

    if (!passwordUser || nextPassword.length < 8) {
      toastError(
        'Password belum valid',
        'Password baru minimal 8 karakter.'
      )
      return
    }

    if (nextPassword !== passwordConfirmation) {
      toastError(
        'Password belum cocok',
        'Konfirmasi password harus sama dengan password baru.'
      )
      return
    }

    try {
      setSaving(true)
      await setAccountantPassword(passwordUser.id, nextPassword)
      success('Password diperbarui', 'Password akun berhasil diganti.')
      setPassword('')
      setPasswordConfirmation('')
      setPasswordUser(null)
      setPasswordVisible(false)
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

  async function openHistory(accountant: AccountantRecord) {
    setHistoryUser(accountant)
    setHistoryRows([])
    setHistoryLoading(true)

    try {
      const rows = await getAccountantHistory(accountant.id)
      setHistoryRows(rows)
    } catch (error) {
      console.error(error)
      toastError(
        'Gagal memuat riwayat',
        error instanceof Error ? error.message : 'Riwayat gagal dimuat.'
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  function closeHistory() {
    if (historyLoading) return
    setHistoryUser(null)
    setHistoryRows([])
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
            onClick={() => void load()}
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
                  <tr
                    key={accountant.id}
                    className={
                      accountant.active
                        ? undefined
                        : 'accountant-admin-row-inactive'
                    }
                  >
                    <td>
                      <strong>{accountant.name}</strong>
                      <span>{accountant.email}</span>
                    </td>
                    <td>
                      {accountant.kitchenName ?? 'Belum ditugaskan'}
                      {!accountant.active &&
                      accountant.lastAssignment?.assignedAt ? (
                        <span>
                          Assignment terakhir:{' '}
                          {formatDateTime(
                            accountant.lastAssignment.assignedAt
                          )}
                        </span>
                      ) : null}
                    </td>
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
                        {accountant.active ? (
                          <>
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
                                setPasswordVisible(false)
                              }}
                              aria-label={`Ganti password ${accountant.email}`}
                              title="Ganti password"
                            >
                              <KeyRound aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="app-action-button app-action-button--danger app-action-button--icon"
                              onClick={() => void toggleActive(accountant)}
                              aria-label={`Nonaktifkan ${accountant.email}`}
                              title="Nonaktifkan"
                            >
                              <UserMinus aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="app-action-button app-action-button--secondary"
                            onClick={() => openReplacement(accountant)}
                            title="Tambah akuntan pengganti"
                          >
                            <UserPlus aria-hidden="true" />
                            <span>Akuntan Baru</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="app-action-button app-action-button--secondary app-action-button--icon"
                          onClick={() => void openHistory(accountant)}
                          aria-label={`Riwayat ${accountant.email}`}
                          title="Riwayat"
                        >
                          <History aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          className="app-action-button app-action-button--danger app-action-button--icon"
                          onClick={() => void hardDelete(accountant)}
                          disabled={accountant.historyCount > 0}
                          aria-label={`Hapus ${accountant.email}`}
                          title={
                            accountant.historyCount > 0
                              ? 'Tidak dapat dihapus karena memiliki histori'
                              : 'Hapus permanen'
                          }
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
                  {editing
                    ? 'Edit Akuntan'
                    : replacementMode
                      ? 'Tambah Akuntan Pengganti'
                      : 'Tambah Akuntan'}
                </h3>
                {replacementMode ? (
                  <p>
                    Dapur dan rekening diambil dari assignment terakhir.
                    Buat user baru dengan email dan password baru.
                  </p>
                ) : null}
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
                  onBlur={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: titleCaseName(event.target.value)
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
                    <div className="accountant-admin-password-field">
                      <input
                        type={createPasswordVisible ? 'text' : 'password'}
                        value={form.password ?? ''}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            password: event.target.value
                          }))
                        }
                        autoComplete="new-password"
                        placeholder="Minimal 8 karakter"
                      />
                      <button
                        type="button"
                        className="accountant-admin-password-toggle"
                        onClick={() =>
                          setCreatePasswordVisible((current) => !current)
                        }
                        aria-label={
                          createPasswordVisible
                            ? 'Sembunyikan password'
                            : 'Tampilkan password'
                        }
                        title={
                          createPasswordVisible
                            ? 'Sembunyikan password'
                            : 'Tampilkan password'
                        }
                      >
                        {createPasswordVisible ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <Eye aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </label>

                  <label>
                    <span>Konfirmasi password</span>
                    <div className="accountant-admin-password-field">
                      <input
                        type={
                          createConfirmationVisible ? 'text' : 'password'
                        }
                        value={passwordConfirmation}
                        onChange={(event) =>
                          setPasswordConfirmation(event.target.value)
                        }
                        autoComplete="new-password"
                        placeholder="Ulangi password"
                      />
                      <button
                        type="button"
                        className="accountant-admin-password-toggle"
                        onClick={() =>
                          setCreateConfirmationVisible((current) => !current)
                        }
                        aria-label={
                          createConfirmationVisible
                            ? 'Sembunyikan konfirmasi password'
                            : 'Tampilkan konfirmasi password'
                        }
                        title={
                          createConfirmationVisible
                            ? 'Sembunyikan konfirmasi password'
                            : 'Tampilkan konfirmasi password'
                        }
                      >
                        {createConfirmationVisible ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <Eye aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </label>
                </>
              ) : null}

              <label>
                <span>Dapur</span>
                <select
                  value={form.kitchenId}
                  disabled={replacementMode}
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
                      disabled={
                        assignedKitchenIds.has(kitchen.id) &&
                        kitchen.id !== form.kitchenId
                      }
                    >
                      {kitchen.name}
                      {assignedKitchenIds.has(kitchen.id) &&
                      kitchen.id !== form.kitchenId
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
                    Rekening merupakan master rekening dapur, bukan milik
                    personal akuntan.
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
                    onBlur={(event) =>
                      setForm((current) => ({
                        ...current,
                        operationalAccountName: titleCaseName(
                          event.target.value
                        )
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
                        operationalBank: sanitizeBank(event.target.value)
                      }))
                    }
                    inputMode="text"
                    autoComplete="off"
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
                        operationalAccountNumber: sanitizeAccountNumber(
                          event.target.value
                        )
                      }))
                    }
                  />
                </label>
              </div>

              <div className="accountant-admin-form-note">
                <ShieldCheck aria-hidden="true" />
                <span>
                  Password dikelola Supabase Auth dan tidak disimpan di tabel
                  aplikasi.
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
                <div className="accountant-admin-password-field">
                  <input
                    type={passwordVisible ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Minimal 8 karakter"
                  />
                  <button
                    type="button"
                    className="accountant-admin-password-toggle"
                    onClick={() =>
                      setPasswordVisible((current) => !current)
                    }
                    aria-label={
                      passwordVisible
                        ? 'Sembunyikan password'
                        : 'Tampilkan password'
                    }
                    title={
                      passwordVisible
                        ? 'Sembunyikan password'
                        : 'Tampilkan password'
                    }
                  >
                    {passwordVisible ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                  </button>
                </div>
              </label>

              <label>
                <span>Konfirmasi password</span>
                <div className="accountant-admin-password-field">
                  <input
                    type={passwordVisible ? 'text' : 'password'}
                    value={passwordConfirmation}
                    onChange={(event) =>
                      setPasswordConfirmation(event.target.value)
                    }
                    autoComplete="new-password"
                    placeholder="Ulangi password"
                  />
                </div>
              </label>

              <div className="accountant-admin-form-note">
                <KeyRound aria-hidden="true" />
                <span>
                  Admin tidak dapat melihat password lama. Password baru hanya
                  diterapkan ke akun yang dipilih.
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
                      setPasswordConfirmation('')
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

      {historyUser ? (
        <div
          className="accountant-admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeHistory()
          }}
        >
          <section
            className="accountant-admin-modal accountant-admin-modal--history"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accountant-history-modal-title"
          >
            <header>
              <div>
                <span className="accountant-admin-kicker">AUDIT</span>
                <h3 id="accountant-history-modal-title">
                  Riwayat Akuntan
                </h3>
                <p>{historyUser.email}</p>
              </div>
              <button
                type="button"
                className="app-action-button app-action-button--secondary app-action-button--icon"
                onClick={closeHistory}
                disabled={historyLoading}
                aria-label="Tutup"
                title="Tutup"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="accountant-admin-history-content">
              {historyLoading ? (
                <div className="accountant-admin-empty">
                  Memuat riwayat...
                </div>
              ) : !historyRows.length ? (
                <div className="accountant-admin-empty">
                  Belum ada riwayat assignment tersimpan untuk akun ini.
                </div>
              ) : (
                <div className="accountant-admin-history-list">
                  {historyRows.map((row) => (
                    <article
                      className="accountant-admin-history-item"
                      key={row.id}
                    >
                      <div className="accountant-admin-history-item-header">
                        <div>
                          <strong>{row.accountantName}</strong>
                          <span>{row.accountantEmail}</span>
                        </div>
                        <span className="accountant-admin-badge is-inactive">
                          {row.endReason ?? 'Selesai'}
                        </span>
                      </div>
                      <dl>
                        <div>
                          <dt>Dapur</dt>
                          <dd>{row.kitchenName}</dd>
                        </div>
                        <div>
                          <dt>Periode</dt>
                          <dd>
                            {formatDateTime(row.assignedAt)} —{' '}
                            {formatDateTime(row.endedAt)}
                          </dd>
                        </div>
                        <div>
                          <dt>Rekening</dt>
                          <dd>{assignmentAccount(row)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
