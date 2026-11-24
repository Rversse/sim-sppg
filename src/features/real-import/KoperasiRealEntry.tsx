import { useEffect, useMemo, useState } from 'react'
import { Check, CheckCheck, Copy, LoaderCircle, Pencil, Save, Trash2, X } from 'lucide-react'

import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import { supabase } from '@/lib/supabase'
import { buildKoperasiOpsRealRows } from '@/features/real-import/koperasi-ops-real-utils'
import '@/styles/koperasi-real-entry.css'

type Kitchen = { id: string; name: string }
type SavedTransaction = {
  id: string
  transaction_date: string
  kitchen_id: string
  amount: number
  note: string | null
  real_import_batch_id: string | null
  created_by: string
  creator_role: 'admin' | 'koperasi'
  category: 'Supplier' | 'OPS'
  kitchens: { name: string } | null
}
type RealKind = 'rab' | 'ops'

const SPECIAL_KITCHENS = new Set(['cisepat', 'kertajadi'])

function localDateValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

function kitchenKey(value: string) {
  return value.normalize('NFKD').trim().toLocaleLowerCase('id-ID')
}

function parseAmount(value: string) {
  const digits = value.replace(/[^0-9]/g, '')
  return digits ? Number(digits) : 0
}

function formatAmount(value: number) {
  return new Intl.NumberFormat('id-ID').format(value)
}

function formatAmountInput(value: string) {
  return value ? formatAmount(parseAmount(value)) : ''
}

