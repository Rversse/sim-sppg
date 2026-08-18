import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Link2,
  Pencil,
  Plus,
  Save,
  Trash2,
  WalletCards,
  X
} from 'lucide-react'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import {
  createSupplier,
  deleteSupplier,
  deleteSupplierAccount,
  getAccountKitchenIds,
  getActiveKitchens,
  getSuppliers,
  saveAccountKitchenMapping,
  saveSupplierAccount,
  updateSupplier
} from '@/features/supplier/supplier-service'
import type {
  AccountInput,
  Supplier,
  SupplierInput
} from '@/features/supplier/supplier-types'

const EMPTY_SUPPLIER: SupplierInput = {
  business_name: '',
  owner_name: '',
  product_type: '',
  phone: '',
  address: ''
}

const EMPTY_ACCOUNT: AccountInput = {
  bank: 'BNI',
  account_number: '',
  opening_balance: 0
}

export function SupplierPage() {
  const { user } = useAuth()
  const canView = canAccess(user?.role, 'supplier.view')
  const canManage = canAccess(user?.role, 'supplier.manage')
  const { success, error: showError } = useToast()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [supplierModal, setSupplierModal] = useState(false)
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(
    null
  )
  const [supplierForm, setSupplierForm] =
    useState<SupplierInput>(EMPTY_SUPPLIER)

  const [accountSupplierId, setAccountSupplierId] = useState<string | null>(
    null
  )
  const [accountReadOnly, setAccountReadOnly] = useState(false)
  const [accountForm, setAccountForm] = useState<AccountInput>(EMPTY_ACCOUNT)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)

  const [mappingAccountId, setMappingAccountId] = useState<string | null>(null)
  const [selectedKitchens, setSelectedKitchens] = useState<string[]>([])
  const [kitchens, setKitchens] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setSuppliers(await getSuppliers())
    } catch (err) {
      console.error(err)
      setError('Gagal memuat data supplier.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canView) return

    let cancelled = false

    void getSuppliers()
      .then((data) => {
        if (cancelled) return
        setSuppliers(data)
        setError('')
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error(err)
        setError('Gagal memuat data supplier.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canView])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    const result = keyword
      ? suppliers.filter((supplier) =>
          [supplier.business_name, supplier.owner_name, supplier.product_type]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword))
        )
      : suppliers

    return [...result].sort((a, b) =>
      a.business_name.localeCompare(b.business_name, 'id', {
        sensitivity: 'base'
      })
    )
  }, [search, suppliers])

  if (!canView) return <div className="app-access-denied">Akses ditolak.</div>

  function openAddSupplier() {
    if (!canManage) return

    setEditingSupplierId(null)
    setSupplierForm(structuredClone(EMPTY_SUPPLIER))
    setSupplierModal(true)
  }

  function openEditSupplier(supplier: Supplier) {
    if (!canManage) return

    setEditingSupplierId(supplier.id)
    setSupplierForm({
      business_name: supplier.business_name,
      owner_name: supplier.owner_name ?? '',
      product_type: supplier.product_type ?? '',
      phone: supplier.phone ?? '',
      address: supplier.address ?? ''
    })
    setSupplierModal(true)
  }

  async function saveSupplier() {
    if (!canManage || busy) return

    setBusy(true)

    try {
      const isEditing = Boolean(editingSupplierId)

      if (isEditing) {
        await updateSupplier(editingSupplierId!, supplierForm)
      } else {
        await createSupplier(supplierForm)
      }

      setSupplierModal(false)
      await load()

      success(
        isEditing ? 'Supplier diperbarui' : 'Supplier ditambahkan',
        isEditing
          ? 'Data supplier berhasil diperbarui.'
          : 'Data supplier berhasil ditambahkan.'
      )
    } catch (err) {
      console.error(err)
      showError(
        'Gagal menyimpan supplier',
        err instanceof Error ? err.message : 'Silakan coba lagi.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function removeSupplier(supplier: Supplier) {
    if (!canManage) return

    if (
      !window.confirm(
        `Yakin ingin menghapus supplier "${supplier.business_name}"?`
      )
    ) {
      return
    }

    try {
      await deleteSupplier(supplier.id)
      await load()
      success('Supplier dihapus', 'Data supplier berhasil dihapus.')
    } catch (err) {
      console.error(err)
      showError(
        'Gagal menghapus supplier',
        err instanceof Error ? err.message : 'Silakan coba lagi.'
      )
    }
  }

  function openAccountManager(supplierId: string) {
    if (!canView) return

    setAccountSupplierId(supplierId)
    setAccountReadOnly(!canManage)
    setEditingAccountId(null)
    setAccountForm(structuredClone(EMPTY_ACCOUNT))
  }

  function closeAccountManager() {
    if (busy) return

    setAccountSupplierId(null)
    setAccountReadOnly(false)
    setEditingAccountId(null)
    setAccountForm(structuredClone(EMPTY_ACCOUNT))
  }

  const accountSupplier =
    suppliers.find((supplier) => supplier.id === accountSupplierId) ?? null

  function openEditAccount(account: Supplier['accounts'][number]) {
    if (!canManage) return

    setEditingAccountId(account.id)
    setAccountForm({
      bank: account.bank,
      account_number: account.account_number ?? '',
      opening_balance: Number(account.opening_balance) || 0
    })
  }

  async function saveAccount() {
    if (!canManage || !accountSupplierId || busy) return

    setBusy(true)

    try {
      const isEditing = Boolean(editingAccountId)

      await saveSupplierAccount(
        accountSupplierId,
        editingAccountId,
        accountForm
      )

      setEditingAccountId(null)
      setAccountForm(structuredClone(EMPTY_ACCOUNT))
      await load()

      success(
        isEditing ? 'Rekening diperbarui' : 'Rekening ditambahkan',
        isEditing
          ? 'Data rekening supplier berhasil diperbarui.'
          : 'Rekening supplier berhasil ditambahkan.'
      )
    } catch (err) {
      console.error(err)
      showError(
        'Gagal menyimpan rekening',
        err instanceof Error ? err.message : 'Silakan coba lagi.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function removeAccount(accountId: string) {
    if (
      !canManage ||
      !accountSupplierId ||
      !window.confirm('Hapus rekening ini?')
    ) {
      return
    }

    try {
      await deleteSupplierAccount(accountSupplierId, accountId)
      await load()
      success('Rekening dihapus', 'Rekening supplier berhasil dihapus.')
    } catch (err) {
      console.error(err)
      showError(
        'Gagal menghapus rekening',
        err instanceof Error ? err.message : 'Silakan coba lagi.'
      )
    }
  }

  async function openMapping(accountId: string) {
    if (!canManage) return

    setMappingAccountId(accountId)

    try {
      setSelectedKitchens(await getAccountKitchenIds(accountId))
      setKitchens(await getActiveKitchens())
    } catch (err) {
      console.error(err)
      showError(
        'Gagal memuat mapping',
        err instanceof Error ? err.message : 'Silakan coba lagi.'
      )
    }
  }

  async function saveMapping() {
    if (!canManage || !mappingAccountId || busy) return

    setBusy(true)

    try {
      await saveAccountKitchenMapping(mappingAccountId, selectedKitchens)
      setMappingAccountId(null)
      await load()

      success(
        'Mapping disimpan',
        'Mapping rekening ke dapur berhasil disimpan.'
      )
    } catch (err) {
      console.error(err)
      showError(
        'Gagal menyimpan mapping',
        err instanceof Error ? err.message : 'Silakan coba lagi.'
      )
    } finally {
      setBusy(false)
    }
  }

  const mappedAccount =
    accountSupplier?.accounts.find(
      (account) => account.id === mappingAccountId
    ) ?? null

  return (
    <div className="supplier-page">
      <div className="supplier-header">
        <div>
          <h1>Data Supplier</h1>
          <p>
            Master supplier, rekening, saldo awal, dan mapping rekening ke
            dapur.
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            className="app-action-button"
            onClick={openAddSupplier}
          >
            <Plus aria-hidden="true" />
            <span>Tambah Supplier</span>
          </button>
        ) : null}
      </div>

      <div className="supplier-toolbar">
        <input
          className="supplier-input supplier-control-grow"
          placeholder="Cari supplier..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span className="supplier-count">{filtered.length} supplier</span>
      </div>

      <div className="supplier-panel">
        {loading ? (
          <div className="supplier-empty">Memuat data supplier...</div>
        ) : error ? (
          <div className="supplier-empty supplier-state-error">{error}</div>
        ) : !filtered.length ? (
          <div className="supplier-empty">Belum ada data supplier.</div>
        ) : (
          <table className="supplier-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Pemilik</th>
                <th>Produk</th>
                <th>No. HP</th>
                <th>Alamat</th>
                <th>Rekening</th>
                {canManage ? (
                  <th className="supplier-action-column">Aksi</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((supplier) => (
                <tr key={supplier.id}>
                  <td>
                    <strong>{supplier.business_name}</strong>
                  </td>
                  <td>{supplier.owner_name || '-'}</td>
                  <td>{supplier.product_type || '-'}</td>
                  <td>{supplier.phone || '-'}</td>
                  <td>{supplier.address || '-'}</td>
                  <td>
                    <button
                      type="button"
                      className="supplier-account-count-button"
                      onClick={() => openAccountManager(supplier.id)}
                    >
                      <WalletCards aria-hidden="true" />
                      <span>{supplier.accounts.length}</span>
                    </button>
                  </td>

                  {canManage ? (
                    <td className="supplier-action-cell">
                      <div className="app-action-row">
                        <button
                          type="button"
                          className="app-action-button app-action-button--icon app-action-button--secondary"
                          onClick={() => openEditSupplier(supplier)}
                          aria-label={`Edit ${supplier.business_name}`}
                          title={`Edit ${supplier.business_name}`}
                        >
                          <Pencil aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          className="app-action-button app-action-button--icon app-action-button--secondary"
                          onClick={() => openAccountManager(supplier.id)}
                          aria-label={`Kelola rekening ${supplier.business_name}`}
                          title={`Kelola rekening ${supplier.business_name}`}
                        >
                          <WalletCards aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          className="app-action-button app-action-button--icon app-action-button--danger"
                          onClick={() => void removeSupplier(supplier)}
                          aria-label={`Hapus ${supplier.business_name}`}
                          title={`Hapus ${supplier.business_name}`}
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

      {supplierModal ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setSupplierModal(false)
            }
          }}
        >
          <section
            className="modal supplier-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="supplier-modal-title"
          >
            <div className="supplier-modal-head">
              <h2 id="supplier-modal-title">
                {editingSupplierId ? 'Edit Supplier' : 'Tambah Supplier'}
              </h2>

              <button
                type="button"
                className="app-action-button app-action-button--icon app-action-button--secondary"
                onClick={() => setSupplierModal(false)}
                disabled={busy}
                aria-label="Tutup"
                title="Tutup"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="supplier-modal-body modal-body">
              <div className="supplier-form-grid">
                <div className="supplier-field">
                  <label htmlFor="supplier-business">Nama Supplier</label>
                  <input
                    id="supplier-business"
                    value={supplierForm.business_name}
                    onChange={(event) =>
                      setSupplierForm((current) => ({
                        ...current,
                        business_name: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="supplier-field">
                  <label htmlFor="supplier-owner">Pemilik Usaha</label>
                  <input
                    id="supplier-owner"
                    value={supplierForm.owner_name}
                    onChange={(event) =>
                      setSupplierForm((current) => ({
                        ...current,
                        owner_name: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="supplier-field">
                  <label htmlFor="supplier-product">Jenis Produk</label>
                  <input
                    id="supplier-product"
                    value={supplierForm.product_type}
                    onChange={(event) =>
                      setSupplierForm((current) => ({
                        ...current,
                        product_type: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="supplier-field">
                  <label htmlFor="supplier-phone">No. HP</label>
                  <input
                    id="supplier-phone"
                    value={supplierForm.phone}
                    onChange={(event) =>
                      setSupplierForm((current) => ({
                        ...current,
                        phone: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="supplier-field">
                  <label htmlFor="supplier-address">Alamat</label>
                  <input
                    id="supplier-address"
                    value={supplierForm.address}
                    onChange={(event) =>
                      setSupplierForm((current) => ({
                        ...current,
                        address: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="supplier-modal-actions">
                  <button
                    type="button"
                    className="app-action-button app-action-button--secondary"
                    onClick={() => setSupplierModal(false)}
                    disabled={busy}
                  >
                    <X aria-hidden="true" />
                    <span>Batal</span>
                  </button>

                  <button
                    type="button"
                    className="app-action-button"
                    onClick={() => void saveSupplier()}
                    disabled={busy}
                  >
                    <Save aria-hidden="true" />
                    <span>{busy ? 'Menyimpan...' : 'Simpan'}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {accountSupplierId ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              closeAccountManager()
            }
          }}
        >
          <section
            className={`modal supplier-modal supplier-account-modal${
              accountReadOnly ? ' is-readonly' : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="supplier-account-title"
          >
            <div className="supplier-modal-head">
              <div>
                <h2 id="supplier-account-title">
                  Rekening - {accountSupplier?.business_name}
                </h2>
                <span className="supplier-modal-subtitle">
                  {accountReadOnly
                    ? 'Informasi rekening dan mapping dapur.'
                    : 'Kelola rekening dan mapping dapur.'}
                </span>
              </div>

              <button
                type="button"
                className="app-action-button app-action-button--icon app-action-button--secondary"
                onClick={closeAccountManager}
                disabled={busy}
                aria-label="Tutup"
                title="Tutup"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="supplier-modal-body modal-body">
              {accountSupplier?.accounts.length ? (
                <div className="supplier-account-list">
                  {accountSupplier.accounts.map((account) => (
                    <article className="supplier-account-card" key={account.id}>
                      <div className="supplier-account-top">
                        <div>
                          <strong className="supplier-account-bank">
                            <Building2 aria-hidden="true" />
                            {account.bank}
                          </strong>

                          <div className="supplier-account-number">
                            {account.account_number || '-'}
                          </div>

                          <span className="supplier-account-mapping">
                            {account.kitchen_account_rules.length
                              ? account.kitchen_account_rules
                                  .map((rule) => rule.kitchens?.name)
                                  .filter(Boolean)
                                  .join(', ')
                              : 'Belum dipetakan'}
                          </span>
                        </div>

                        {!accountReadOnly ? (
                          <div className="supplier-account-actions">
                            <button
                              type="button"
                              className="app-action-button app-action-button--icon app-action-button--secondary"
                              onClick={() => openEditAccount(account)}
                              aria-label={`Edit rekening ${account.bank}`}
                              title={`Edit rekening ${account.bank}`}
                            >
                              <Pencil aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              className="app-action-button app-action-button--icon app-action-button--secondary"
                              onClick={() => void openMapping(account.id)}
                              aria-label="Mapping dapur"
                              title="Mapping dapur"
                            >
                              <Link2 aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              className="app-action-button app-action-button--icon app-action-button--danger"
                              onClick={() => void removeAccount(account.id)}
                              aria-label={`Hapus rekening ${account.bank}`}
                              title={`Hapus rekening ${account.bank}`}
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {accountReadOnly ? (
                        <div className="supplier-account-readonly-meta">
                          <span>
                            Saldo Awal:{' '}
                            <strong>
                              Rp{' '}
                              {new Intl.NumberFormat('id-ID').format(
                                Number(account.opening_balance) || 0
                              )}
                            </strong>
                          </span>
                          <span>
                            Mapping:{' '}
                            <strong>
                              {account.kitchen_account_rules.length
                                ? `${account.kitchen_account_rules.length} dapur`
                                : 'Belum dipetakan'}
                            </strong>
                          </span>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="supplier-empty">
                  Supplier belum memiliki rekening.
                </div>
              )}

              {!accountReadOnly ? (
                <div className="supplier-account-editor">
                  <div className="supplier-form-grid">
                    <div className="supplier-field">
                      <label htmlFor="supplier-account-bank">Bank</label>
                      <select
                        id="supplier-account-bank"
                        value={accountForm.bank}
                        onChange={(event) =>
                          setAccountForm((current) => ({
                            ...current,
                            bank: event.target.value
                          }))
                        }
                      >
                        <option>BNI</option>
                        <option>BRI</option>
                        <option>Mandiri</option>
                        <option>BCA</option>
                        <option>BSI</option>
                      </select>
                    </div>

                    <div className="supplier-field">
                      <label htmlFor="supplier-account-number">
                        Nomor Rekening
                      </label>
                      <input
                        id="supplier-account-number"
                        value={accountForm.account_number}
                        onChange={(event) =>
                          setAccountForm((current) => ({
                            ...current,
                            account_number: event.target.value
                          }))
                        }
                      />
                    </div>

                    <div className="supplier-field">
                      <label htmlFor="supplier-opening-balance">
                        Saldo Awal
                      </label>
                      <input
                        id="supplier-opening-balance"
                        type="number"
                        min="0"
                        value={accountForm.opening_balance}
                        onChange={(event) =>
                          setAccountForm((current) => ({
                            ...current,
                            opening_balance: Number(event.target.value) || 0
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="supplier-modal-actions">
                    <button
                      type="button"
                      className="app-action-button app-action-button--secondary"
                      onClick={() => {
                        setEditingAccountId(null)
                        setAccountForm(structuredClone(EMPTY_ACCOUNT))
                      }}
                      disabled={busy}
                    >
                      <X aria-hidden="true" />
                      <span>Reset</span>
                    </button>

                    <button
                      type="button"
                      className="app-action-button"
                      onClick={() => void saveAccount()}
                      disabled={busy}
                    >
                      <Save aria-hidden="true" />
                      <span>
                        {busy
                          ? 'Menyimpan...'
                          : editingAccountId
                            ? 'Perbarui Rekening'
                            : 'Tambah Rekening'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {mappingAccountId ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setMappingAccountId(null)
            }
          }}
        >
          <section
            className="modal supplier-modal supplier-mapping-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="supplier-mapping-title"
          >
            <div className="supplier-modal-head">
              <div>
                <h2 id="supplier-mapping-title">Mapping Dapur</h2>
                <span className="supplier-modal-subtitle">
                  {mappedAccount?.bank} • {mappedAccount?.account_number || '-'}
                </span>
              </div>

              <button
                type="button"
                className="app-action-button app-action-button--icon app-action-button--secondary"
                onClick={() => setMappingAccountId(null)}
                disabled={busy}
                aria-label="Tutup"
                title="Tutup"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="supplier-modal-body modal-body">
              <div className="supplier-mapping-list">
                {kitchens.map((kitchen) => (
                  <label className="supplier-mapping-item" key={kitchen.id}>
                    <input
                      type="checkbox"
                      checked={selectedKitchens.includes(kitchen.id)}
                      onChange={(event) =>
                        setSelectedKitchens((current) =>
                          event.target.checked
                            ? [...current, kitchen.id]
                            : current.filter((id) => id !== kitchen.id)
                        )
                      }
                    />
                    <span>{kitchen.name}</span>
                  </label>
                ))}
              </div>

              <div className="supplier-modal-actions">
                <button
                  type="button"
                  className="app-action-button app-action-button--secondary"
                  onClick={() => setMappingAccountId(null)}
                  disabled={busy}
                >
                  <X aria-hidden="true" />
                  <span>Batal</span>
                </button>

                <button
                  type="button"
                  className="app-action-button"
                  onClick={() => void saveMapping()}
                  disabled={busy}
                >
                  <Save aria-hidden="true" />
                  <span>{busy ? 'Menyimpan...' : 'Simpan Mapping'}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
