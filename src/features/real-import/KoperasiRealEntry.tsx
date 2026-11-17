import { useEffect, useMemo, useState } from 'react'
import { Check, LoaderCircle, Pencil, Save, Wallet } from 'lucide-react'

import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import { supabase } from '@/lib/supabase'

type Kitchen = { id: string; name: string }
type Origin = '' | 'cianjur' | 'cidaun' | 'both'
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
const ORIGIN_LABELS = {
  cianjur: 'Arutala Cianjur',
  cidaun: 'Arutala Cidaun',
  umum: 'Koperasi Arutala'
} as const

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
  const [origins, setOrigins] = useState<Record<string, Origin>>({})
  const [saved, setSaved] = useState<SavedTransaction[]>([])
  const [editing, setEditing] = useState<Record<string, { amount: string; note: string }>>({})
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
        setOrigins(
          Object.fromEntries(
            (kitchenResult.data ?? [])
              .filter((kitchen) => SPECIAL_KITCHENS.has(kitchenKey(kitchen.name)))
              .map((kitchen) => [kitchen.id, ''] as const)
          )
        )
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
    void loadSavedTransactions()
    // loadSavedTransactions is intentionally keyed to the selected day and resolved supplier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, supplierId, user?.id])

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

    for (const kitchen of kitchens) {
      const special = SPECIAL_KITCHENS.has(kitchenKey(kitchen.name))
      const origin = origins[kitchen.id] ?? ''
      if (special && !origin && (parseAmount(amounts[kitchen.id + ':cianjur'] ?? '') > 0 || parseAmount(amounts[kitchen.id + ':cidaun'] ?? '') > 0)) {
        toastError('Asal koperasi belum dipilih', 'Pilih asal Arutala untuk ' + kitchen.name + '.')
        return
      }
      const entries: Array<{ source: 'umum' | 'cianjur' | 'cidaun'; amount: number; note: string }> = []
      if (!special) {
        const amount = parseAmount(amounts[kitchen.id] ?? '')
        if (amount > 0) entries.push({ source: 'umum', amount, note: 'Belanja Harian Koperasi Arutala' })
      } else {
        if (origin === 'cianjur' || origin === 'both') {
          const amount = parseAmount(amounts[kitchen.id + ':cianjur'] ?? '')
          if (amount > 0) entries.push({ source: 'cianjur', amount, note: 'Koperasi Cianjur' })
        }
        if (origin === 'cidaun' || origin === 'both') {
          const amount = parseAmount(amounts[kitchen.id + ':cidaun'] ?? '')
          if (amount > 0) entries.push({ source: 'cidaun', amount, note: 'Koperasi Cidaun' })
        }
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
      const { error } = await supabase
        .from('transactions')
        .update({ amount, note: draft.note.trim() || null })
        .eq('id', row.id)
        .eq('created_by', user.id)
      if (error) throw error
      success('Transaksi diperbarui', 'Koreksi nominal/catatan berhasil disimpan.')
      await loadSavedTransactions()
    } catch (saveFailure) {
      toastError('Gagal memperbarui transaksi', saveFailure instanceof Error ? saveFailure.message : 'Terjadi kesalahan.')
    }
  }

  return (
    <section className="koperasi-real-page">
      <header className="koperasi-real-hero">
        <span className="koperasi-real-hero-icon"><Wallet aria-hidden="true" /></span>
        <div>
          <p>TRANSAKSI KOPERASI</p>
          <h2>Belanja Harian Real</h2>
          <span>Input realisasi belanja per dapur. Data langsung masuk ke transaksi Real SIM-SPPG.</span>
        </div>
      </header>

      <section className="koperasi-real-panel">
        <div className="koperasi-real-panel-head">
          <div>
            <span>INPUT HARIAN</span>
            <h3>Nominal belanja per dapur</h3>
            <p>Pilih tanggal, lalu isi nominal pada dapur yang memiliki transaksi.</p>
          </div>
          <label className="koperasi-real-date">
            <span>Tanggal transaksi</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>

        {loadError ? <p className="koperasi-real-error" role="alert">{loadError}</p> : null}
        {loading ? <p className="koperasi-real-muted">Memuat daftar dapur…</p> : (
          <div className="koperasi-real-kitchen-list">
            {kitchens.map((kitchen) => {
              const special = SPECIAL_KITCHENS.has(kitchenKey(kitchen.name))
              const origin = origins[kitchen.id] ?? ''
              return (
                <article className="koperasi-real-kitchen" key={kitchen.id}>
                  <div className="koperasi-real-kitchen-name">
                    <strong>{kitchen.name}</strong>
                    {special ? <span>Asal koperasi dipilih per transaksi</span> : <span>Belanja harian</span>}
                  </div>
                  {special ? (
                    <div className="koperasi-real-kitchen-fields koperasi-real-special">
                      <label>
                        <span>Asal koperasi</span>
                        <select value={origin} onChange={(event) => setOrigins((current) => ({ ...current, [kitchen.id]: event.target.value as Origin }))}>
                          <option value="">Pilih asal</option>
                          <option value="cianjur">Arutala Cianjur</option>
                          <option value="cidaun">Arutala Cidaun</option>
                          <option value="both">Keduanya</option>
                        </select>
                      </label>
                      {(origin === 'cianjur' || origin === 'both') ? (
                        <label>
                          <span>Nominal Arutala Cianjur (Rp)</span>
                          <input inputMode="numeric" value={amounts[kitchen.id + ':cianjur'] ?? ''} onChange={(event) => updateAmount(kitchen.id + ':cianjur', event.target.value)} placeholder="0" />
                        </label>
                      ) : null}
                      {(origin === 'cidaun' || origin === 'both') ? (
                        <label>
                          <span>Nominal Arutala Cidaun (Rp)</span>
                          <input inputMode="numeric" value={amounts[kitchen.id + ':cidaun'] ?? ''} onChange={(event) => updateAmount(kitchen.id + ':cidaun', event.target.value)} placeholder="0" />
                        </label>
                      ) : null}
                    </div>
                  ) : (
                    <label className="koperasi-real-single-amount">
                      <span>Nominal (Rp)</span>
                      <input inputMode="numeric" value={amounts[kitchen.id] ?? ''} onChange={(event) => updateAmount(kitchen.id, event.target.value)} placeholder="0" />
                    </label>
                  )}
                </article>
              )
            })}
          </div>
        )}

        <div className="koperasi-real-savebar">
          <div><span>Total input</span><strong>Rp {formatAmount(totalInput)}</strong></div>
          <button type="button" className="maker-import-primary" onClick={() => void handleSave()} disabled={loading || saving || Boolean(loadError) || !supplierId}>
            {saving ? <><LoaderCircle className="is-spinning" /> Menyimpan…</> : <><Save aria-hidden="true" /> Simpan transaksi</>}
          </button>
        </div>
      </section>

      <section className="koperasi-real-panel">
        <div className="koperasi-real-panel-head">
          <div>
            <span>RIWAYAT HARI INI</span>
            <h3>Transaksi yang sudah dicatat</h3>
            <p>Hanya menampilkan transaksi yang dibuat oleh akun Koperasi ini pada tanggal terpilih. Koreksi nominal atau catatan jika ada salah input.</p>
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
                <article className="koperasi-real-saved-row" key={row.id}>
                  <div className="koperasi-real-saved-kitchen">
                    <strong>{row.kitchens?.name ?? 'Dapur'}</strong>
                    <span>{row.note ?? 'Belanja Harian Koperasi'}</span>
                  </div>
                  {draft ? (
                    <div className="koperasi-real-edit-fields">
                      <label><span>Nominal (Rp)</span><input inputMode="numeric" value={draft.amount} onChange={(event) => setEditing((current) => ({ ...current, [row.id]: { ...draft, amount: event.target.value.replace(/[^0-9]/g, '') } }))} /></label>
                      <label><span>Catatan</span><input value={draft.note} onChange={(event) => setEditing((current) => ({ ...current, [row.id]: { ...draft, note: event.target.value } }))} /></label>
                      <button type="button" className="koperasi-real-icon-button" onClick={() => void saveEdit(row)} aria-label="Simpan koreksi"><Check aria-hidden="true" /></button>
                    </div>
                  ) : (
                    <div className="koperasi-real-saved-actions">
                      <strong>Rp {formatAmount(Number(row.amount))}</strong>
                      <button type="button" className="koperasi-real-icon-button" onClick={() => setEditing((current) => ({ ...current, [row.id]: { amount: String(row.amount), note: row.note ?? '' } }))} aria-label="Edit transaksi"><Pencil aria-hidden="true" /></button>
                    </div>
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
