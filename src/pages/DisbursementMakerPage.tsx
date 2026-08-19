import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Plus, RefreshCw, Trash2 } from 'lucide-react'

import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import {
  buildMakerDescription,
  createMakerItem,
  getActiveMakerKitchens,
  getMakerAccountOptions,
  getMakerItems,
  normalizeMakerAmount,
  updateMakerStatus
} from '@/features/disbursement-maker/disbursement-maker-service'
import type {
  MakerAccountOption,
  MakerFlow,
  MakerItem,
  MakerKitchen
} from '@/features/disbursement-maker/disbursement-maker-types'
import { getTodayLocal } from '@/lib/formatters'

type MakerFormState = {
  transactionDate: string
  kitchenId: string
  flowType: MakerFlow
  accountId: string
  amount: string
}

const DEFAULT_FORM: MakerFormState = {
  transactionDate: getTodayLocal(),
  kitchenId: '',
  flowType: 'income',
  accountId: '',
  amount: ''
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0
  }).format(value)
}

function getFlowLabel(flowType: MakerFlow) {
  return flowType === 'income' ? 'RAB' : 'Gas'
}

function getStatusLabel(status: MakerItem['status']) {
  switch (status) {
    case 'READY':
      return 'Siap diproses'
    case 'PROCESSED':
      return 'Sudah diproses'
    case 'REALIZED':
      return 'Sudah direalisasikan'
  }
}

