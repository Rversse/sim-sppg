import { AlertTriangle, CheckCircle2, LoaderCircle, X } from 'lucide-react'
import '@/styles/import-confirmation-dialog.css'

export type ImportConfirmationDetail = {
  label: string
  value: string
}

type ImportConfirmationDialogProps = {
  open: boolean
  title: string
  description: string
  details: ImportConfirmationDetail[]
  warning?: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ImportConfirmationDialog({
  open,
  title,
  description,
  details,
  warning,
  confirmLabel = 'Simpan ke database',
  cancelLabel = 'Periksa lagi',
  busy = false,
  onCancel,
  onConfirm
}: ImportConfirmationDialogProps) {
  if (!open) return null

  return (
    <div
      className="import-confirmation-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel()
      }}
    >
      <section
        className="import-confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-confirmation-title"
        aria-describedby="import-confirmation-description"
      >
        <header className="import-confirmation-head">
          <span className="import-confirmation-icon" aria-hidden="true">
            <CheckCircle2 />
          </span>
          <button
            type="button"
            className="import-confirmation-close"
            aria-label="Tutup konfirmasi"
            onClick={onCancel}
            disabled={busy}
          >
            <X />
          </button>
          <div>
            <span>LANGKAH TERAKHIR</span>
            <h2 id="import-confirmation-title">{title}</h2>
            <p id="import-confirmation-description">{description}</p>
          </div>
        </header>

        <div className="import-confirmation-body">
          <div className="import-confirmation-summary">
            {details.map((detail) => (
              <div key={detail.label}>
                <span>{detail.label}</span>
                <strong>{detail.value}</strong>
              </div>
            ))}
          </div>
          {warning ? (
            <div className="import-confirmation-warning">
              <AlertTriangle aria-hidden="true" />
              <p>{warning}</p>
            </div>
          ) : null}
        </div>

        <footer className="import-confirmation-actions">
          <button type="button" className="import-confirmation-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="import-confirmation-primary" onClick={onConfirm} disabled={busy}>
            {busy ? <><LoaderCircle className="is-spinning" /> Menyimpan…</> : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}
