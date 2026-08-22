import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from 'react'
import { Check, Copy, Plus, RefreshCw, Trash2 } from 'lucide-react'

import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import {
  buildMakerDescription,
  createMakerItem,
  deleteMakerItem,
  getActiveMakerKitchens,
  getMakerAccountOptions,
  getMakerItems,
  normalizeMakerAmount,
  realizeMakerItems,
  updateMakerStatus
} from '@/features/disbursement-maker/disbursement-maker-service'
import type {
  MakerAccountOption,
  MakerFlow,
  MakerItem,
  MakerKitchen
} from '@/features/disbursement-maker/disbursement-maker-types'
import { getTodayLocal } from '@/lib/formatters'
import { supabase } from '@/lib/supabase'

type MakerFormState = {
  transactionDate: string
  kitchenId: string
  flowType: MakerFlow | ''
  accountId: string
  amount: string
}

const DEFAULT_FORM: MakerFormState = {
  transactionDate: getTodayLocal(),
  kitchenId: '',
  flowType: '',
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
  const [itemAccounts, setItemAccounts] = useState<MakerAccountOption[]>([])
  const [items, setItems] = useState<MakerItem[]>([])

  const [form, setForm] = useState<MakerFormState>(DEFAULT_FORM)

  const [loadingKitchens, setLoadingKitchens] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving] = useState(false)

  const [errorMessage, setErrorMessage] = useState('')

  const accountSelectRef = useRef<HTMLSelectElement | null>(null)
  const amountInputRef = useRef<HTMLInputElement | null>(null)

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

  const pendingItems = filteredItems.filter(
    (item) => item.status !== 'REALIZED'
  )

  const canRealize =
    pendingItems.length > 0 &&
    pendingItems.every((item) => item.status === 'PROCESSED')

  const dateAndKitchenReady =
    Boolean(form.transactionDate) && Boolean(form.kitchenId)

  const flowReady = dateAndKitchenReady && Boolean(form.flowType)

  useEffect(() => {
    let cancelled = false

    void getActiveMakerKitchens()
      .then((data) => {
        if (cancelled) {
          return
        }

        setKitchens(data)
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
    if (!dateAndKitchenReady || !form.flowType) {
      return
    }

    const selectedFlow: MakerFlow = form.flowType
    let cancelled = false

    void Promise.resolve()
      .then(() => {
        if (cancelled) {
          return null
        }

        setLoadingAccounts(true)

        return getMakerAccountOptions(form.kitchenId, selectedFlow)
      })
      .then((data) => {
        if (cancelled || !data) {
          return
        }

        setAccounts(data)
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
  }, [form.kitchenId, form.flowType, dateAndKitchenReady])

  useEffect(() => {
    if (!form.transactionDate || !form.kitchenId) {
      return
    }

    let cancelled = false

    void Promise.resolve()
      .then(async () => {
        if (cancelled) {
          return null
        }

        setLoadingItems(true)

        const [makerItems, incomeAccounts, neutralAccounts] = await Promise.all(
          [
            getMakerItems({
              transactionDate: form.transactionDate,
              kitchenId: form.kitchenId
            }),
            getMakerAccountOptions(form.kitchenId, 'income'),
            getMakerAccountOptions(form.kitchenId, 'neutral')
          ]
        )

        return {
          makerItems,
          accountOptions: [...incomeAccounts, ...neutralAccounts]
        }
      })
      .then((result) => {
        if (cancelled || !result) {
          return
        }

        setItems(result.makerItems)
        setItemAccounts(result.accountOptions)
        setErrorMessage('')
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        console.error(error)
        setItems([])
        setItemAccounts([])
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

  function updateField(key: keyof MakerFormState, value: string | MakerFlow) {
    setErrorMessage('')

    if (key === 'transactionDate') {
      setAccounts([])

      setForm((current) => ({
        ...current,
        transactionDate: value as string,
        flowType: '',
        accountId: '',
        amount: ''
      }))

      return
    }

    if (key === 'kitchenId') {
      setAccounts([])

      setForm((current) => ({
        ...current,
        kitchenId: value as string,
        flowType: '',
        accountId: '',
        amount: ''
      }))

      return
    }

    if (key === 'flowType') {
      setAccounts([])

      setForm((current) => ({
        ...current,
        flowType: value as MakerFlow,
        accountId: '',
        amount: ''
      }))

      return
    }

    if (key === 'accountId') {
      setForm((current) => ({
        ...current,
        accountId: value as string
      }))

      window.setTimeout(() => {
        amountInputRef.current?.focus()
      }, 0)

      return
    }

    if (key === 'amount') {
      setForm((current) => ({
        ...current,
        amount: value as string
      }))
    }
  }

  const reloadItems = useCallback(
    async (showLoading = true) => {
      if (!form.transactionDate || !form.kitchenId) {
        return
      }

      if (showLoading) {
        setLoadingItems(true)
      }

      try {
        const [makerItems, incomeAccounts, neutralAccounts] = await Promise.all(
          [
            getMakerItems({
              transactionDate: form.transactionDate,
              kitchenId: form.kitchenId
            }),
            getMakerAccountOptions(form.kitchenId, 'income'),
            getMakerAccountOptions(form.kitchenId, 'neutral')
          ]
        )

        setItems(makerItems)
        setItemAccounts([...incomeAccounts, ...neutralAccounts])
        setErrorMessage('')
      } catch (error) {
        console.error(error)
        setErrorMessage('Gagal memuat data Maker.')
      } finally {
        if (showLoading) {
          setLoadingItems(false)
        }
      }
    },
    [form.transactionDate, form.kitchenId]
  )

  useEffect(() => {
    if (!form.transactionDate || !form.kitchenId) {
      return
    }

    let cancelled = false
    let refreshInFlight = false
    let refreshQueued = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRealtimeRefresh = () => {
      if (cancelled || refreshTimer !== null) {
        return
      }

      refreshTimer = setTimeout(() => {
        refreshTimer = null

        if (cancelled) {
          return
        }

        if (refreshInFlight) {
          refreshQueued = true
          return
        }

        refreshInFlight = true

        void reloadItems(false)
          .catch((error: unknown) => {
            console.error('Gagal memperbarui Maker dari Realtime:', error)
          })
          .finally(() => {
            refreshInFlight = false

            if (refreshQueued && !cancelled) {
              refreshQueued = false
              scheduleRealtimeRefresh()
            }
          })
      }, 150)
    }

    /*
     * Global subscription by design.
     *
     * Do not attach a kitchen_id filter here. The page query already filters
     * by the currently selected date + kitchen. A filtered Realtime channel
     * could miss DELETE/UPDATE notifications or changes arriving while the
     * UI selection is transitioning. The global event stream is cheap here
     * and makes every open Maker page reliably converge to its current DB view.
     */
    const realtimeChannelName = `disbursement-maker-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const channel = supabase
      .channel(realtimeChannelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'disbursement_maker_items'
        },
        () => {
          scheduleRealtimeRefresh()
        }
      )
      .subscribe((status) => {
        if (cancelled) {
          return
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Disbursement Maker Realtime] ${status}`)
        }
      })

    return () => {
      cancelled = true

      if (refreshTimer !== null) {
        clearTimeout(refreshTimer)
        refreshTimer = null
      }

      void supabase.removeChannel(channel)
    }
  }, [form.kitchenId, form.transactionDate, reloadItems])

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

    if (!form.flowType) {
      setErrorMessage('Jenis pencairan wajib dipilih.')
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
        accountId: '',
        amount: ''
      }))

      await reloadItems()

      window.setTimeout(() => {
        accountSelectRef.current?.focus()
      }, 0)
    } catch (error) {
      console.error(error)

      setErrorMessage(
        error instanceof Error ? error.message : 'Gagal membuat item Maker.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleAmountKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()

    if (
      !form.accountId ||
      !form.amount ||
      saving ||
      !form.flowType ||
      !dateAndKitchenReady
    ) {
      return
    }

    await addMakerItem()
  }

  async function setProcessed(item: MakerItem) {
    if (item.status !== 'READY') {
      return
    }

    try {
      await updateMakerStatus(item.id, 'PROCESSED', undefined, user?.id)

      success('Pencairan selesai', 'Item berhasil ditandai sudah diproses.')

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

  async function deleteMaker(item: MakerItem) {
    if (item.status === 'REALIZED') {
      return
    }

    const confirmed = window.confirm(
      `Hapus pencairan ${getFlowLabel(item.flowType)} sebesar ${formatCurrency(
        item.amount
      )}?`
    )

    if (!confirmed) {
      return
    }

    try {
      await deleteMakerItem(item.id)

      success('Pencairan dihapus', 'Item Maker berhasil dihapus.')

      await reloadItems()
    } catch (error) {
      console.error(error)

      toastError(
        'Gagal menghapus',
        error instanceof Error ? error.message : 'Item Maker gagal dihapus.'
      )
    }
  }

  async function realizeItems() {
    if (!user?.id || !form.transactionDate || !form.kitchenId) {
      return
    }

    if (!canRealize) {
      toastError(
        'Belum bisa direalisasikan',
        'Semua pencairan harus sudah selesai diproses.'
      )
      return
    }

    const confirmed = window.confirm(
      `Realisasikan ${pendingItems.length} pencairan untuk ${
        selectedKitchenName
      } tanggal ${form.transactionDate}?`
    )

    if (!confirmed) {
      return
    }

    try {
      const realizedItems = await realizeMakerItems(
        form.transactionDate,
        form.kitchenId,
        user.id
      )

      success(
        'Pencairan direalisasikan',
        `${realizedItems.length} pencairan berhasil dimasukkan ke transaksi.`
      )

      await reloadItems()
    } catch (error) {
      console.error(error)

      toastError(
        'Realisasi gagal',
        error instanceof Error
          ? error.message
          : 'Pencairan gagal direalisasikan.'
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

  function getItemAccount(accountId: string) {
    return (
      itemAccounts.find((account) => account.accountId === accountId) ?? null
    )
  }

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
                updateField('flowType', event.target.value as MakerFlow | '')
              }
              disabled={!dateAndKitchenReady}
            >
              <option value="">
                {dateAndKitchenReady
                  ? 'Pilih jenis pencairan'
                  : 'Pilih tanggal dan dapur terlebih dahulu'}
              </option>

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
          <h2>Tambah pencairan</h2>

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
              ref={accountSelectRef}
              value={form.accountId}
              onChange={(event) => updateField('accountId', event.target.value)}
              disabled={!flowReady || loadingAccounts}
            >
              <option value="">
                {!flowReady
                  ? 'Pilih jenis pencairan terlebih dahulu'
                  : loadingAccounts
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
              ref={amountInputRef}
              type="text"
              inputMode="numeric"
              placeholder="Contoh: 2.315.000"
              value={form.amount}
              onChange={(event) => updateField('amount', event.target.value)}
              onKeyDown={handleAmountKeyDown}
              disabled={!form.accountId}
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
        <div className="maker-summary-card maker-summary-card--total">
          <span>Total Pencairan</span>
          <strong>{filteredItems.length}</strong>
        </div>

        <div className="maker-summary-card maker-summary-card--amount">
          <span>Total Nominal</span>
          <strong>{formatCurrency(totals.total)}</strong>
        </div>

        <div className="maker-summary-card maker-summary-card--ready">
          <span>Siap Diproses</span>
          <strong>{formatCurrency(totals.ready)}</strong>
        </div>

        <div className="maker-summary-card maker-summary-card--processed">
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

              const account = getItemAccount(item.accountId)

              return (
                <article className="maker-item-card" key={item.id}>
                  <div className="maker-item-top">
                    <div className="maker-item-index">{index + 1}</div>

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
                        aria-label="Copy nominal"
                        title="Copy nominal"
                      >
                        <Copy aria-hidden="true" />
                      </button>
                    </div>

                    <div className="maker-copy-box">
                      <span>Keterangan</span>

                      <strong>{description}</strong>

                      <button
                        type="button"
                        onClick={() => void handleCopyDescription(item)}
                        aria-label="Copy keterangan"
                        title="Copy keterangan"
                      >
                        <Copy aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {item.status !== 'REALIZED' ? (
                    <div className="maker-item-actions">
                      {item.status === 'READY' ? (
                        <button
                          type="button"
                          className="maker-item-button maker-item-button--success"
                          onClick={() => void setProcessed(item)}
                        >
                          <Check aria-hidden="true" />
                          <span>Selesai</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="maker-item-button maker-item-button--secondary"
                          onClick={() => void setReady(item)}
                        >
                          <RefreshCw aria-hidden="true" />
                          <span>Buka lagi</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="maker-item-button maker-item-button--danger"
                        onClick={() => void deleteMaker(item)}
                        aria-label="Hapus pencairan"
                        title="Hapus pencairan"
                      >
                        <Trash2 aria-hidden="true" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  ) : null}
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
            onClick={() => void realizeItems()}
          >
            <Check aria-hidden="true" />
            <span>Realisasikan</span>
          </button>
        </div>
      </section>
    </div>
  )
}