function getStatusClass(status: MakerItem['status']) {
  switch (status) {
    case 'READY':
      return 'maker-status maker-status-ready'
    case 'PROCESSED':
      return 'maker-status maker-status-processed'
    case 'REALIZED':
      return 'maker-status maker-status-realized'
  }
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

export function DisbursementMakerPage() {
  const { user } = useAuth()
  const { success, error: toastError } = useToast()

  const [kitchens, setKitchens] = useState<MakerKitchen[]>([])
  const [accounts, setAccounts] = useState<MakerAccountOption[]>([])
  const [items, setItems] = useState<MakerItem[]>([])

  const [form, setForm] = useState<MakerFormState>(DEFAULT_FORM)

  const [loadingKitchens, setLoadingKitchens] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving] = useState(false)

  const [errorMessage, setErrorMessage] = useState('')

  const selectedAccount = useMemo(
    () =>
      accounts.find((account) => account.accountId === form.accountId) ?? null,
    [accounts, form.accountId]
  )

  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.transactionDate === form.transactionDate &&
          item.kitchenId === form.kitchenId
      ),
    [items, form.transactionDate, form.kitchenId]
  )

  const totals = useMemo(
    () =>
      filteredItems.reduce(
        (result, item) => {
          result.total += item.amount

          if (item.status === 'READY') {
            result.ready += item.amount
          }

          if (item.status === 'PROCESSED') {
            result.processed += item.amount
          }

          if (item.status === 'REALIZED') {
            result.realized += item.amount
          }

          return result
        },
        {
          total: 0,
          ready: 0,
          processed: 0,
          realized: 0
        }
      ),
    [filteredItems]
  )

  const canRealize =
    filteredItems.length > 0 &&
    filteredItems.every((item) => item.status === 'PROCESSED')

  useEffect(() => {
    let cancelled = false

    void getActiveMakerKitchens()
      .then((data) => {
        if (cancelled) {
          return
        }

        setKitchens(data)

        setForm((current) => {
          if (current.kitchenId || data.length === 0) {
            return current
          }

          return {
            ...current,
            kitchenId: data[0].id
          }
        })
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        console.error(error)
        setErrorMessage('Gagal memuat data dapur.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingKitchens(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!form.kitchenId) {
      return
    }

    let cancelled = false

    void Promise.resolve()
      .then(() => {
        if (cancelled) {
          return
        }

        setLoadingAccounts(true)

        return getMakerAccountOptions(form.kitchenId, form.flowType)
      })
      .then((data) => {
        if (cancelled || !data) {
          return
        }

        setAccounts(data)

        setForm((current) => {
          const stillValid = data.some(
            (account) => account.accountId === current.accountId
          )

          return {
            ...current,
            accountId: stillValid
              ? current.accountId
              : (data[0]?.accountId ?? '')
          }
        })
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        console.error(error)
        setAccounts([])
        setErrorMessage('Gagal memuat rekening tujuan.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAccounts(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [form.kitchenId, form.flowType])

  useEffect(() => {
    if (!form.transactionDate || !form.kitchenId) {
      return
    }

    let cancelled = false

    void Promise.resolve()
      .then(() => {
        if (cancelled) {
          return
        }

        setLoadingItems(true)

        return getMakerItems({
          transactionDate: form.transactionDate,
          kitchenId: form.kitchenId
        })
      })
      .then((data) => {
        if (cancelled || !data) {
          return
        }

        setItems(data)
        setErrorMessage('')
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        console.error(error)
        setErrorMessage('Gagal memuat data Maker.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingItems(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [form.transactionDate, form.kitchenId])

  function updateField<Key extends keyof MakerFormState>(
    key: Key,
    value: MakerFormState[Key]
  ) {
    setErrorMessage('')

    setForm((current) => ({
      ...current,
      [key]: value
    }))

    if (key === 'kitchenId' || key === 'flowType') {
      setAccounts([])
    }
  }

  async function reloadItems() {
    if (!form.transactionDate || !form.kitchenId) {
      return
    }

    setLoadingItems(true)

    try {
      const data = await getMakerItems({
        transactionDate: form.transactionDate,
        kitchenId: form.kitchenId
      })

      setItems(data)
      setErrorMessage('')
    } catch (error) {
      console.error(error)
      setErrorMessage('Gagal memuat data Maker.')
    } finally {
      setLoadingItems(false)
    }
  }

  async function addMakerItem() {
    if (!user?.id || saving) {
      return
    }

    if (!form.transactionDate) {
      setErrorMessage('Tanggal wajib diisi.')
      return
    }

    if (!form.kitchenId) {
      setErrorMessage('Dapur wajib dipilih.')
      return
    }

    if (!form.accountId) {
      setErrorMessage('Rekening wajib dipilih.')
      return
    }

    let amount: number

    try {
      amount = normalizeMakerAmount(form.amount)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Nominal tidak valid.'
      )
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      await createMakerItem({
        kitchenId: form.kitchenId,
        transactionDate: form.transactionDate,
        accountId: form.accountId,
        amount,
        flowType: form.flowType,
        createdBy: user.id
      })

      success(
        'Maker ditambahkan',
        `${getFlowLabel(form.flowType)} berhasil ditambahkan.`
      )

      setForm((current) => ({
        ...current,
        amount: ''
      }))

      await reloadItems()
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error instanceof Error ? error.message : 'Gagal membuat item Maker.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function setProcessed(item: MakerItem) {
    if (item.status !== 'READY') {
      return
    }

    try {
      await updateMakerStatus(item.id, 'PROCESSED', undefined, user?.id)

      success(
        'Pencairan ditandai selesai',
        'Item berhasil ditandai sudah diproses.'
      )

      await reloadItems()
    } catch (error) {
      console.error(error)

      toastError(
        'Gagal mengubah status',
        error instanceof Error ? error.message : 'Status Maker gagal diubah.'
      )
    }
  }

  async function setReady(item: MakerItem) {
    if (item.status !== 'PROCESSED') {
      return
    }

    try {
      await updateMakerStatus(item.id, 'READY', undefined, user?.id)

      success('Status dikembalikan', 'Item kembali ke status siap diproses.')

      await reloadItems()
    } catch (error) {
      console.error(error)

      toastError(
        'Gagal mengubah status',
        error instanceof Error ? error.message : 'Status Maker gagal diubah.'
      )
    }
  }

  async function handleCopyNominal(item: MakerItem) {
    try {
      await copyText(String(item.amount))

      success('Nominal disalin', formatNumber(item.amount))
    } catch (error) {
      console.error(error)

      toastError('Gagal menyalin', 'Browser tidak mengizinkan clipboard.')
    }
  }

  async function handleCopyDescription(item: MakerItem) {
    try {
      const description = buildMakerDescription(
        item.transactionDate,
        item.flowType
      )

      await copyText(description)

      success('Keterangan disalin', description)
    } catch (error) {
      console.error(error)

      toastError('Gagal menyalin', 'Browser tidak mengizinkan clipboard.')
    }
  }

  const selectedKitchenName =
    kitchens.find((kitchen) => kitchen.id === form.kitchenId)?.name ??
    'Pilih dapur'

  return (
    <div className="maker-page">
      <section className="maker-toolbar">
        <div className="maker-toolbar-fields">
          <label className="maker-field">
            <span>Tanggal</span>
            <input
              type="date"
              value={form.transactionDate}
              onChange={(event) =>
                updateField('transactionDate', event.target.value)
              }
            />
          </label>

          <label className="maker-field">
            <span>Dapur</span>
            <select
              value={form.kitchenId}
              onChange={(event) => updateField('kitchenId', event.target.value)}
              disabled={loadingKitchens}
            >
              <option value="">
                {loadingKitchens ? 'Memuat dapur...' : 'Pilih dapur'}
              </option>

              {kitchens.map((kitchen) => (
                <option key={kitchen.id} value={kitchen.id}>
                  {kitchen.name}
                </option>
              ))}
            </select>
          </label>

          <label className="maker-field">
            <span>Jenis Pencairan</span>
            <select
              value={form.flowType}
              onChange={(event) =>
                updateField('flowType', event.target.value as MakerFlow)
              }
            >
              <option value="income">RAB</option>
              <option value="neutral">Gas</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          className="app-action-button app-action-button--secondary"
          onClick={() => void reloadItems()}
          disabled={loadingItems}
        >
          <RefreshCw aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </section>

      <section className="maker-form-panel">
        <div className="maker-form-heading">
          <div>
            <span className="maker-eyebrow">Maker Pencairan</span>
            <h2>Tambah pencairan</h2>
          </div>

          {selectedAccount ? (
            <div className="maker-selected-account">
              <strong>{selectedAccount.accountName}</strong>
              <span>
                {selectedAccount.bank} • {selectedAccount.accountNumber}
              </span>
            </div>
          ) : null}
        </div>

        <div className="maker-form-grid">
          <label className="maker-field maker-field--wide">
            <span>Rekening Tujuan</span>

            <select
              value={form.accountId}
              onChange={(event) => updateField('accountId', event.target.value)}
              disabled={loadingAccounts || !form.kitchenId}
            >
              <option value="">
                {loadingAccounts
                  ? 'Memuat rekening...'
                  : 'Pilih rekening tujuan'}
              </option>

              {accounts.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.accountName} — {account.bank} —{' '}
                  {account.accountNumber}
                </option>
              ))}
            </select>
          </label>

          <label className="maker-field">
            <span>Nominal</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Contoh: 2.315.000"
              value={form.amount}
              onChange={(event) => updateField('amount', event.target.value)}
            />
          </label>

          <div className="maker-form-actions">
            <button
              type="button"
              className="app-action-button"
              onClick={() => void addMakerItem()}
              disabled={saving || !form.accountId || !form.amount}
            >
              <Plus aria-hidden="true" />
              <span>Tambah</span>
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="maker-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </section>

      <section className="maker-summary-grid">
        <div className="maker-summary-card">
          <span>Total Pencairan</span>
          <strong>{filteredItems.length}</strong>
        </div>

        <div className="maker-summary-card">
          <span>Total Nominal</span>
          <strong>{formatCurrency(totals.total)}</strong>
        </div>

        <div className="maker-summary-card">
          <span>Siap Diproses</span>
          <strong>{formatCurrency(totals.ready)}</strong>
        </div>

        <div className="maker-summary-card">
          <span>Sudah Diproses</span>
          <strong>{formatCurrency(totals.processed)}</strong>
        </div>
      </section>

      <section className="maker-list-panel">
        <div className="maker-list-header">
          <div>
            <span className="maker-eyebrow">Daftar Pencairan</span>
            <h2>{selectedKitchenName}</h2>
          </div>

          <span className="maker-list-meta">{form.transactionDate}</span>
        </div>

        {loadingItems ? (
          <div className="maker-empty">Memuat data pencairan...</div>
        ) : filteredItems.length === 0 ? (
          <div className="maker-empty">
            Belum ada pencairan untuk tanggal dan dapur ini.
          </div>
        ) : (
          <div className="maker-list">
            {filteredItems.map((item, index) => {
              const description = buildMakerDescription(
                item.transactionDate,
                item.flowType
              )

              const account =
                accounts.find(
                  (candidate) => candidate.accountId === item.accountId
                ) ?? null

              return (
                <article className="maker-item-card" key={item.id}>
                  <div className="maker-item-index">{index + 1}</div>

                  <div className="maker-item-main">
                    <div className="maker-item-heading">
                      <div>
                        <strong>
                          {account?.accountName ?? item.accountId}
                        </strong>

                        <span>
                          {account?.bank ?? '-'} •{' '}
                          {account?.accountNumber ?? '-'}
                        </span>
                      </div>

                      <span className={getStatusClass(item.status)}>
                        {getStatusLabel(item.status)}
                      </span>
                    </div>

                    <div className="maker-item-meta">
                      <span>{getFlowLabel(item.flowType)}</span>
                      <span>•</span>
                      <span>{formatCurrency(item.amount)}</span>
                    </div>

                    <div className="maker-copy-grid">
                      <div className="maker-copy-box">
                        <span>Nominal Bank</span>
                        <strong>{item.amount}</strong>

                        <button
                          type="button"
                          onClick={() => void handleCopyNominal(item)}
                        >
                          <Copy aria-hidden="true" />
                          <span>Copy</span>
                        </button>
                      </div>

                      <div className="maker-copy-box">
                        <span>Keterangan</span>
                        <strong>{description}</strong>

                        <button
                          type="button"
                          onClick={() => void handleCopyDescription(item)}
                        >
                          <Copy aria-hidden="true" />
                          <span>Copy</span>
                        </button>
                      </div>
                    </div>

                    {item.status !== 'REALIZED' ? (
                      <div className="maker-item-actions">
                        {item.status === 'READY' ? (
                          <button
                            type="button"
                            className="app-action-button"
                            onClick={() => void setProcessed(item)}
                          >
                            <Check aria-hidden="true" />
                            <span>Sudah Diproses</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="app-action-button app-action-button--secondary"
                            onClick={() => void setReady(item)}
                          >
                            <RefreshCw aria-hidden="true" />
                            <span>Kembalikan</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="app-action-button app-action-button--danger"
                          onClick={() =>
                            toastError(
                              'Belum tersedia',
                              'Penghapusan Maker kita aktifkan setelah flow realisasi selesai.'
                            )
                          }
                        >
                          <Trash2 aria-hidden="true" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="maker-realize-panel">
        <div>
          <span className="maker-eyebrow">Realisasi</span>
          <h2>Review pencairan</h2>
          <p>
            Semua item harus berstatus sudah diproses sebelum bisa
            direalisasikan ke transaksi resmi.
          </p>
        </div>

        <div className="maker-realize-summary">
          <div>
            <span>Total</span>
            <strong>{formatCurrency(totals.total)}</strong>
          </div>

          <div>
            <span>Sudah diproses</span>
            <strong>{formatCurrency(totals.processed)}</strong>
          </div>

          <button
            type="button"
            className="app-action-button"
            disabled={!canRealize}
            onClick={() => {
              toastError(
                'Belum tersedia',
                'Fungsi realisasi akan kita sambungkan setelah validasi batch selesai.'
              )
            }}
          >
            <Check aria-hidden="true" />
            <span>Realisasikan</span>
          </button>
        </div>
      </section>
    </div>
  )
}
