import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardPaste, Database, FileCheck2, LoaderCircle, PlusCircle, RotateCcw, ShieldAlert, Upload } from 'lucide-react'
import { ImportConfirmationDialog } from '@/components/ui/import-confirmation-dialog'
import { useToast } from '@/features/ui/toast-context'
import {
  formatRealImportAmount,
  parseRealImportDocument,
  type RealImportDraftRow,
  type RealImportSource
} from '@/features/real-import/real-import-utils'
import { supabase } from '@/lib/supabase'
import '@/styles/maker-import.css'
import '@/styles/real-import.css'

type KitchenRef = { id: string; name: string }
type SupplierRef = { id: string; name: string }
type DraftRealRow = RealImportDraftRow & {
  id: string
  kitchenId: string
  note: string
  disposition: 'import' | 'excluded'
  exclusionReason: string
}

type ExistingTransaction = {
  id: string
  kitchen_id: string | null
  amount: number | string
}

type ImportAuditRow = {
  transaction_id: string | null
  source_type: RealImportSource
}

const moneyFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

function hashText(text: string): Promise<string> {
  return crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text.replace(/\r\n?/g, '\n').trim())
  ).then((digest) =>
    Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  )
}

function sourceLabel(source: RealImportSource): string {
  return source === 'cianjur' ? 'Cianjur' : 'Cidaun'
}

function kitchenKey(value: string): string {
  return value.normalize('NFKD').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
}

