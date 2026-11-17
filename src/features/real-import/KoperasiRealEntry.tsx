import { useEffect, useMemo, useState } from 'react'
import { Check, LoaderCircle, Pencil, Save, Trash2, X } from 'lucide-react'

import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import { supabase } from '@/lib/supabase'
import '@/styles/koperasi-real-entry.css'

type Kitchen = { id: string; name: string }
type SavedTransaction = {
  id: string
  transaction_date: string
  kitchen_id: string
  amount: number
  note: string | null
  real_import_batch_id: string | null
  kitchens: { name: string } | null
}

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
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<SavedTransaction[]>([])
  const [editing, setEditing] = useState<Record<string, { amount: string }>>({})
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadReferences() {
      setLoading(true)
      setLoadError('')
      try {
        const [kitchenResult, supplierResult] = await Promise.all([
          supabase.from('kitchens').select('id,name').eq('is_active', true).order('name'),
          supabase.from('suppliers').select('id,name').eq('is_active', true).ilike('name', 'Koperasi Arutala')
        ])
        if (kitchenResult.error) throw kitchenResult.error
        if (supplierResult.error) throw supplierResult.error
        const supplier = (supplierResult.data ?? []).find(
          (item) => kitchenKey(item.name) === 'koperasi arutala'
        )
        if (!supplier) throw new Error('Supplier Koperasi Arutala tidak ditemukan atau tidak aktif.')
        if (cancelled) return
        setKitchens((kitchenResult.data ?? []) as Kitchen[])
        setSupplierId(supplier.id)
      } catch (loadFailure) {
        if (!cancelled) setLoadError(loadFailure instanceof Error ? loadFailure.message : 'Gagal memuat referensi dapur.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadReferences()
    return () => { cancelled = true }
  }, [])

  async function loadSavedTransactions() {
    if (!supplierId || !user?.id || !date) return
    setLoadingSaved(true)
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('id,transaction_date,kitchen_id,amount,note,real_import_batch_id,kitchens(name)')
        .eq('transaction_date', date)
        .eq('created_by', user.id)
        .eq('supplier_id', supplierId)
        .eq('flow_type', 'expense')
        .eq('category', 'Supplier')
        .not('real_import_batch_id', 'is', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      setSaved((data ?? []) as unknown as SavedTransaction[])
      setEditing({})
    } catch (loadFailure) {
      toastError('Gagal memuat data tersimpan', loadFailure instanceof Error ? loadFailure.message : 'Terjadi kesalahan.')
    } finally {
      setLoadingSaved(false)
    }
  }

  useEffect(() => {
    // Defer the request so its loading-state update occurs outside the effect body.
    const timer = window.setTimeout(() => {
      void loadSavedTransactions()
    }, 0)
    return () => window.clearTimeout(timer)
    // loadSavedTransactions is intentionally keyed to the selected day and resolved supplier.
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

  const totalInput = useMemo(
    () => Object.values(amounts).reduce((total, value) => total + parseAmount(value), 0),
    [amounts]
  )
  const totalSaved = useMemo(
    () => saved.reduce((total, row) => total + Number(row.amount), 0),
    [saved]
  )

  function updateAmount(key: string, value: string) {
    setAmounts((current) => ({ ...current, [key]: value.replace(/[^0-9]/g, '') }))
  }

  async function handleSave() {
    if (!user?.id || !supplierId || !date) return
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
        const amount = parseAmount(amounts[kitchen.id] ?? '')
        if (amount > 0) entries.push({ source: 'umum', amount, note: 'Arutala Cianjur' })
      } else {
        const cianjurAmount = parseAmount(amounts[kitchen.id + ':cianjur'] ?? '')
        const cidaunAmount = parseAmount(amounts[kitchen.id + ':cidaun'] ?? '')
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
      toastError('Belum ada nominal', 'Isi minimal satu nominal belanja sebelum menyimpan.')
      return
    }

    setSaving(true)
    try {
      const sourceText = JSON.stringify({ date, rows })
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
        'Belanja Harian Real tersimpan',
        (result.inserted_count ?? rows.length) + ' transaksi berhasil disimpan · Rp ' +
          formatAmount(result.total_amount ?? totalInput)
      )
      setAmounts({})
      await loadSavedTransactions()
    } catch (saveFailure) {
      toastError('Gagal menyimpan transaksi', saveFailure instanceof Error ? saveFailure.message : 'Terjadi kesalahan.')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(row: SavedTransaction) {
    const draft = editing[row.id]
    if (!draft || !user?.id) return
    const amount = parseAmount(draft.amount)
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      toastError('Nominal tidak valid', 'Nominal harus lebih besar dari nol.')
      return
    }
    try {
      const { error } = await supabase.rpc('update_koperasi_real_transaction', {
        p_transaction_id: row.id,
        p_amount: amount,
      })
      if (error) throw error
      success('Nominal diperbarui', 'Koreksi nominal berhasil disimpan.')
      await loadSavedTransactions()
    } catch (saveFailure) {
      toastError('Gagal memperbarui transaksi', saveFailure instanceof Error ? saveFailure.message : 'Terjadi kesalahan.')
    }
  }

  async function deleteSavedTransaction(row: SavedTransaction) {
    setDeleting(row.id)
    try {
      const { error } = await supabase.rpc('delete_koperasi_real_transaction', { p_transaction_id: row.id })
      if (error) throw error
      setRemoving(row.id)
      await new Promise((resolve) => window.setTimeout(resolve, 220))
      setSaved((current) => current.filter((item) => item.id !== row.id))
      setEditing((current) => { const next = { ...current }; delete next[row.id]; return next })
      setConfirmDelete(null)
      success('Transaksi dihapus', 'Transaksi dikeluarkan dari perhitungan.')
      void loadSavedTransactions()
    } catch (deleteFailure) {
      toastError('Gagal menghapus transaksi', deleteFailure instanceof Error ? deleteFailure.message : 'Terjadi kesalahan.')
      setConfirmDelete(null)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <section className="koperasi-real-page">
      <section className="koperasi-real-panel">
        <div className="koperasi-real-panel-head koperasi-real-input-head">
          <span className="koperasi-real-section-label">INPUT HARIAN</span>
          <label className="koperasi-real-date">
            <span>Tanggal transaksi</span>
            <input
              type="date"
              value={date}
              onClick={(event) => {
                try { event.currentTarget.showPicker() } catch { /* Native picker may already be open. */ }
              }}
              onChange={(event) => {
                setDate(event.target.value)
                setAmounts({})
              }}
            />
          </label>
        </div>

        {loadError ? <p className="koperasi-real-error" role="alert">{loadError}</p> : null}
        {loading ? <p className="koperasi-real-muted">Memuat daftar dapur…</p> : (
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
                        <input inputMode="numeric" value={formatAmountInput(amounts[kitchen.id + ':cianjur'] ?? '')} onChange={(event) => updateAmount(kitchen.id + ':cianjur', event.target.value)} placeholder="0" />
                      </label>
                      <label>
                        <span>Arutala Cidaun (Rp)</span>
                        <input inputMode="numeric" value={formatAmountInput(amounts[kitchen.id + ':cidaun'] ?? '')} onChange={(event) => updateAmount(kitchen.id + ':cidaun', event.target.value)} placeholder="0" />
                      </label>
                    </div>
                  ) : (
                    <label className="koperasi-real-single-amount">
                      <span>Nominal (Rp)</span>
                      <input inputMode="numeric" value={formatAmountInput(amounts[kitchen.id] ?? '')} onChange={(event) => updateAmount(kitchen.id, event.target.value)} placeholder="0" />
                    </label>
                  )}
                </article>
              )
            })}
          </div>
        )}

        <div className="koperasi-real-savebar">
          <div><span>Total input</span><strong>Rp {formatAmount(totalInput)}</strong></div>
          <button type="button" className="maker-import-primary" onClick={() => void handleSave()} disabled={loading || saving || Boolean(loadError) || !supplierId || !date}>
            {saving ? <><LoaderCircle className="is-spinning" /> Menyimpan…</> : <><Save aria-hidden="true" /> Simpan transaksi</>}
          </button>
        </div>
      </section>

      <section className="koperasi-real-panel">
        <div className="koperasi-real-panel-head">
          <div>
            <span>RIWAYAT TANGGAL DIPILIH</span>
            <h3>Transaksi yang sudah dicatat</h3>
            <p>Hanya menampilkan transaksi yang dibuat oleh akun Koperasi ini pada tanggal terpilih. Anda dapat mengoreksi nominal atau menghapus transaksi yang salah input.</p>
          </div>
          <div className="koperasi-real-saved-total"><span>Total tersimpan</span><strong>Rp {formatAmount(totalSaved)}</strong></div>
        </div>
        {loadingSaved ? <p className="koperasi-real-muted">Memuat transaksi…</p> : saved.length === 0 ? (
          <p className="koperasi-real-empty">Belum ada transaksi Koperasi yang dicatat pada tanggal ini.</p>
        ) : (
          <div className="koperasi-real-saved-list">
            {saved.map((row) => {
              const draft = editing[row.id]
              return (
                <article className={'koperasi-real-saved-row' + (removing === row.id ? ' is-removing' : '')} key={row.id}>
                  <div className="koperasi-real-saved-kitchen">
                    <strong>{row.kitchens?.name ?? 'Dapur'}</strong>
                    <span>{row.note?.replace(/^Koperasi Cianjur$/, 'Arutala Cianjur').replace(/^Koperasi Cidaun$/, 'Arutala Cidaun').replace(/^Koperasi Arutala$/, 'Arutala Cianjur') ?? 'Arutala Cianjur'}</span>
                  </div>
                  {draft ? (
                    <div className="koperasi-real-edit-fields">
                      <label><span>Nominal (Rp)</span><input inputMode="numeric" value={formatAmountInput(draft.amount)} onChange={(event) => setEditing((current) => ({ ...current, [row.id]: { amount: event.target.value.replace(/[^0-9]/g, '') } }))} /></label>
                      <button type="button" className="koperasi-real-icon-button is-primary-action" onClick={() => void saveEdit(row)} aria-label="Simpan nominal" title="Simpan nominal"><Check aria-hidden="true" /></button>
                      <button type="button" className="koperasi-real-icon-button" onClick={() => setEditing((current) => { const next = { ...current }; delete next[row.id]; return next })} aria-label="Batal edit" title="Batal edit"><X aria-hidden="true" /></button>
                    </div>
                  ) : (
                    <>
                      <div className="koperasi-real-saved-actions">
                        <strong>Rp {formatAmount(Number(row.amount))}</strong>
                        <button type="button" className="koperasi-real-icon-button" onClick={() => { setConfirmDelete(null); setEditing((current) => ({ ...current, [row.id]: { amount: String(row.amount) } })) }} disabled={Boolean(deleting) || confirmDelete === row.id} aria-label="Edit nominal" title="Edit nominal"><Pencil aria-hidden="true" /></button>
                        <button type="button" className="koperasi-real-icon-button is-danger-action" onClick={() => { setEditing((current) => { const next = { ...current }; delete next[row.id]; return next }); setConfirmDelete(row.id) }} disabled={Boolean(deleting) || confirmDelete === row.id} aria-label="Hapus transaksi" title="Hapus transaksi"><Trash2 aria-hidden="true" /></button>
                      </div>
                      {confirmDelete === row.id ? (
                        <div className="koperasi-real-delete-confirm" role="group" aria-label="Konfirmasi hapus transaksi">
                          <span>Hapus transaksi ini?</span>
                          <button type="button" className="koperasi-real-delete-cancel" onClick={() => setConfirmDelete(null)} disabled={Boolean(deleting)}>Batal</button>
                          <button type="button" className="koperasi-real-delete-accept" onClick={() => void deleteSavedTransaction(row)} disabled={Boolean(deleting)}>
                            {deleting === row.id ? <><LoaderCircle className="is-spinning" aria-hidden="true" /> Menghapus…</> : 'Ya, hapus'}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </section>
  )
}
