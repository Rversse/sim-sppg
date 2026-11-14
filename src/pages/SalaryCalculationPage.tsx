import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calculator, Save, RefreshCw } from 'lucide-react'

import { getActiveKitchens } from '@/features/kitchen/kitchen-service'
import type { SalaryAllocation } from '@/features/salary-calculation/salary-calculation-service'
import {
  DEFAULT_SALARY_ALLOCATION,
  getKitchenSalaryAllocation,
  getKitchenSalaryCalculation,
  saveKitchenSalaryAllocation,
  validateSalaryAllocation
} from '@/features/salary-calculation/salary-calculation-service'
import type { KitchenSalaryCalculation } from '@/features/salary-calculation/salary-calculation-service'
import { useToast } from '@/features/ui/toast-context'

type KitchenOption = { id: string; name: string }

function localDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value)
}

const ROLE_FIELDS: Array<{ key: keyof SalaryAllocation; label: string }> = [
  { key: 'accountant', label: 'Akuntan' },
  { key: 'nutritionist', label: 'Ahli Gizi' },
  { key: 'aslap', label: 'Aslap' },
  { key: 'head', label: 'Kepala SPPG' }
]

export function SalaryCalculationPage() {
  const { success, error: toastError } = useToast()
  const today = useMemo(() => localDateValue(new Date()), [])
  const [kitchens, setKitchens] = useState<KitchenOption[]>([])
  const [kitchenId, setKitchenId] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [allocation, setAllocation] = useState<SalaryAllocation>({
    ...DEFAULT_SALARY_ALLOCATION
  })
  const [calculation, setCalculation] = useState<KitchenSalaryCalculation | null>(null)
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState('')

  const loadKitchens = useCallback(async () => {
    setLoading(true)
    setPageError('')
    try {
      const rows = await getActiveKitchens()
      setKitchens(rows)
      setKitchenId((current) => current || rows[0]?.id || '')
    } catch (err) {
      console.error(err)
      setPageError('Gagal memuat daftar dapur.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadKitchens()
  }, [loadKitchens])

  useEffect(() => {
    if (!kitchenId) {
      setAllocation({ ...DEFAULT_SALARY_ALLOCATION })
      setCalculation(null)
      return
    }

    let cancelled = false
    void getKitchenSalaryAllocation(kitchenId)
      .then((value) => {
        if (!cancelled) setAllocation(value)
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) toastError('Gagal memuat pembagian', 'Konfigurasi persentase dapur tidak dapat dimuat.')
      })

    setCalculation(null)
    return () => {
      cancelled = true
    }
  }, [kitchenId, toastError])

  async function calculate() {
    if (!kitchenId) {
      toastError('Dapur belum dipilih', 'Pilih dapur terlebih dahulu.')
      return
    }
    if (startDate > endDate) {
      toastError('Rentang tanggal tidak valid', 'Tanggal awal tidak boleh melewati tanggal akhir.')
      return
    }

    setCalculating(true)
    setPageError('')
    try {
      const result = await getKitchenSalaryCalculation({ kitchenId, startDate, endDate })
      setCalculation(result)
    } catch (err) {
      console.error(err)
      setPageError(err instanceof Error ? err.message : 'Gagal menghitung alokasi gaji.')
      setCalculation(null)
    } finally {
      setCalculating(false)
    }
  }

  async function saveAllocation() {
    if (!kitchenId || saving) return
    const validationError = validateSalaryAllocation(allocation)
    if (validationError) {
      toastError('Pembagian belum valid', validationError)
      return
    }

    setSaving(true)
    try {
      await saveKitchenSalaryAllocation(kitchenId, allocation)
      success('Pembagian disimpan', 'Persentase alokasi untuk dapur ini berhasil disimpan.')
      if (calculation) await calculate()
    } catch (err) {
      console.error(err)
      toastError('Gagal menyimpan pembagian', err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally {
      setSaving(false)
    }
  }

  const percentageTotal = ROLE_FIELDS.reduce((sum, field) => sum + Number(allocation[field.key] || 0), 0)

  return (
    <section className="salary-page">
      <div className="salary-intro">
        <div>
          <h2>Perhitungan Gaji</h2>
          <p>Alokasi 30% dari total RAB dapur, dibagi berdasarkan persentase jabatan.</p>
        </div>
        <span className="salary-fixed-rate">Alokasi tetap 30%</span>
      </div>

      {pageError ? <div className="salary-alert" role="alert">{pageError}</div> : null}

      <div className="salary-panel">
        <div className="salary-panel-heading">
          <div>
            <h3>Parameter Perhitungan</h3>
            <p>Pilih dapur dan periode transaksi yang akan dihitung.</p>
          </div>
        </div>
        <div className="salary-filter-grid">
          <div className="salary-field salary-field--kitchen">
            <label htmlFor="salary-kitchen">Dapur</label>
            <select id="salary-kitchen" value={kitchenId} onChange={(event) => setKitchenId(event.target.value)} disabled={loading}>
              <option value="">{loading ? 'Memuat dapur...' : 'Pilih dapur'}</option>
              {kitchens.map((kitchen) => <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>)}
            </select>
          </div>
          <div className="salary-field">
            <label htmlFor="salary-start">Tanggal awal</label>
            <input id="salary-start" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="salary-field">
            <label htmlFor="salary-end">Tanggal akhir</label>
            <input id="salary-end" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <button type="button" className="salary-primary-button" onClick={() => void calculate()} disabled={loading || calculating || !kitchenId}>
            {calculating ? <RefreshCw className="salary-spin" aria-hidden="true" /> : <Calculator aria-hidden="true" />}
            {calculating ? 'Menghitung...' : 'Hitung'}
          </button>
        </div>
      </div>

      <div className="salary-panel">
        <div className="salary-panel-heading salary-panel-heading--split">
          <div>
            <h3>Pembagian Persentase</h3>
            <p>Konfigurasi tersimpan secara terpisah untuk setiap dapur.</p>
          </div>
          <span className={Math.abs(percentageTotal - 100) < 0.000001 ? 'salary-total-valid' : 'salary-total-invalid'}>
            Total {percentageTotal.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%
          </span>
        </div>
        <div className="salary-allocation-grid">
          {ROLE_FIELDS.map((field) => (
            <label className="salary-field" key={field.key}>
              <span>{field.label}</span>
              <div className="salary-percent-input">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={allocation[field.key]}
                  onChange={(event) => setAllocation((current) => ({
                    ...current,
                    [field.key]: event.target.value === '' ? 0 : Number(event.target.value)
                  }))}
                  disabled={!kitchenId}
                />
                <span>%</span>
              </div>
            </label>
          ))}
        </div>
        <div className="salary-panel-footer">
          <p>Jumlah persentase harus tepat 100% sebelum disimpan.</p>
          <button type="button" className="salary-secondary-button" onClick={() => void saveAllocation()} disabled={!kitchenId || saving}>
            <Save aria-hidden="true" />
            {saving ? 'Menyimpan...' : 'Simpan Pembagian'}
          </button>
        </div>
      </div>

      {calculation ? (
        <div className="salary-results">
          <div className="salary-result-summary">
            <article>
              <span>Total RAB</span>
              <strong>{formatRupiah(calculation.totalRAB)}</strong>
              <small>{calculation.kitchenName}</small>
            </article>
            <article>
              <span>Alokasi Gaji · 30%</span>
              <strong>{formatRupiah(calculation.totalAllocation)}</strong>
              <small>{calculation.startDate} s.d. {calculation.endDate}</small>
            </article>
          </div>
          <div className="salary-panel">
            <div className="salary-panel-heading">
              <div>
                <h3>Rincian Alokasi</h3>
                <p>Nominal dihitung dari alokasi tetap 30% dikalikan persentase setiap jabatan.</p>
              </div>
            </div>
            <div className="salary-result-list">
              {calculation.roles.map((role) => (
                <div className="salary-result-row" key={role.key}>
                  <span>{role.label}</span>
                  <span>{role.percent.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%</span>
                  <strong>{formatRupiah(role.amount)}</strong>
                </div>
              ))}
              <div className="salary-result-row salary-result-row--total">
                <span>Total dibagikan</span>
                <span>100%</span>
                <strong>{formatRupiah(calculation.roles.reduce((sum, role) => sum + role.amount, 0))}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="salary-empty">
          <Calculator aria-hidden="true" />
          <strong>Hasil perhitungan akan tampil di sini</strong>
          <span>Pilih dapur dan rentang tanggal, lalu tekan Hitung.</span>
        </div>
      )}
    </section>
  )
}