export function RealImportPage() {
  const { success: toastSuccess, error: toastError } = useToast()
  const [sourceType, setSourceType] = useState<RealImportSource>('cianjur')
  const [sourceText, setSourceText] = useState('')
  const [kitchens, setKitchens] = useState<KitchenRef[]>([])
  const [supplier, setSupplier] = useState<SupplierRef | null>(null)
  const [loadingReferences, setLoadingReferences] = useState(true)
  const [referencesError, setReferencesError] = useState('')
  const [parseError, setParseError] = useState('')
  const [draftReady, setDraftReady] = useState(false)
  const [transactionDate, setTransactionDate] = useState('')
  const [sourceTotal, setSourceTotal] = useState<number | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [rows, setRows] = useState<DraftRealRow[]>([])
  const [sourceHash, setSourceHash] = useState('')
  const [duplicateBatch, setDuplicateBatch] = useState(false)
  const [duplicateBatchMessage, setDuplicateBatchMessage] = useState('')
  const [duplicateReasons, setDuplicateReasons] = useState<Record<string, string>>({})
  const [duplicateCheckError, setDuplicateCheckError] = useState('')
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadReferences() {
      setLoadingReferences(true)
      setReferencesError('')
      try {
        const [kitchenResult, supplierResult] = await Promise.all([
          supabase.from('kitchens').select('id,name').eq('is_active', true).order('name'),
          supabase.from('suppliers').select('id,name').eq('is_active', true).ilike('name', 'Koperasi Arutala')
        ])
        if (kitchenResult.error) throw kitchenResult.error
        if (supplierResult.error) throw supplierResult.error
        if (cancelled) return
        setKitchens((kitchenResult.data ?? []) as KitchenRef[])
        const match = (supplierResult.data ?? []).find((item) => kitchenKey(item.name) === 'koperasi arutala')
        if (!match) throw new Error('Supplier aktif Koperasi Arutala tidak ditemukan.')
        setSupplier(match as SupplierRef)
      } catch (loadError) {
        if (!cancelled) setReferencesError(loadError instanceof Error ? loadError.message : 'Gagal memuat dapur dan supplier.')
      } finally {
        if (!cancelled) setLoadingReferences(false)
      }
    }
    void loadReferences()
    return () => { cancelled = true }
  }, [])

  const totalAmount = useMemo(() => rows.reduce((sum, row) => sum + row.amount, 0), [rows])
  const importedRows = useMemo(() => rows.filter((row) => row.disposition === 'import'), [rows])
  const excludedRows = useMemo(() => rows.filter((row) => row.disposition === 'excluded'), [rows])
  const importedTotal = useMemo(() => importedRows.reduce((sum, row) => sum + row.amount, 0), [importedRows])
  const excludedTotal = useMemo(() => excludedRows.reduce((sum, row) => sum + row.amount, 0), [excludedRows])
  const sourceTotalMismatch = sourceType === 'cidaun' && (sourceTotal === null || sourceTotal !== totalAmount)
  const unknownKitchenRows = rows.filter((row) => !row.kitchenId)
  const duplicateImportRows = importedRows.filter((row) => duplicateReasons[row.id])
  const canContinue = draftReady &&
    !loadingReferences &&
    !referencesError &&
    Boolean(supplier) &&
    Boolean(transactionDate) &&
    rows.length > 0 &&
    !parseError &&
    warnings.length === 0 &&
    unknownKitchenRows.length === 0 &&
    !sourceTotalMismatch &&
    !duplicateBatch &&
    !duplicateBatchMessage &&
    !duplicateCheckError &&
    !checkingDuplicates &&
    duplicateImportRows.length === 0 &&
    !saving

  useEffect(() => {
    if (!draftReady || !transactionDate || !supplier || rows.length === 0) {
      setDuplicateReasons({})
      setDuplicateCheckError('')
      setCheckingDuplicates(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setCheckingDuplicates(true)
      setDuplicateCheckError('')
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('id,kitchen_id,amount')
          .eq('transaction_date', transactionDate)
          .eq('flow_type', 'expense')
          .eq('category', 'Supplier')
          .eq('supplier_id', supplier.id)

        if (error) throw error
        const existing = (data ?? []) as ExistingTransaction[]
        const transactionIds = existing.map((item) => item.id)
        let auditRows: ImportAuditRow[] = []
        if (transactionIds.length > 0) {
          const { data: audits, error: auditError } = await supabase
            .from('real_import_batch_rows')
            .select('transaction_id,source_type')
            .in('transaction_id', transactionIds)
          if (auditError) throw auditError
          auditRows = (audits ?? []) as ImportAuditRow[]
        }

        const auditByTransaction = new Map<string, RealImportSource[]>()
        for (const audit of auditRows) {
          if (!audit.transaction_id) continue
          const sources = auditByTransaction.get(audit.transaction_id) ?? []
          sources.push(audit.source_type)
          auditByTransaction.set(audit.transaction_id, sources)
        }

        const reasons: Record<string, string> = {}
        for (const row of rows) {
          if (row.disposition !== 'import' || !row.kitchenId) continue
          const duplicates = existing.filter((item) =>
            item.kitchen_id === row.kitchenId && Number(item.amount) === row.amount
          )
          const blocking = duplicates.find((item) => {
            const sources = auditByTransaction.get(item.id) ?? []
            // Same-source or manually entered transactions block. A record audited
            // solely under the other report source is intentionally separate.
            return sources.length === 0 || sources.includes(sourceType) || sources.some((source) => source === sourceType)
          })
          if (blocking) {
            reasons[row.id] = 'Nominal, tanggal, dapur, dan supplier ini sudah ada. Baris tidak bisa disimpan dua kali.'
          }
        }

        const draftKeys = new Map<string, DraftRealRow>()
        for (const row of rows) {
          if (row.disposition !== 'import' || !row.kitchenId) continue
          const key = row.kitchenId + ':' + row.amount
          const prior = draftKeys.get(key)
          if (prior) {
            reasons[row.id] = 'Nominal ini berulang pada dapur yang sama di dokumen ini. Periksa atau keluarkan salah satu baris.'
            if (!reasons[prior.id]) {
              reasons[prior.id] = 'Nominal ini berulang pada dapur yang sama di dokumen ini. Periksa atau keluarkan salah satu baris.'
            }
          } else {
            draftKeys.set(key, row)
          }
        }

        if (!cancelled) setDuplicateReasons(reasons)
      } catch (checkError) {
        if (!cancelled) setDuplicateCheckError(checkError instanceof Error ? checkError.message : 'Gagal memeriksa transaksi duplikat.')
      } finally {
        if (!cancelled) setCheckingDuplicates(false)
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draftReady, transactionDate, supplier, sourceType, rows])

  function resetForm() {
    setSourceText('')
    setDraftReady(false)
    setTransactionDate('')
    setSourceTotal(null)
    setWarnings([])
    setRows([])
    setSourceHash('')
    setDuplicateBatch(false)
    setDuplicateBatchMessage('')
    setDuplicateReasons({})
    setDuplicateCheckError('')
    setParseError('')
    setSaveError('')
    setConfirmOpen(false)
  }

  async function handleParse() {
    setParseError('')
    setSaveError('')
    setDuplicateBatch(false)
    setDuplicateBatchMessage('')
    setDuplicateCheckError('')
    setDuplicateReasons({})
    const parsed = parseRealImportDocument(sourceType, sourceText)
    if (parsed.error || !parsed.transactionDate) {
      setDraftReady(false)
      setRows([])
      setParseError(parsed.error || 'Tanggal sumber tidak valid.')
      return
    }

    const mappedRows: DraftRealRow[] = parsed.rows.map((row) => {
      const kitchen = kitchens.find((item) => kitchenKey(item.name) === kitchenKey(row.kitchenName))
      return {
        ...row,
        id: sourceType + '-' + row.rowNumber,
        kitchenId: kitchen?.id ?? '',
        note: sourceType === 'cianjur' ? 'Belanja Cianjur' : 'Belanja Cidaun',
        disposition: 'import',
        exclusionReason: ''
      }
    })
    setCheckingDuplicates(true)
    setTransactionDate(parsed.transactionDate)
    setSourceTotal(parsed.sourceTotal)
    setWarnings(parsed.warnings)
    setRows(mappedRows)
    setDraftReady(true)

    try {
      const normalizedText = sourceText.replace(/\r\n?/g, '\n').trim()
      const hash = await hashText(normalizedText)
      setSourceHash(hash)
      const { data, error } = await supabase
        .from('real_import_batches')
        .select('id,created_at')
        .eq('source_type', sourceType)
        .eq('content_hash', hash)
        .maybeSingle()
      if (error) throw error
      if (data) {
        setDuplicateBatch(true)
        setDuplicateBatchMessage('Dokumen dari sumber ini sudah pernah diimpor. Batch tidak bisa disimpan ulang.')
      }
    } catch (checkError) {
      setDuplicateBatchMessage(checkError instanceof Error ? checkError.message : 'Gagal memeriksa riwayat batch.')
    }
  }

  function updateRow(id: string, patch: Partial<DraftRealRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
    setSaveError('')
  }

  function toggleExcluded(row: DraftRealRow) {
    const excluding = row.disposition === 'import'
    updateRow(row.id, {
      disposition: excluding ? 'excluded' : 'import',
      exclusionReason: excluding ? (duplicateReasons[row.id] || 'Dikeluarkan saat pemeriksaan Admin.') : ''
    })
  }

  function openConfirmation() {
    if (!canContinue) return
    setSaveError('')
    setConfirmOpen(true)
  }

  async function confirmSave() {
    if (!canContinue || !supplier || !sourceHash) return
    setSaving(true)
    setSaveError('')
    try {
      const payload = rows.map((row) => ({
        line_number: row.rowNumber,
        source_line_number: row.sourceLineNumber,
        kitchen_id: row.kitchenId,
        kitchen_name: kitchens.find((item) => item.id === row.kitchenId)?.name || row.kitchenName,
        amount: row.amount,
        raw_line: row.rawLine,
        note: row.note.trim() || 'Belanja ' + sourceLabel(sourceType),
        disposition: row.disposition,
        exclusion_reason: row.disposition === 'excluded' ? row.exclusionReason : null
      }))
      const { data, error } = await supabase.rpc('import_real_transactions', {
        p_source_type: sourceType,
        p_content_hash: sourceHash,
        p_transaction_date: transactionDate,
        p_source_text: sourceText.replace(/\r\n?/g, '\n').trim(),
        p_rows: payload
      })
      if (error) throw error
      const result = (data ?? {}) as {
        inserted_count?: number
        excluded_count?: number
        total_amount?: number
        excluded_total_amount?: number
        batch_id?: string
      }
      toastSuccess(
        'Import RAB / Real berhasil',
        (result.inserted_count ?? importedRows.length) + ' transaksi masuk (Rp ' +
        formatRealImportAmount(result.total_amount ?? importedTotal) + '); ' +
        (result.excluded_count ?? excludedRows.length) + ' baris masuk audit saja.'
      )
      setConfirmOpen(false)
      resetForm()
    } catch (saveFailure) {
      const message = saveFailure instanceof Error ? saveFailure.message : 'Gagal menyimpan batch RAB / Real.'
      setSaveError(message)
      setConfirmOpen(false)
      toastError('Import gagal', message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="real-import-page">
      <header className="maker-import-hero">
        <span className="maker-import-hero-icon"><ClipboardPaste aria-hidden="true" /></span>
        <div>
          <span className="maker-import-kicker">IMPORT TRANSAKSI</span>
          <h2>Import RAB / Real</h2>
          <p>Tempel laporan belanja dari Cianjur atau Cidaun, periksa draft, lalu simpan ke database.</p>
        </div>
      </header>

      <section className="maker-import-panel real-import-source-panel">
        <div className="maker-import-panel-head">
          <div>
            <span>LANGKAH 1</span>
            <h3>Input Data</h3>
            <p>Pilih format sumber sebelum menempel teks.</p>
          </div>
          <button className="maker-import-secondary" type="button" onClick={resetForm} disabled={saving}>
            <RotateCcw aria-hidden="true" /> Reset
          </button>
        </div>
        <div className="real-import-source-tools">
          <label>
            <span>Sumber laporan</span>
            <select value={sourceType} onChange={(event) => { setSourceType(event.target.value as RealImportSource); setDraftReady(false); setDuplicateBatch(false); }}>
              <option value="cianjur">Cianjur — Belanja Harian DD/MM/YYYY</option>
              <option value="cidaun">Cidaun — tanggal teks Bahasa Indonesia</option>
            </select>
          </label>
          <div className="real-import-fixed-supplier">
            <span>Supplier transaksi</span>
            <strong>{supplier?.name ?? 'Memuat supplier…'}</strong>
            <small>Semua dapur termasuk Sukaraharja menggunakan Koperasi Arutala untuk import ini.</small>
          </div>
        </div>
        <textarea
          className="maker-import-source"
          value={sourceText}
          onChange={(event) => { setSourceText(event.target.value); setDraftReady(false); setParseError(''); setSaveError(''); setDuplicateBatch(false); setDuplicateBatchMessage(''); }}
          placeholder={'Tempel laporan dari ' + sourceLabel(sourceType) + ' di sini…'}
          spellCheck={false}
        />
        <div className="maker-import-source-footer">
          <span>Format Cianjur menerima 12/10/2026; Cidaun menerima 12 oktober 2026. Baris dengan tanda + menjadi transaksi terpisah.</span>
          <button type="button" className="maker-import-primary" onClick={() => void handleParse()} disabled={loadingReferences || !supplier || !sourceText.trim()}>
            <ClipboardPaste aria-hidden="true" /> Baca &amp; buat preview
          </button>
        </div>
        {referencesError ? <div className="maker-import-message is-error"><AlertTriangle /> {referencesError}</div> : null}
        {parseError ? <div className="maker-import-message is-error"><AlertTriangle /> {parseError}</div> : null}
      </section>

      {draftReady ? (
        <section className="maker-import-panel real-import-preview-panel">
          <div className="maker-import-panel-head">
            <div>
              <span>LANGKAH 2</span>
              <h3>Periksa setiap transaksi</h3>
              <p>{sourceLabel(sourceType)} · {transactionDate} · {rows.length} transaksi hasil parsing</p>
            </div>
            <div className="maker-import-chip">{checkingDuplicates ? 'Memeriksa duplikat…' : duplicateImportRows.length ? 'Ada duplikat' : 'Draft diperiksa'}</div>
          </div>

          <div className="real-import-summary">
            <div><span>Transaksi masuk</span><strong>{importedRows.length}</strong><small>Rp {formatRealImportAmount(importedTotal)}</small></div>
            <div><span>Dikecualikan</span><strong>{excludedRows.length}</strong><small>Rp {formatRealImportAmount(excludedTotal)}</small></div>
            <div><span>Total sumber</span><strong>{sourceTotal === null ? '—' : 'Rp ' + formatRealImportAmount(sourceTotal)}</strong><small>{sourceTotal === null ? 'Tidak tersedia pada format Cianjur' : sourceTotalMismatch ? 'Tidak sama dengan total baris' : 'Total cocok'}</small></div>
            <div><span>Supplier</span><strong>{supplier?.name ?? '—'}</strong><small>Semua transaksi import</small></div>
          </div>

          {duplicateBatchMessage ? <div className="maker-import-message is-error"><ShieldAlert /> {duplicateBatchMessage}</div> : null}
          {duplicateCheckError ? <div className="maker-import-message is-error"><ShieldAlert /> Pengecekan duplikat gagal: {duplicateCheckError}</div> : null}
          {sourceTotalMismatch ? <div className="maker-import-message is-error"><AlertTriangle /> Total sumber Cidaun tidak sama dengan jumlah baris. Periksa nominal sebelum melanjutkan.</div> : null}
          {warnings.map((warning) => <div className="maker-import-message is-error" key={warning}><AlertTriangle /> {warning}</div>)}
          {unknownKitchenRows.map((row) => <div className="maker-import-message is-error" key={row.id}><AlertTriangle /> Dapur belum cocok: {row.kitchenName}. Import diblokir sampai dapur valid.</div>)}

          <div className="real-import-rows">
            {rows.map((row) => (
              <article className={'real-import-row' + (duplicateReasons[row.id] ? ' is-duplicate' : '') + (row.disposition === 'excluded' ? ' is-excluded' : '')} key={row.id}>
                <div className="real-import-row-head">
                  <div>
                    <span>BARIS {row.rowNumber} · SUMBER BARIS {row.sourceLineNumber}</span>
                    <h4>{row.kitchenName}</h4>
                    <p>{row.rawLine}</p>
                  </div>
                  {duplicateReasons[row.id] && row.disposition === 'import' ? <span className="real-import-status is-error"><AlertTriangle /> Duplikat</span> : row.disposition === 'excluded' ? <span className="real-import-status is-muted">Audit saja</span> : <span className="real-import-status is-ok"><CheckCircle2 /> Siap</span>}
                </div>
                <div className="real-import-row-fields">
                  <label><span>Dapur</span>
                    <select value={row.kitchenId} onChange={(event) => updateRow(row.id, { kitchenId: event.target.value })}>
                      <option value="">Pilih dapur</option>
                      {kitchens.map((kitchen) => <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>)}
                    </select>
                  </label>
                  <label><span>Nominal (Rp)</span>
                    <input inputMode="numeric" value={formatRealImportAmount(row.amount)} onChange={(event) => {
                      const digits = event.target.value.replace(/[^0-9]/g, '')
                      const amount = digits ? Number(digits) : 0
                      if (Number.isSafeInteger(amount) && amount > 0) updateRow(row.id, { amount })
                    }} />
                  </label>
                  <label className="real-import-note"><span>Catatan</span>
                    <input value={row.note} onChange={(event) => updateRow(row.id, { note: event.target.value })} />
                  </label>
                </div>
                {duplicateReasons[row.id] && row.disposition === 'import' ? (
                  <div className="real-import-duplicate-warning">
                    <AlertTriangle aria-hidden="true" />
                    <p>{duplicateReasons[row.id]}</p>
                    <button type="button" onClick={() => toggleExcluded(row)}>Keluarkan dari transaksi (simpan audit saja)</button>
                  </div>
                ) : row.disposition === 'excluded' ? (
                  <div className="real-import-duplicate-warning">
                    <ShieldAlert aria-hidden="true" />
                    <p>{row.exclusionReason || 'Baris ini hanya tercatat di audit dan tidak menambah saldo/riwayat.'}</p>
                    <button type="button" onClick={() => toggleExcluded(row)}>Kembalikan ke transaksi</button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {saveError ? <div className="maker-import-message is-error"><AlertTriangle /> {saveError}</div> : null}
          <div className="maker-import-save-footer">
            <div>
              <strong>{importedRows.length} transaksi masuk</strong>
              <span>Rp {formatRealImportAmount(importedTotal)} masuk · {excludedRows.length} audit saja · Rp {formatRealImportAmount(totalAmount)} total baris</span>
            </div>
            <button type="button" className="maker-import-primary" onClick={openConfirmation} disabled={!canContinue}>
              {checkingDuplicates ? <><LoaderCircle className="is-spinning" /> Memeriksa…</> : <><FileCheck2 aria-hidden="true" /> Lanjut ke konfirmasi</>}
            </button>
          </div>
        </section>
      ) : null}

      <ImportConfirmationDialog
        open={confirmOpen}
        title="Simpan Import RAB / Real?"
        description={'Periksa ringkasan batch ' + sourceLabel(sourceType) + ' tanggal ' + transactionDate + '. Transaksi akan masuk sebagai RAB / Real dengan supplier Koperasi Arutala.'}
        details={[
          { label: 'Tanggal', value: transactionDate },
          { label: 'Sumber', value: sourceLabel(sourceType) },
          { label: 'Transaksi masuk', value: importedRows.length + ' baris' },
          { label: 'Total masuk', value: 'Rp ' + formatRealImportAmount(importedTotal) },
          { label: 'Audit saja', value: excludedRows.length + ' baris' },
          { label: 'Supplier', value: supplier?.name ?? '—' }
        ]}
        warning="Setelah dikonfirmasi, transaksi akan langsung muncul di riwayat RAB / Real. Cek tanggal, dapur, dan nominal sebelum menyimpan."
        confirmLabel="Simpan ke database"
        cancelLabel="Periksa draft lagi"
        busy={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirmSave()}
      />
    </section>
  )
}
