import { Check, Copy, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from 'react'

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
  normalizeMakerProducts,
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

type MakerFormFlow = MakerFlow | 'operational' | ''

type MakerFormState = {
  transactionDate: string
  kitchenId: string
  flowType: MakerFormFlow
  supplierId: string
  accountId: string
  selectedProducts: string[]
  amount: string
}

type LocalOperationalItem = {
  id: string
  transactionDate: string
  kitchenId: string
  amount: number
  description: string
  createdAt: string
}

const LOCAL_OPERATIONAL_STORAGE_KEY =
  'sim-sppg:disbursement-maker-operational:v1'

const DEFAULT_FORM: MakerFormState = {
  transactionDate: getTodayLocal(),
  kitchenId: '',
  flowType: '',
  supplierId: '',
  accountId: '',
  selectedProducts: [],
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

function getFlowLabel(flowType: MakerFormFlow | MakerFlow) {
  if (flowType === 'income') return 'RAB'
  if (flowType === 'neutral') return 'Gas'
  if (flowType === 'operational') return 'Biaya Operasional'
  return 'Pilih jenis pencairan'
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

function buildOperationalDescription(transactionDate: string) {
  const [year, month, day] = transactionDate.split('-')

  if (!year || !month || !day) {
    return 'Biaya Ops Harian'
  }

  return `Biaya Ops Harian, ${day}-${month}-${year}`
}

function readLocalOperationalItems(): LocalOperationalItem[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_OPERATIONAL_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is LocalOperationalItem => {
      if (!item || typeof item !== 'object') {
        return false
      }

      const candidate = item as Record<string, unknown>

      return (
        typeof candidate.id === 'string' &&
        typeof candidate.transactionDate === 'string' &&
        typeof candidate.kitchenId === 'string' &&
        typeof candidate.amount === 'number' &&
        Number.isSafeInteger(candidate.amount) &&
        candidate.amount > 0 &&
        typeof candidate.description === 'string' &&
        typeof candidate.createdAt === 'string'
      )
    })
  } catch (error) {
    console.error(error)
    return []
  }
}

function saveLocalOperationalItems(items: LocalOperationalItem[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      LOCAL_OPERATIONAL_STORAGE_KEY,
      JSON.stringify(items)
    )
  } catch (error) {
    console.error(error)
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
  const [localOperationalItems, setLocalOperationalItems] = useState<
    LocalOperationalItem[]
  >(() => readLocalOperationalItems())

  const [form, setForm] = useState<MakerFormState>(DEFAULT_FORM)

  const [loadingKitchens, setLoadingKitchens] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const amountInputRef = useRef<HTMLInputElement | null>(null)

  const dateAndKitchenReady =
    Boolean(form.transactionDate) && Boolean(form.kitchenId)

  const selectedKitchenName =
    kitchens.find((kitchen) => kitchen.id === form.kitchenId)?.name ??
    'Pilih dapur'

  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.transactionDate === form.transactionDate &&
          item.kitchenId === form.kitchenId
      ),
    [items, form.transactionDate, form.kitchenId]
  )

  const filteredLocalOperationalItems = useMemo(
    () =>
      localOperationalItems.filter(
        (item) =>
          item.transactionDate === form.transactionDate &&
          item.kitchenId === form.kitchenId
      ),
    [localOperationalItems, form.transactionDate, form.kitchenId]
  )

  const supplierOptions = useMemo(() => {
    const map = new Map<
      string,
      {
        supplierId: string
        supplierName: string
        ownerName: string | null
        products: string[]
      }
    >()

    for (const account of accounts) {
      if (!account.supplierId || !account.supplierName) {
        continue
      }

      const existing = map.get(account.supplierId)

      if (existing) {
        existing.products = normalizeMakerProducts([
          ...existing.products,
          ...account.supplierProducts
        ])
        continue
      }

      map.set(account.supplierId, {
        supplierId: account.supplierId,
        supplierName: account.supplierName,
        ownerName: account.supplierOwnerName,
        products: account.supplierProducts
      })
    }

    return [...map.values()].sort((a, b) =>
      a.supplierName.localeCompare(b.supplierName, 'id', {
        sensitivity: 'base'
      })
    )
  }, [accounts])

  const selectedSupplier = useMemo(
    () =>
      supplierOptions.find(
        (supplier) => supplier.supplierId === form.supplierId
      ) ?? null,
    [supplierOptions, form.supplierId]
  )

  const supplierAccounts = useMemo(
    () => accounts.filter((account) => account.supplierId === form.supplierId),
    [accounts, form.supplierId]
  )

  const selectedAccount = useMemo(
    () =>
      accounts.find((account) => account.accountId === form.accountId) ?? null,
    [accounts, form.accountId]
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

  const localOperationalTotal = useMemo(
    () =>
      filteredLocalOperationalItems.reduce(
        (total, item) => total + item.amount,
        0
      ),
    [filteredLocalOperationalItems]
  )

  const pendingItems = filteredItems.filter(
    (item) => item.status !== 'REALIZED'
  )

  const canRealize =
    pendingItems.length > 0 &&
    pendingItems.every((item) => item.status === 'PROCESSED')

  const amountReady =
    form.flowType === 'operational'
      ? dateAndKitchenReady
      : form.flowType === 'neutral'
        ? dateAndKitchenReady && Boolean(form.accountId)
        : form.flowType === 'income'
          ? dateAndKitchenReady &&
            Boolean(form.supplierId) &&
            Boolean(form.accountId)
          : false

  const reloadItems = useCallback(
    async (showLoading = true) => {
      if (!form.transactionDate || !form.kitchenId) {
        return
      }

      if (showLoading) {
        setLoadingItems(true)
      }

      try {
        const [makerItems, incomeAccounts, neutralAccounts] = await Promise.all([
          getMakerItems({
            transactionDate: form.transactionDate,
            kitchenId: form.kitchenId
          }),
          getMakerAccountOptions(form.kitchenId, 'income'),
          getMakerAccountOptions(form.kitchenId, 'neutral')
        ])

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
    saveLocalOperationalItems(localOperationalItems)
  }, [localOperationalItems])

  useEffect(() => {
    let cancelled = false

    void getActiveMakerKitchens()
      .then((data) => {
        if (cancelled) return
        setKitchens(data)
      })
      .catch((error) => {
        if (cancelled) return
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
    if (!dateAndKitchenReady) {
      return
    }

    if (form.flowType !== 'income' && form.flowType !== 'neutral') {
      return
    }

    const selectedFlow: MakerFlow = form.flowType
    let cancelled = false

    void Promise.resolve()
      .then(() => {
        if (cancelled) return null

        setLoadingAccounts(true)
        return getMakerAccountOptions(form.kitchenId, selectedFlow)
      })
      .then((data) => {
        if (cancelled || !data) return

        setAccounts(data)

        if (selectedFlow === 'neutral') {
          const defaultAccount = data[0] ?? null

          setForm((current) => ({
            ...current,
            supplierId: '',
            selectedProducts: [],
            accountId: defaultAccount?.accountId ?? ''
          }))

          window.setTimeout(() => {
            amountInputRef.current?.focus()
          }, 0)
          return
        }

        setForm((current) => ({
          ...current,
          accountId:
            current.supplierId &&
            data.some(
              (account) =>
                account.supplierId === current.supplierId &&
                account.accountId === current.accountId
            )
              ? current.accountId
              : ''
        }))
      })
      .catch((error) => {
        if (cancelled) return
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
      .then(() => {
        if (cancelled) return null

        setLoadingItems(true)

        return Promise.all([
          getMakerItems({
            transactionDate: form.transactionDate,
            kitchenId: form.kitchenId
          }),
          getMakerAccountOptions(form.kitchenId, 'income'),
          getMakerAccountOptions(form.kitchenId, 'neutral')
        ])
      })
      .then((result) => {
        if (cancelled || !result) return

        const [makerItems, incomeAccounts, neutralAccounts] = result
        setItems(makerItems)
        setItemAccounts([...incomeAccounts, ...neutralAccounts])
        setErrorMessage('')
      })
      .catch((error) => {
        if (cancelled) return

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

        if (cancelled) return

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

    const realtimeChannelName = `disbursement-maker-live-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`

    const channel = supabase
      .channel(realtimeChannelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'disbursement_maker_items'
        },
        scheduleRealtimeRefresh
      )
      .subscribe((status) => {
        if (cancelled) return

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

  function updateField(
    key: keyof MakerFormState,
    value: string | MakerFormFlow | string[]
  ) {
    setErrorMessage('')

    if (key === 'transactionDate') {
      setAccounts([])
      setForm((current) => ({
        ...current,
        transactionDate: value as string,
        flowType: '',
        supplierId: '',
        accountId: '',
        selectedProducts: [],
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
        supplierId: '',
        accountId: '',
        selectedProducts: [],
        amount: ''
      }))
      return
    }

    if (key === 'flowType') {
      const nextFlow = value as MakerFormFlow
      setAccounts([])
      setForm((current) => ({
        ...current,
        flowType: nextFlow,
        supplierId: '',
        accountId: '',
        selectedProducts: [],
        amount: ''
      }))

      if (nextFlow === 'operational') {
        window.setTimeout(() => {
          amountInputRef.current?.focus()
        }, 0)
      }
      return
    }

    if (key === 'supplierId') {
      const supplierId = value as string
      const supplier = supplierOptions.find(
        (item) => item.supplierId === supplierId
      )
      const supplierAccountsForSelection = accounts.filter(
        (account) => account.supplierId === supplierId
      )
      const autoProducts =
        supplier?.products.length === 1 ? supplier.products : []

      setForm((current) => ({
        ...current,
        supplierId,
        selectedProducts: autoProducts,
        accountId:
          supplierAccountsForSelection.length === 1
            ? supplierAccountsForSelection[0].accountId
            : '',
        amount: ''
      }))

      if (supplierAccountsForSelection.length === 1) {
        window.setTimeout(() => {
          amountInputRef.current?.focus()
        }, 0)
      }
      return
    }

    if (key === 'accountId') {
      const accountId = value as string
      setForm((current) => ({
        ...current,
        accountId
      }))
      window.setTimeout(() => {
        amountInputRef.current?.focus()
      }, 0)
      return
    }

    if (key === 'selectedProducts') {
      setForm((current) => ({
        ...current,
        selectedProducts: normalizeMakerProducts(value as string[])
      }))
      return
    }

    if (key === 'amount') {
      setForm((current) => ({
        ...current,
        amount: value as string
      }))
    }
  }

  function toggleProduct(product: string) {
    const selected = form.selectedProducts.includes(product)

    updateField(
      'selectedProducts',
      selected
        ? form.selectedProducts.filter((item) => item !== product)
        : [...form.selectedProducts, product]
    )
  }

  async function addMakerItem() {
    if (!user?.id || saving || !amountReady) {
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
      if (form.flowType === 'operational') {
        const newItem: LocalOperationalItem = {
          id: crypto.randomUUID(),
          transactionDate: form.transactionDate,
          kitchenId: form.kitchenId,
          amount,
          description: buildOperationalDescription(form.transactionDate),
          createdAt: new Date().toISOString()
        }

        setLocalOperationalItems((current) => [newItem, ...current])
        setForm((current) => ({
          ...current,
          amount: ''
        }))
        success(
          'Operasional lokal ditambahkan',
          'Data disimpan di browser ini.'
        )
        window.setTimeout(() => {
          amountInputRef.current?.focus()
        }, 0)
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

      if (form.flowType === 'income' && !form.supplierId) {
        setErrorMessage('Supplier wajib dipilih.')
        return
      }

      await createMakerItem({
        kitchenId: form.kitchenId,
        transactionDate: form.transactionDate,
        accountId: form.accountId,
        amount,
        flowType: form.flowType,
        selectedProducts:
          form.flowType === 'income' ? form.selectedProducts : [],
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
      window.setTimeout(() => {
        amountInputRef.current?.focus()
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
    if (event.key !== 'Enter') return

    event.preventDefault()

    if (!form.amount || saving || !amountReady) return

    await addMakerItem()
  }

  async function setProcessed(item: MakerItem) {
    if (item.status !== 'READY') return

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
    if (item.status !== 'PROCESSED') return

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
    if (item.status === 'REALIZED') return

    const confirmed = window.confirm(
      `Hapus pencairan ${getFlowLabel(item.flowType)} sebesar ${formatCurrency(
        item.amount
      )}?`
    )

    if (!confirmed) return

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

  function deleteLocalOperationalItem(item: LocalOperationalItem) {
    if (!window.confirm(`Hapus operasional lokal ${formatCurrency(item.amount)}?`)) {
      return
    }

    setLocalOperationalItems((current) =>
      current.filter((candidate) => candidate.id !== item.id)
    )
    success('Operasional lokal dihapus', 'Item dihapus dari browser ini.')
  }

  async function realizeItems() {
    if (!user?.id || !form.transactionDate || !form.kitchenId) return

    if (!canRealize) {
      toastError(
        'Belum bisa direalisasikan',
        'Semua pencairan database harus sudah selesai diproses.'
      )
      return
    }

    const confirmed = window.confirm(
      `Realisasikan ${pendingItems.length} pencairan untuk ${selectedKitchenName} tanggal ${form.transactionDate}?`
    )

    if (!confirmed) return

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

  async function handleCopyNominal(value: number) {
    try {
      await copyText(String(value))
      success('Nominal disalin', formatNumber(value))
    } catch (error) {
      console.error(error)
      toastError('Gagal menyalin', 'Browser tidak mengizinkan clipboard.')
    }
  }

  async function handleCopyDescription(description: string) {
    try {
      await copyText(description)
      success('Keterangan disalin', description)
    } catch (error) {
      console.error(error)
      toastError('Gagal menyalin', 'Browser tidak mengizinkan clipboard.')
    }
  }

  function getItemAccount(accountId: string) {
    return (
      itemAccounts.find((account) => account.accountId === accountId) ?? null
    )
  }

  const displayLocalItems = filteredLocalOperationalItems

  return (
    <div className="maker-page">
      <section className="maker-toolbar">
        <div className="maker-toolbar-main">
          <div className="maker-toolbar-heading">
            <span className="maker-eyebrow">Filter Periode</span>
            <h2>Siapkan pencairan</h2>
            <p>
              Pilih tanggal, dapur, dan jenis pencairan untuk membuat input
              transaksi dengan cepat.
            </p>
          </div>

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
                onChange={(event) =>
                  updateField('kitchenId', event.target.value)
                }
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
                  updateField('flowType', event.target.value as MakerFormFlow)
                }
                disabled={!dateAndKitchenReady}
              >
                <option value="">
                  {dateAndKitchenReady
                    ? 'Pilih jenis pencairan'
                    : 'Pilih tanggal dan dapur terlebih dahulu'}
                </option>
                <option value="income">RAB</option>
                <option value="operational">Biaya Operasional</option>
                <option value="neutral">Gas</option>
              </select>
            </label>
          </div>
        </div>

        <button
          type="button"
          className="app-action-button app-action-button--secondary maker-refresh-button"
          onClick={() => void reloadItems()}
          disabled={loadingItems}
        >
          <RefreshCw aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </section>

      <section className="maker-form-panel">
        <div className="maker-form-heading">
          <div className="maker-form-copy">
            <span className="maker-eyebrow">Tambah Item</span>
            <h2>{form.flowType ? getFlowLabel(form.flowType) : 'Tambah pencairan'}</h2>
            <p>
              {form.flowType === 'income'
                ? 'Pilih supplier, produk, rekening tujuan, dan nominal.'
                : form.flowType === 'operational'
                  ? 'Operasional hanya disimpan di browser ini.'
                  : form.flowType === 'neutral'
                    ? 'Rekening gas otomatis ARUTALA BNI.'
                    : 'Pilih jenis pencairan terlebih dahulu.'}
            </p>
          </div>

          {selectedAccount && form.flowType === 'neutral' ? (
            <div className="maker-selected-account">
              <strong>{selectedAccount.accountName}</strong>
              <span>
                {selectedAccount.bank} • {selectedAccount.accountNumber}
              </span>
            </div>
          ) : null}
        </div>

        {form.flowType === 'income' ? (
          <div className="maker-rab-grid">
            <label className="maker-field">
              <span>Supplier</span>
              <select
                value={form.supplierId}
                onChange={(event) =>
                  updateField('supplierId', event.target.value)
                }
                disabled={loadingAccounts || !accounts.length}
              >
                <option value="">
                  {loadingAccounts ? 'Memuat supplier...' : 'Pilih supplier'}
                </option>
                {supplierOptions.map((supplier) => (
                  <option key={supplier.supplierId} value={supplier.supplierId}>
                    {supplier.supplierName}
                  </option>
                ))}
              </select>
            </label>

            <div className="maker-field maker-products-field">
              <span>Bahan Baku</span>
              {selectedSupplier?.products.length ? (
                <div className="maker-product-list">
                  {selectedSupplier.products.map((product) => {
                    const selected = form.selectedProducts.includes(product)
                    return (
                      <button
                        key={product}
                        type="button"
                        className={`maker-product-chip${selected ? ' is-selected' : ''}`}
                        onClick={() => toggleProduct(product)}
                      >
                        {selected ? <Check aria-hidden="true" /> : null}
                        <span>{product}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="maker-product-empty">
                  Tidak ada produk supplier. Output tetap “Belanja Bahan Baku”.
                </div>
              )}
            </div>

            <label className="maker-field">
              <span>Rekening Tujuan</span>
              <select
                value={form.accountId}
                onChange={(event) =>
                  updateField('accountId', event.target.value)
                }
                disabled={
                  !form.supplierId ||
                  loadingAccounts ||
                  supplierAccounts.length === 0
                }
              >
                <option value="">
                  {!form.supplierId
                    ? 'Pilih supplier terlebih dahulu'
                    : loadingAccounts
                      ? 'Memuat rekening...'
                      : 'Pilih rekening tujuan'}
                </option>
                {supplierAccounts.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.bank} — {account.accountNumber}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {form.flowType === 'neutral' ? (
          <div className="maker-fixed-account">
            <span className="maker-fixed-account-label">Rekening Gas</span>
            <strong>{selectedAccount?.accountName ?? 'ARUTALA'}</strong>
            <span>
              {selectedAccount?.bank ?? 'BNI'} •{' '}
              {selectedAccount?.accountNumber ?? '1985322260'}
            </span>
          </div>
        ) : null}

        <div className="maker-form-grid maker-form-grid--entry">
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
              disabled={!amountReady}
            />
          </label>

          <div className="maker-form-actions">
            <button
              type="button"
              className="app-action-button"
              onClick={() => void addMakerItem()}
              disabled={saving || !form.amount || !amountReady}
            >
              <Plus aria-hidden="true" />
              <span>Tambah</span>
            </button>
          </div>
        </div>

        {form.flowType === 'income' ? (
          <p className="maker-helper-text">
            Produk boleh tidak dipilih. Kalau kosong, output otomatis “Belanja
            Bahan Baku, DD-MM-YYYY”.
          </p>
        ) : null}

        {form.flowType === 'operational' ? (
          <p className="maker-helper-text">
            Operasional tidak masuk database Maker. Data hanya tersimpan di
            localStorage browser ini.
          </p>
        ) : null}

        {errorMessage ? (
          <div className="maker-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </section>

      <section className="maker-summary-grid maker-summary-grid--five">
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
        <div className="maker-summary-card maker-summary-card--local">
          <span>Operasional Lokal</span>
          <strong>{formatCurrency(localOperationalTotal)}</strong>
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
        ) : filteredItems.length === 0 && filteredLocalOperationalItems.length === 0 ? (
          <div className="maker-empty">
            Belum ada pencairan untuk tanggal dan dapur ini.
          </div>
        ) : (
          <div className="maker-list">
            {filteredItems.map((item, index) => {
              const description = buildMakerDescription(
                item.transactionDate,
                item.flowType,
                item.selectedProducts
              )
              const account = getItemAccount(item.accountId)

              return (
                <article className="maker-item-card" key={item.id}>
                  <div className="maker-item-top">
                    <div className="maker-item-index">{index + 1}</div>
                    <div className="maker-item-heading">
                      <div>
                        <strong>{account?.accountName ?? item.accountId}</strong>
                        <span>
                          {account?.bank ?? '-'} • {account?.accountNumber ?? '-'}
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
                    <button
                      type="button"
                      className="maker-copy-box"
                      onClick={() => void handleCopyNominal(item.amount)}
                      title="Klik untuk copy nominal"
                    >
                      <span>Nominal</span>
                      <strong>{formatNumber(item.amount)}</strong>
                      <Copy aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      className="maker-copy-box"
                      onClick={() => void handleCopyDescription(description)}
                      title="Klik untuk copy keterangan"
                    >
                      <span>Output</span>
                      <strong>{description}</strong>
                      <Copy aria-hidden="true" />
                    </button>
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
                          <span>Kembalikan</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="maker-item-button maker-item-button--danger"
                        onClick={() => void deleteMaker(item)}
                      >
                        <Trash2 aria-hidden="true" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}

            {filteredLocalOperationalItems.map((item, index) => (
              <article className="maker-item-card maker-item-card--local" key={item.id}>
                <div className="maker-item-top">
                  <div className="maker-item-index">L{index + 1}</div>
                  <div className="maker-item-heading">
                    <div>
                      <strong>Biaya Operasional</strong>
                      <span>Disimpan lokal • tidak masuk database Maker</span>
                    </div>
                    <span className="maker-status maker-status-local">Lokal</span>
                  </div>
                </div>

                <div className="maker-item-meta">
                  <span>Biaya Ops</span>
                  <span>•</span>
                  <span>{formatCurrency(item.amount)}</span>
                </div>

                <div className="maker-copy-grid">
                  <button
                    type="button"
                    className="maker-copy-box"
                    onClick={() => void handleCopyNominal(item.amount)}
                    title="Klik untuk copy nominal"
                  >
                    <span>Nominal</span>
                    <strong>{formatNumber(item.amount)}</strong>
                    <Copy aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    className="maker-copy-box"
                    onClick={() => void handleCopyDescription(item.description)}
                    title="Klik untuk copy keterangan"
                  >
                    <span>Output</span>
                    <strong>{item.description}</strong>
                    <Copy aria-hidden="true" />
                  </button>
                </div>

                <div className="maker-item-actions">
                  <button
                    type="button"
                    className="maker-item-button maker-item-button--danger"
                    onClick={() => deleteLocalOperationalItem(item)}
                  >
                    <Trash2 aria-hidden="true" />
                    <span>Hapus</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="maker-realize-panel">
          <div>
            <span className="maker-eyebrow">Realisasi</span>
            <h2>Masukkan pencairan ke transaksi</h2>
            <p>
              Hanya item Maker database yang berstatus PROCESSED yang ikut
              direalisasikan. Operasional lokal tidak ikut.
            </p>
          </div>
          <button
            type="button"
            className="app-action-button"
            onClick={() => void realizeItems()}
            disabled={!canRealize}
          >
            <Check aria-hidden="true" />
            <span>Realisasikan</span>
          </button>
        </div>
      </section>
    </div>
  )
}