async function hashPayload(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function KoperasiRealEntry() {
  const { user } = useAuth()
  const { success, error: toastError } = useToast()
  const [date, setDate] = useState(localDateValue)
  const [kitchens, setKitchens] = useState<Kitchen[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [rabAmounts, setRabAmounts] = useState<Record<string, string>>({})
  const [opsAmounts, setOpsAmounts] = useState<Record<string, string>>({})
  const [savedRab, setSavedRab] = useState<SavedTransaction[]>([])
  const [savedOps, setSavedOps] = useState<SavedTransaction[]>([])
  const [editing, setEditing] = useState<Record<string, { amount: string }>>({})
  const [deleting, setDeleting] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState<string | null>(null)
  const [copyingKind, setCopyingKind] = useState<RealKind | null>(null)
  const [copiedKind, setCopiedKind] = useState<RealKind | null>(null)
  const [confirmDeleteClosing, setConfirmDeleteClosing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingRab, setSavingRab] = useState(false)
  const [savingOps, setSavingOps] = useState(false)
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [supplierError, setSupplierError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadReferences() {
      setLoading(true)
      setLoadError('')
      setSupplierError('')

      try {
        const [kitchenResult, supplierResult] = await Promise.all([
          supabase.from('kitchens').select('id,name').eq('is_active', true).order('name'),
          supabase.from('suppliers').select('id,name').eq('is_active', true).ilike('name', 'Koperasi Arutala')
        ])

        if (kitchenResult.error) throw kitchenResult.error
        if (cancelled) return

        setKitchens((kitchenResult.data ?? []) as Kitchen[])

        if (supplierResult.error) {
          setSupplierId('')
          setSupplierError('Referensi supplier Koperasi Arutala gagal dimuat. Input OPS - Real tetap dapat digunakan.')
        } else {
          const supplier = (supplierResult.data ?? []).find(
            (item) => kitchenKey(item.name) === 'koperasi arutala'
          )

          if (supplier) {
            setSupplierId(supplier.id)
          } else {
            setSupplierId('')
            setSupplierError('Supplier aktif Koperasi Arutala tidak ditemukan. Input RAB - Real dinonaktifkan; OPS - Real tetap tersedia.')
          }
        }
      } catch (loadFailure) {
        if (!cancelled) {
          setLoadError(loadFailure instanceof Error ? loadFailure.message : 'Gagal memuat referensi dapur.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadReferences()
    return () => { cancelled = true }
  }, [])

  async function loadSavedTransactions() {
    if (!user?.id || !date) return
    setLoadingSaved(true)

    try {
      const { data, error } = await supabase.rpc('get_koperasi_real_history', {
        p_transaction_date: date,
        p_supplier_id: supplierId || null
      })

      if (error) throw error

      const rows = (data ?? []) as Array<SavedTransaction & { kitchen_name: string }>
      const mappedRows: SavedTransaction[] = rows.map((row) => ({
        ...row,
        kitchens: { name: row.kitchen_name }
      }))

      setSavedRab(mappedRows.filter((row) => row.category === 'Supplier') as SavedTransaction[])
      setSavedOps(mappedRows.filter((row) => row.category === 'OPS') as SavedTransaction[])
      setEditing({})
    } catch (loadFailure) {
      toastError('Gagal memuat data tersimpan', loadFailure instanceof Error ? loadFailure.message : 'Terjadi kesalahan.')
    } finally {
      setLoadingSaved(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSavedTransactions()
    }, 0)
    return () => window.clearTimeout(timer)
    // The selected date, supplier reference, and account determine both saved lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, supplierId, user?.id])

  const orderedKitchens = useMemo(
    () => [...kitchens].sort((a, b) => {
      const aSpecial = SPECIAL_KITCHENS.has(kitchenKey(a.name))
      const bSpecial = SPECIAL_KITCHENS.has(kitchenKey(b.name))
      if (aSpecial !== bSpecial) return aSpecial ? 1 : -1
      return a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
    }),
    [kitchens]
  )

  const totalRabInput = useMemo(
    () => Object.values(rabAmounts).reduce((total, value) => total + parseAmount(value), 0),
    [rabAmounts]
  )
  const totalOpsInput = useMemo(
    () => Object.values(opsAmounts).reduce((total, value) => total + parseAmount(value), 0),
    [opsAmounts]
  )

  function updateAmount(kind: RealKind, key: string, value: string) {
    const sanitized = value.replace(/[^0-9]/g, '')
    if (kind === 'rab') {
      setRabAmounts((current) => ({ ...current, [key]: sanitized }))
    } else {
      setOpsAmounts((current) => ({ ...current, [key]: sanitized }))
    }
  }

  async function handleSaveRab() {
    if (!user?.id || !supplierId || !date) {
      toastError('RAB - Real belum siap', supplierError || 'Referensi Koperasi Arutala belum tersedia.')
      return
    }

    const rows: Array<{
      line_number: number
      source_line_number: number
      kitchen_id: string
      kitchen_name: string
      amount: number
      raw_line: string
      source_type: 'umum' | 'cianjur' | 'cidaun'
      note: string
    }> = []

    for (const kitchen of orderedKitchens) {
      const special = SPECIAL_KITCHENS.has(kitchenKey(kitchen.name))
      const entries: Array<{ source: 'umum' | 'cianjur' | 'cidaun'; amount: number; note: string }> = []

      if (!special) {
        const amount = parseAmount(rabAmounts[kitchen.id] ?? '')
        if (amount > 0) entries.push({ source: 'umum', amount, note: 'Arutala Cianjur' })
      } else {
        const cianjurAmount = parseAmount(rabAmounts[kitchen.id + ':cianjur'] ?? '')
        const cidaunAmount = parseAmount(rabAmounts[kitchen.id + ':cidaun'] ?? '')
        if (cianjurAmount > 0) entries.push({ source: 'cianjur', amount: cianjurAmount, note: 'Arutala Cianjur' })
        if (cidaunAmount > 0) entries.push({ source: 'cidaun', amount: cidaunAmount, note: 'Arutala Cidaun' })
      }

      for (const entry of entries) {
        const line = rows.length + 1
        rows.push({
          line_number: line,
          source_line_number: line,
          kitchen_id: kitchen.id,
          kitchen_name: kitchen.name,
          amount: entry.amount,
          raw_line: kitchen.name + ' | ' + entry.note + ' | ' + entry.amount,
          source_type: entry.source,
          note: entry.note
        })
      }
    }

    if (rows.length === 0) {
      toastError('Belum ada nominal', 'Isi minimal satu nominal RAB - Real sebelum menyimpan.')
      return
    }

    setSavingRab(true)
    try {
      const sourceText = JSON.stringify({ owner_id: user.id, date, rows })
      const contentHash = await hashPayload(sourceText)
      const { data, error } = await supabase.rpc('save_koperasi_real_transactions', {
        p_content_hash: contentHash,
        p_transaction_date: date,
        p_source_text: sourceText,
        p_rows: rows
      })

      if (error) throw error

      const result = (data ?? {}) as { inserted_count?: number; total_amount?: number }
      success(
        'RAB - Real tersimpan',
        (result.inserted_count ?? rows.length) + ' transaksi berhasil disimpan · Rp ' +
          formatAmount(result.total_amount ?? totalRabInput)
      )
      setRabAmounts({})
      await loadSavedTransactions()
    } catch (saveFailure) {
      toastError('Gagal menyimpan RAB - Real', saveFailure instanceof Error ? saveFailure.message : 'Terjadi kesalahan.')
    } finally {
      setSavingRab(false)
    }
  }

  async function handleSaveOps() {
    if (!user?.id || !date) return

    const rows = buildKoperasiOpsRealRows(orderedKitchens, opsAmounts)
    if (rows.length === 0) {
      toastError('Belum ada nominal', 'Isi minimal satu nominal OPS - Real sebelum menyimpan.')
      return
    }

    setSavingOps(true)
    try {
      const sourceText = JSON.stringify({ owner_id: user.id, date, rows })
      const contentHash = await hashPayload(sourceText)
      const { data, error } = await supabase.rpc('save_koperasi_ops_real_transactions', {
        p_content_hash: contentHash,
        p_transaction_date: date,
        p_source_text: sourceText,
        p_rows: rows
      })

      if (error) throw error

      const result = (data ?? {}) as { inserted_count?: number; total_amount?: number }
      success(
        'OPS - Real tersimpan',
        (result.inserted_count ?? rows.length) + ' transaksi berhasil disimpan · Rp ' +
          formatAmount(result.total_amount ?? totalOpsInput)
      )
      setOpsAmounts({})
      await loadSavedTransactions()
    } catch (saveFailure) {
      toastError('Gagal menyimpan OPS - Real', saveFailure instanceof Error ? saveFailure.message : 'Terjadi kesalahan.')
    } finally {
      setSavingOps(false)
    }
  }

  function closeDeleteConfirm() {
    if (!confirmDelete) return
    setConfirmDeleteClosing(true)
    window.setTimeout(() => {
      setConfirmDelete(null)
      setConfirmDeleteClosing(false)
    }, 150)
  }

  function formatCopyDate(value: string) {
    const dateValue = new Date(value + 'T00:00:00')
    const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(dateValue)
    const day = String(dateValue.getDate()).padStart(2, '0')
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dateValue.getMonth()]
    return weekday.charAt(0).toUpperCase() + weekday.slice(1) + ', ' + day + '-' + month + '-' + dateValue.getFullYear()
  }

  async function copyDailyReport(rows: SavedTransaction[], kind: RealKind) {
    if (rows.length === 0 || copyingKind) return
    setCopyingKind(kind)

    try {
      const sortedRows = [...rows].sort((a, b) =>
        (a.kitchens?.name ?? '').localeCompare(b.kitchens?.name ?? '', 'id', { sensitivity: 'base' }) ||
        (a.note ?? '').localeCompare(b.note ?? '', 'id', { sensitivity: 'base' })
      )
      const lines = sortedRows.map((row) => {
        const kitchenName = row.kitchens?.name ?? 'Dapur'
        const special = SPECIAL_KITCHENS.has(kitchenKey(kitchenName))
        const source = row.note
          ?.replace(/^Koperasi Cianjur$/, 'Arutala Cianjur')
          .replace(/^Koperasi Cidaun$/, 'Arutala Cidaun')
          .replace(/^Koperasi Arutala$/, 'Arutala Cianjur')
        const label = special && source && source !== 'OPS - Real'
          ? kitchenName + ' - ' + source
          : kitchenName
        return label + ' - Rp ' + formatAmount(Number(row.amount))
      })

      const heading = kind === 'ops' ? 'Belanja Operasional Harian - ' : 'Belanja Harian - '
      const text = heading + formatCopyDate(date) + '\n\n' + lines.join('\n')

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const copiedText = document.execCommand('copy')
        textarea.remove()
        if (!copiedText) throw new Error('Browser tidak mengizinkan penyalinan otomatis.')
      }

      setCopiedKind(kind)
      success('Data berhasil disalin', sortedRows.length + ' transaksi tersalin dengan urutan A–Z.')
      window.setTimeout(() => setCopiedKind((current) => current === kind ? null : current), 1800)
    } catch (copyFailure) {
      toastError('Gagal menyalin data', copyFailure instanceof Error ? copyFailure.message : 'Browser tidak mengizinkan akses clipboard.')
    } finally {
      setCopyingKind(null)
    }
  }

  async function saveEdit(row: SavedTransaction, kind: RealKind) {
    const draft = editing[row.id]
    if (!draft || !user?.id) return
    const amount = parseAmount(draft.amount)

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      toastError('Nominal tidak valid', 'Nominal harus lebih besar dari nol.')
      return
    }

    setSavingEdit(row.id)
    try {
      const rpc = kind === 'ops'
        ? 'update_koperasi_ops_real_transaction'
        : 'update_koperasi_real_transaction'
      const { error } = await supabase.rpc(rpc, {
        p_transaction_id: row.id,
        p_amount: amount
      })
      if (error) throw error

      const updateRows = (current: SavedTransaction[]) =>
        current.map((item) => item.id === row.id ? { ...item, amount } : item)
      if (kind === 'ops') setSavedOps(updateRows)
      else setSavedRab(updateRows)

      setEditing((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
      success('Nominal diperbarui', 'Koreksi nominal berhasil disimpan.')
    } catch (saveFailure) {
      toastError('Gagal memperbarui transaksi', saveFailure instanceof Error ? saveFailure.message : 'Terjadi kesalahan.')
    } finally {
      setSavingEdit(null)
    }
  }

  async function deleteSavedTransaction(row: SavedTransaction, kind: RealKind) {
    setDeleting(row.id)
    try {
      const rpc = kind === 'ops'
        ? 'delete_koperasi_ops_real_transaction'
        : 'delete_koperasi_real_transaction'
      const { error } = await supabase.rpc(rpc, { p_transaction_id: row.id })
      if (error) throw error

      setRemoving(row.id)
      await new Promise((resolve) => window.setTimeout(resolve, 220))
      const updateRows = (current: SavedTransaction[]) => current.filter((item) => item.id !== row.id)
      if (kind === 'ops') setSavedOps(updateRows)
      else setSavedRab(updateRows)

      setEditing((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
      setConfirmDelete(null)
      setConfirmDeleteClosing(false)
      success('Transaksi dihapus', 'Transaksi dikeluarkan dari perhitungan.')
      void loadSavedTransactions()
    } catch (deleteFailure) {
      toastError('Gagal menghapus transaksi', deleteFailure instanceof Error ? deleteFailure.message : 'Terjadi kesalahan.')
      setConfirmDelete(null)
      setConfirmDeleteClosing(false)
    } finally {
      setDeleting(null)
    }
  }

  function renderSavedPanel(rows: SavedTransaction[], kind: RealKind) {
    const isOps = kind === 'ops'
    const title = isOps ? 'RIWAYAT OPS - REAL' : 'RIWAYAT RAB - REAL'
    const total = rows.reduce((sum, row) => sum + Number(row.amount), 0)
    const isCopying = copyingKind === kind
    const isCopied = copiedKind === kind

    return (
      <section className={'koperasi-real-panel koperasi-real-history-panel ' + (isOps ? 'is-ops' : 'is-rab')}>
        <div className="koperasi-real-panel-head koperasi-real-history-head">
          <div>
            <span className="koperasi-real-section-label">{title}</span>
            <h3>{isOps ? 'Belanja Operasional Harian Real' : 'Belanja RAB Harian Real'}</h3>
          </div>
          <div className="koperasi-real-saved-head-actions">
            <div className="koperasi-real-saved-total">
              <span>Total</span>
              <strong>Rp {formatAmount(total)}</strong>
            </div>
            <button
              type="button"
              className="koperasi-real-copy-button"
              onClick={() => void copyDailyReport(rows, kind)}
              disabled={rows.length === 0 || loadingSaved || Boolean(copyingKind)}
              title={isOps ? 'Salin laporan OPS - Real' : 'Salin laporan RAB - Real'}
            >
              {isCopying ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : isCopied ? <CheckCheck aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {isCopied ? 'Tersalin' : isCopying ? 'Menyalin…' : 'Copy'}
            </button>
          </div>
        </div>

        {loadingSaved ? (
          <p className="koperasi-real-muted">Memuat transaksi…</p>
        ) : rows.length === 0 ? (
          <p className="koperasi-real-empty">
            Belum ada transaksi {isOps ? 'OPS - Real.' : 'RAB - Real.'}
          </p>
        ) : (
          <div className="koperasi-real-saved-list">
            {rows.map((row) => {
              const draft = editing[row.id]
              const sourceLabel = isOps
                ? row.note === 'Arutala Cianjur' || row.note === 'Arutala Cidaun'
                  ? row.note
                  : 'OPS - Real'
                : row.note?.replace(/^Koperasi Cianjur$/, 'Arutala Cianjur')
                  .replace(/^Koperasi Cidaun$/, 'Arutala Cidaun')
                  .replace(/^Koperasi Arutala$/, 'Arutala Cianjur') ?? 'Arutala Cianjur'

              return (
                <article
                  className={'koperasi-real-saved-row' + (removing === row.id ? ' is-removing' : '')}
                  key={row.id}
                >
                  <div className="koperasi-real-saved-kitchen">
                    <strong>{row.kitchens?.name ?? 'Dapur'}</strong>
                    <span>{sourceLabel}</span>
                    <span className={'koperasi-real-creator-badge is-' + row.creator_role}>
                      Input oleh {row.creator_role === 'admin' ? 'Admin' : 'Koperasi'}
                    </span>
                  </div>

                  {draft ? (
                    <div className="koperasi-real-edit-fields">
                      <label>
                        <span>Nominal (Rp)</span>
                        <input
                          inputMode="numeric"
                          value={formatAmountInput(draft.amount)}
                          onChange={(event) => setEditing((current) => ({
                            ...current,
                            [row.id]: { amount: event.target.value.replace(/[^0-9]/g, '') }
                          }))}
                        />
                      </label>
                      <button
                        type="button"
                        className="koperasi-real-icon-button is-primary-action"
                        onClick={() => void saveEdit(row, kind)}
                        disabled={savingEdit === row.id || Boolean(savingEdit)}
                        aria-label="Simpan nominal"
                        title="Simpan nominal"
                      >
                        {savingEdit === row.id ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Check aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        className="koperasi-real-icon-button"
                        onClick={() => setEditing((current) => {
                          const next = { ...current }
                          delete next[row.id]
                          return next
                        })}
                        disabled={savingEdit === row.id}
                        aria-label="Batal edit"
                        title="Batal edit"
                      >
                        <X aria-hidden="true" />
                      </button>
                    </div>
                  ) : row.created_by === user?.id && row.creator_role === 'koperasi' ? (
                    <>
                      <div className="koperasi-real-saved-actions">
                        <strong>Rp {formatAmount(Number(row.amount))}</strong>
                        <button
                          type="button"
                          className="koperasi-real-icon-button"
                          onClick={() => {
                            setConfirmDelete(null)
                            setEditing((current) => ({ ...current, [row.id]: { amount: String(row.amount) } }))
                          }}
                          disabled={Boolean(deleting) || confirmDelete === row.id}
                          aria-label="Edit nominal"
                          title="Edit nominal"
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="koperasi-real-icon-button is-danger-action"
                          onClick={() => {
                            setEditing((current) => {
                              const next = { ...current }
                              delete next[row.id]
                              return next
                            })
                            setConfirmDelete(row.id)
                          }}
                          disabled={Boolean(deleting) || confirmDelete === row.id}
                          aria-label="Hapus transaksi"
                          title="Hapus transaksi"
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                      {confirmDelete === row.id ? (
                        <div
                          className={'koperasi-real-delete-confirm' + (confirmDeleteClosing ? ' is-closing' : '')}
                          role="group"
                          aria-label="Konfirmasi hapus transaksi"
                        >
                          <span>Hapus transaksi ini?</span>
                          <button
                            type="button"
                            className="koperasi-real-delete-cancel"
                            onClick={closeDeleteConfirm}
                            disabled={Boolean(deleting)}
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            className="koperasi-real-delete-accept"
                            onClick={() => void deleteSavedTransaction(row, kind)}
                            disabled={Boolean(deleting)}
                          >
                            {deleting === row.id ? <><LoaderCircle className="is-spinning" aria-hidden="true" /> Menghapus…</> : 'Ya, hapus'}
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="koperasi-real-saved-actions">
                      <strong>Rp {formatAmount(Number(row.amount))}</strong>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="koperasi-real-page">
      <section className="koperasi-real-panel koperasi-real-date-panel">
        <label className="koperasi-real-date">
          <span>Tanggal</span>
          <input
            type="date"
            value={date}
            onClick={(event) => {
              try { event.currentTarget.showPicker() } catch { /* Native picker may already be open. */ }
            }}
            onChange={(event) => {
              setDate(event.target.value)
              setRabAmounts({})
              setOpsAmounts({})
            }}
          />
        </label>
      </section>

      {loadError ? <p className="koperasi-real-error" role="alert">{loadError}</p> : null}

      <div className="koperasi-real-input-grid">
        <section className="koperasi-real-panel koperasi-real-input-panel is-rab">
          <div className="koperasi-real-panel-head">
            <div>
              <span className="koperasi-real-section-label">INPUT RAB - REAL</span>
              <h3>Belanja RAB Harian Real</h3>
              <p>Realisasi belanja supplier ke Koperasi Arutala.</p>
            </div>
          </div>

          {supplierError ? <p className="koperasi-real-inline-warning" role="status">{supplierError}</p> : null}
          {loadError ? null : loading ? (
            <p className="koperasi-real-muted">Memuat daftar dapur…</p>
          ) : (
            <div className="koperasi-real-kitchen-list">
              {orderedKitchens.map((kitchen) => {
                const special = SPECIAL_KITCHENS.has(kitchenKey(kitchen.name))
                return (
                  <article className="koperasi-real-kitchen" key={kitchen.id}>
                    <div className="koperasi-real-kitchen-name">
                      <strong>{kitchen.name}</strong>
                    </div>
                    {special ? (
                      <div className="koperasi-real-kitchen-fields koperasi-real-special">
                        <label>
                          <span>Arutala Cianjur (Rp)</span>
                          <input
                            inputMode="numeric"
                            value={formatAmountInput(rabAmounts[kitchen.id + ':cianjur'] ?? '')}
                            onChange={(event) => updateAmount('rab', kitchen.id + ':cianjur', event.target.value)}
                            placeholder="0"
                          />
                        </label>
                        <label>
                          <span>Arutala Cidaun (Rp)</span>
                          <input
                            inputMode="numeric"
                            value={formatAmountInput(rabAmounts[kitchen.id + ':cidaun'] ?? '')}
                            onChange={(event) => updateAmount('rab', kitchen.id + ':cidaun', event.target.value)}
                            placeholder="0"
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="koperasi-real-single-amount">
                        <span>Nominal (Rp)</span>
                        <input
                          inputMode="numeric"
                          value={formatAmountInput(rabAmounts[kitchen.id] ?? '')}
                          onChange={(event) => updateAmount('rab', kitchen.id, event.target.value)}
                          placeholder="0"
                        />
                      </label>
                    )}
                  </article>
                )
              })}
            </div>
          )}

          <div className="koperasi-real-savebar">
            <div><span>Total RAB - Real</span><strong>Rp {formatAmount(totalRabInput)}</strong></div>
            <button
              type="button"
              className="maker-import-primary"
              onClick={() => void handleSaveRab()}
              disabled={loading || savingRab || Boolean(loadError) || !supplierId || !date}
            >
              {savingRab ? <><LoaderCircle className="is-spinning" /> Menyimpan…</> : <><Save aria-hidden="true" /> Simpan RAB - Real</>}
            </button>
          </div>
        </section>

        <section className="koperasi-real-panel koperasi-real-input-panel is-ops">
          <div className="koperasi-real-panel-head">
            <div>
              <span className="koperasi-real-section-label">INPUT OPS - REAL</span>
              <h3>Belanja Operasional Harian Real</h3>
              <p>Realisasi belanja operasional harian ke Koperasi Arutala.</p>
            </div>
          </div>

          {loadError ? <p className="koperasi-real-error" role="alert">{loadError}</p> : loading ? (
            <p className="koperasi-real-muted">Memuat daftar dapur…</p>
          ) : (
            <div className="koperasi-real-kitchen-list">
              {orderedKitchens.map((kitchen) => {
                const special = SPECIAL_KITCHENS.has(kitchenKey(kitchen.name))
                return (
                  <article className="koperasi-real-kitchen koperasi-real-kitchen-ops" key={kitchen.id}>
                    <div className="koperasi-real-kitchen-name">
                      <strong>{kitchen.name}</strong>
                    </div>
                    {special ? (
                      <div className="koperasi-real-kitchen-fields koperasi-real-special">
                        <label>
                          <span>Arutala Cianjur (Rp)</span>
                          <input
                            inputMode="numeric"
                            value={formatAmountInput(opsAmounts[kitchen.id + ':cianjur'] ?? '')}
                            onChange={(event) => updateAmount('ops', kitchen.id + ':cianjur', event.target.value)}
                            placeholder="0"
                          />
                        </label>
                        <label>
                          <span>Arutala Cidaun (Rp)</span>
                          <input
                            inputMode="numeric"
                            value={formatAmountInput(opsAmounts[kitchen.id + ':cidaun'] ?? '')}
                            onChange={(event) => updateAmount('ops', kitchen.id + ':cidaun', event.target.value)}
                            placeholder="0"
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="koperasi-real-single-amount">
                        <span>Nominal (Rp)</span>
                        <input
                          inputMode="numeric"
                          value={formatAmountInput(opsAmounts[kitchen.id] ?? '')}
                          onChange={(event) => updateAmount('ops', kitchen.id, event.target.value)}
                          placeholder="0"
                        />
                      </label>
                    )}
                  </article>
                )
              })}
            </div>
          )}

          <div className="koperasi-real-savebar">
            <div><span>Total OPS - Real</span><strong>Rp {formatAmount(totalOpsInput)}</strong></div>
            <button
              type="button"
              className="maker-import-primary"
              onClick={() => void handleSaveOps()}
              disabled={loading || savingOps || Boolean(loadError) || !date}
            >
              {savingOps ? <><LoaderCircle className="is-spinning" /> Menyimpan…</> : <><Save aria-hidden="true" /> Simpan OPS - Real</>}
            </button>
          </div>
        </section>
      </div>

      <div className="koperasi-real-history-grid">
        {renderSavedPanel(savedRab, 'rab')}
        {renderSavedPanel(savedOps, 'ops')}
      </div>
    </section>
  )
}
