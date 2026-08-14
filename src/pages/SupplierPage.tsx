import { useEffect, useMemo, useState } from 'react'

import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
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
    if (!canView) {
      return
    }

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
    if (!keyword) return suppliers
    return suppliers.filter((supplier) =>
      [supplier.business_name, supplier.owner_name, supplier.product_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    )
  }, [search, suppliers])

  if (!canView) return <div style={{ padding: 24 }}>Akses ditolak.</div>

  function openAddSupplier() {
    setEditingSupplierId(null)
    setSupplierForm(structuredClone(EMPTY_SUPPLIER))
    setSupplierModal(true)
  }

  function openEditSupplier(supplier: Supplier) {
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
    if (busy) return
    setBusy(true)
    try {
      if (editingSupplierId)
        await updateSupplier(editingSupplierId, supplierForm)
      else await createSupplier(supplierForm)
      setSupplierModal(false)
      await load()
    } catch (err) {
      console.error(err)
      window.alert(
        err instanceof Error ? err.message : 'Gagal menyimpan supplier.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function removeSupplier(supplier: Supplier) {
    if (
      !window.confirm(
        `Yakin ingin menghapus supplier "${supplier.business_name}"?`
      )
    )
      return
    try {
      await deleteSupplier(supplier.id)
      await load()
    } catch (err) {
      console.error(err)
      window.alert(
        err instanceof Error ? err.message : 'Gagal menghapus supplier.'
      )
    }
  }

  function openAccountManager(supplierId: string) {
    setAccountSupplierId(supplierId)
    setEditingAccountId(null)
    setAccountForm(structuredClone(EMPTY_ACCOUNT))
  }

  function closeAccountManager() {
    setAccountSupplierId(null)
    setEditingAccountId(null)
  }

  const accountSupplier =
    suppliers.find((supplier) => supplier.id === accountSupplierId) ?? null

  function openEditAccount(account: Supplier['accounts'][number]) {
    setEditingAccountId(account.id)
    setAccountForm({
      bank: account.bank,
      account_number: account.account_number ?? '',
      opening_balance: Number(account.opening_balance) || 0
    })
  }

  async function saveAccount() {
    if (!accountSupplierId || busy) return
    setBusy(true)
    try {
      await saveSupplierAccount(
        accountSupplierId,
        editingAccountId,
        accountForm
      )
      setEditingAccountId(null)
      setAccountForm(structuredClone(EMPTY_ACCOUNT))
      await load()
    } catch (err) {
      console.error(err)
      window.alert(
        err instanceof Error ? err.message : 'Gagal menyimpan rekening.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function removeAccount(accountId: string) {
    if (!accountSupplierId || !window.confirm('Hapus rekening ini?')) return
    try {
      await deleteSupplierAccount(accountSupplierId, accountId)
      await load()
    } catch (err) {
      console.error(err)
      window.alert(
        err instanceof Error ? err.message : 'Gagal menghapus rekening.'
      )
    }
  }

  async function openMapping(accountId: string) {
    setMappingAccountId(accountId)
    try {
      setSelectedKitchens(await getAccountKitchenIds(accountId))
      setKitchens(await getActiveKitchens())
    } catch (err) {
      console.error(err)
      window.alert('Gagal memuat mapping dapur.')
    }
  }

  async function saveMapping() {
    if (!mappingAccountId || busy) return
    setBusy(true)
    try {
      await saveAccountKitchenMapping(mappingAccountId, selectedKitchens)
      setMappingAccountId(null)
      await load()
    } catch (err) {
      console.error(err)
      window.alert(
        err instanceof Error ? err.message : 'Gagal menyimpan mapping.'
      )
    } finally {
      setBusy(false)
    }
  }

  const mappedSupplier = accountSupplier
  const mappedAccount =
    mappedSupplier?.accounts.find(
      (account) => account.id === mappingAccountId
    ) ?? null

  return (
    <div className="supplier-page">
      <style>{`
        .supplier-page{display:grid;gap:14px}.supplier-header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}.supplier-header h1{margin:0;color:#0b132b;font-size:28px}.supplier-header p{margin:5px 0 0;color:#94a3b8;font-size:11px}.supplier-toolbar{display:flex;gap:8px;align-items:center}.supplier-input{min-height:38px;border:1px solid #dbe3ed;border-radius:9px;padding:0 11px;background:#fff}.supplier-panel{overflow:auto;border:1px solid #dbe3ed;border-radius:14px;background:#fff}.supplier-table{width:100%;min-width:1150px;border-collapse:collapse}.supplier-table th,.supplier-table td{padding:10px 12px;border-bottom:1px solid #eef2f7;text-align:left;font-size:10px;vertical-align:top}.supplier-table th{background:#f8fafc;color:#64748b;font-size:8px;text-transform:uppercase}.action-row{display:flex;gap:5px;flex-wrap:wrap}.btn{min-height:32px;padding:0 10px;border:1px solid #0b132b;border-radius:8px;background:#0b132b;color:#fff;font-size:9px;font-weight:800;cursor:pointer}.btn.secondary{border-color:#dbe3ed;background:#fff;color:#334155}.btn.danger{border-color:#fecaca;background:#fff;color:#dc2626}.badge{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:8px;font-weight:800}.active{background:#ecfdf3;color:#15803d}.inactive{background:#fff1f2;color:#be123c}.account-count{cursor:pointer;color:#0f5fbd;font-weight:800}.modal-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:rgb(15 23 42 / .52);backdrop-filter:blur(4px)}.modal{width:min(720px,100%);max-height:calc(100vh - 40px);overflow:auto;border-radius:16px;background:#fff;border:1px solid #dbe3ed}.modal-head{display:flex;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #eef2f7}.modal-head h2{margin:0;font-size:16px;color:#0b132b}.modal-body{padding:18px;display:grid;gap:12px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:9px;color:#64748b;font-weight:800}.field input,.field select{min-height:40px;border:1px solid #dbe3ed;border-radius:9px;padding:0 11px}.account-card{padding:12px;border:1px solid #e5eaf0;border-radius:10px}.account-card+.account-card{margin-top:8px}.account-top{display:flex;justify-content:space-between;gap:10px}.mapping-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mapping-item{padding:9px;border:1px solid #e5eaf0;border-radius:9px;font-size:10px}.modal-actions{display:flex;justify-content:flex-end;gap:8px}.empty{padding:28px;color:#94a3b8;text-align:center;font-size:11px}@media(max-width:700px){.supplier-header{align-items:stretch;flex-direction:column}.form-grid,.mapping-list{grid-template-columns:1fr}.field.full{grid-column:auto}}
      `}</style>

      <div className="supplier-header">
        <div>
          <h1>Data Supplier</h1>
          <p>
            Master supplier, rekening, saldo awal, dan mapping rekening ke
            dapur.
          </p>
        </div>
        {canManage && (
          <button className="btn" onClick={openAddSupplier}>
            + Tambah Supplier
          </button>
        )}
      </div>
      <div className="supplier-toolbar">
        <input
          className="supplier-input"
          style={{ flex: 1 }}
          placeholder="Cari supplier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span style={{ color: '#64748b', fontSize: 10 }}>
          {filtered.length} supplier
        </span>
      </div>
      <div className="supplier-panel">
        {loading ? (
          <div className="empty">Memuat data supplier...</div>
        ) : error ? (
          <div className="empty" style={{ color: '#dc2626' }}>
            {error}
          </div>
        ) : !filtered.length ? (
          <div className="empty">Belum ada data supplier.</div>
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
                <th>Aksi</th>
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
                    <span
                      className="account-count"
                      onClick={() => openAccountManager(supplier.id)}
                    >
                      {supplier.accounts.length} Rek
                    </span>
                  </td>
                  <td>
                    {canManage ? (
                      <div className="action-row">
                        <button
                          className="btn secondary"
                          onClick={() => openEditSupplier(supplier)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn secondary"
                          onClick={() => openAccountManager(supplier.id)}
                        >
                          Rekening
                        </button>
                        <button
                          className="btn danger"
                          onClick={() => removeSupplier(supplier)}
                        >
                          Hapus
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {supplierModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <h2>{editingSupplierId ? 'Edit Supplier' : 'Tambah Supplier'}</h2>
              <button
                className="btn secondary"
                onClick={() => setSupplierModal(false)}
              >
                Tutup
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field full">
                  <label>Nama Supplier</label>
                  <input
                    value={supplierForm.business_name}
                    onChange={(e) =>
                      setSupplierForm((f) => ({
                        ...f,
                        business_name: e.target.value
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Pemilik</label>
                  <input
                    value={supplierForm.owner_name}
                    onChange={(e) =>
                      setSupplierForm((f) => ({
                        ...f,
                        owner_name: e.target.value
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Jenis Produk</label>
                  <input
                    value={supplierForm.product_type}
                    onChange={(e) =>
                      setSupplierForm((f) => ({
                        ...f,
                        product_type: e.target.value
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>No. HP</label>
                  <input
                    value={supplierForm.phone}
                    onChange={(e) =>
                      setSupplierForm((f) => ({ ...f, phone: e.target.value }))
                    }
                  />
                </div>
                <div className="field full">
                  <label>Alamat</label>
                  <input
                    value={supplierForm.address}
                    onChange={(e) =>
                      setSupplierForm((f) => ({
                        ...f,
                        address: e.target.value
                      }))
                    }
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="btn secondary"
                  onClick={() => setSupplierModal(false)}
                  disabled={busy}
                >
                  Batal
                </button>
                <button className="btn" onClick={saveSupplier} disabled={busy}>
                  {busy ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {accountSupplierId && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <h2>Rekening - {accountSupplier?.business_name}</h2>
              <button className="btn secondary" onClick={closeAccountManager}>
                Tutup
              </button>
            </div>
            <div className="modal-body">
              {accountSupplier?.accounts.length ? (
                accountSupplier.accounts.map((account) => (
                  <div className="account-card" key={account.id}>
                    <div className="account-top">
                      <div>
                        <strong>{account.bank}</strong>
                        <div
                          style={{
                            fontSize: 10,
                            color: '#64748b',
                            marginTop: 4
                          }}
                        >
                          {account.account_number || '-'}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: '#94a3b8',
                            marginTop: 4
                          }}
                        >
                          {account.kitchen_account_rules.length
                            ? account.kitchen_account_rules
                                .map((r) => r.kitchens?.name)
                                .filter(Boolean)
                                .join(', ')
                            : 'Belum dipetakan'}
                        </div>
                      </div>
                      <div className="action-row">
                        <button
                          className="btn secondary"
                          onClick={() => openEditAccount(account)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn secondary"
                          onClick={() => openMapping(account.id)}
                        >
                          Mapping
                        </button>
                        <button
                          className="btn danger"
                          onClick={() => removeAccount(account.id)}
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">Supplier belum memiliki rekening.</div>
              )}
              <div style={{ borderTop: '1px solid #eef2f7', paddingTop: 12 }}>
                <div className="form-grid">
                  <div className="field">
                    <label>Bank</label>
                    <select
                      value={accountForm.bank}
                      onChange={(e) =>
                        setAccountForm((f) => ({ ...f, bank: e.target.value }))
                      }
                    >
                      <option>BNI</option>
                      <option>BRI</option>
                      <option>Mandiri</option>
                      <option>BCA</option>
                      <option>BSI</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Nomor Rekening</label>
                    <input
                      value={accountForm.account_number}
                      onChange={(e) =>
                        setAccountForm((f) => ({
                          ...f,
                          account_number: e.target.value
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Saldo Awal</label>
                    <input
                      type="number"
                      min="0"
                      value={accountForm.opening_balance}
                      onChange={(e) =>
                        setAccountForm((f) => ({
                          ...f,
                          opening_balance: Number(e.target.value) || 0
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button
                    className="btn secondary"
                    onClick={() => {
                      setEditingAccountId(null)
                      setAccountForm(structuredClone(EMPTY_ACCOUNT))
                    }}
                  >
                    Reset
                  </button>
                  <button className="btn" onClick={saveAccount} disabled={busy}>
                    {busy
                      ? 'Menyimpan...'
                      : editingAccountId
                        ? 'Perbarui Rekening'
                        : 'Tambah Rekening'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {mappingAccountId && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <h2>Mapping Dapur</h2>
              <button
                className="btn secondary"
                onClick={() => setMappingAccountId(null)}
              >
                Tutup
              </button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 11, color: '#475569' }}>
                {mappedAccount?.bank} • {mappedAccount?.account_number || '-'}
              </div>
              <div className="mapping-list">
                {kitchens.map((kitchen) => (
                  <label className="mapping-item" key={kitchen.id}>
                    <input
                      type="checkbox"
                      checked={selectedKitchens.includes(kitchen.id)}
                      onChange={(e) =>
                        setSelectedKitchens((current) =>
                          e.target.checked
                            ? [...current, kitchen.id]
                            : current.filter((id) => id !== kitchen.id)
                        )
                      }
                    />{' '}
                    {kitchen.name}
                  </label>
                ))}
              </div>
              <div className="modal-actions">
                <button
                  className="btn secondary"
                  onClick={() => setMappingAccountId(null)}
                >
                  Batal
                </button>
                <button className="btn" onClick={saveMapping} disabled={busy}>
                  {busy ? 'Menyimpan...' : 'Simpan Mapping'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
