import { Check, Copy, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
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
  updateMakerStatus,
  updateMakerItemDetails
} from '@/features/disbursement-maker/disbursement-maker-service'
import type {
  MakerAccountOption,
  MakerFlow,
  MakerItem,
  MakerKitchen
} from '@/features/disbursement-maker/disbursement-maker-types'
import { AnimatedSelect } from '@/components/ui/animated-select'
import { SingleDatePicker } from '@/components/ui/date-picker'
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

function formatSupplierAccountLabel(account: MakerAccountOption) {
  const owner = account.supplierOwnerName?.trim()
  const businessName = account.supplierName?.trim() ?? account.accountName
  const ownerPart = owner ? ` — ${owner}` : ''
  return `${businessName}${ownerPart} — ${account.bank} (${account.accountNumber})`
}

function getStatusLabel(status: MakerItem['status']) {
  switch (status) {
    case 'REQUEST':
      return 'Request'
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
    case 'REQUEST':
      return 'maker-status maker-status-request'
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
  const [editingItem, setEditingItem] = useState<MakerItem | null>(null)
  const [editingAccounts, setEditingAccounts] = useState<MakerAccountOption[]>(
    []
  )
  const [loadingEditAccounts, setLoadingEditAccounts] = useState(false)
  const [editingSaving, setEditingSaving] = useState(false)
  const [editingForm, setEditingForm] = useState({
    transactionDate: '',
    kitchenId: '',
    flowType: 'income' as MakerFlow,
    accountId: '',
    selectedProducts: [] as string[],
    amount: ''
  })

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

  const supplierAccountOptions = useMemo(
    () =>
      accounts
        .filter((account) =>
          Boolean(account.supplierId && account.supplierName)
        )
        .sort((a, b) => {
          const supplierCompare = (a.supplierName ?? '').localeCompare(
            b.supplierName ?? '',
            'id',
            { sensitivity: 'base' }
          )

          if (supplierCompare !== 0) {
            return supplierCompare
          }

          return a.accountNumber.localeCompare(b.accountNumber, 'id')
        }),
    [accounts]
  )

  const selectedSupplierAccount = useMemo(
    () =>
      accounts.find(
        (account) =>
          account.accountId === form.accountId &&
          account.supplierId === form.supplierId
      ) ?? null,
    [accounts, form.accountId, form.supplierId]
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

          if (item.status === 'REQUEST') {
            result.request += item.amount
          }

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
          request: 0,
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
    (item) => item.status === 'READY' || item.status === 'PROCESSED'
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
    if (!editingItem || !editingForm.kitchenId) {
      return
    }

    let cancelled = false

    void Promise.resolve()
      .then(() => {
        if (cancelled) return null
        return Promise.all([
          getMakerAccountOptions(editingForm.kitchenId, 'income'),
          getMakerAccountOptions(editingForm.kitchenId, 'neutral')
        ])
      })
      .then((result) => {
        if (!result) return

        const [incomeAccounts, neutralAccounts] = result
        if (cancelled) return

        const nextAccounts = [...incomeAccounts, ...neutralAccounts]
        setEditingAccounts(nextAccounts)

        setEditingForm((current) => {
          const currentAccountValid = nextAccounts.some(
            (account) => account.accountId === current.accountId
          )

          if (current.flowType === 'neutral') {
            return {
              ...current,
              accountId: neutralAccounts[0]?.accountId ?? current.accountId,
              selectedProducts: []
            }
          }

          return {
            ...current,
            accountId: currentAccountValid ? current.accountId : '',
            selectedProducts: currentAccountValid
              ? current.selectedProducts
              : []
          }
        })
      })
      .catch((error) => {
        if (cancelled) return
        console.error(error)
        setEditingAccounts([])
        toastError(
          'Gagal memuat rekening',
          'Mapping rekening untuk dapur yang dipilih tidak dapat dimuat.'
        )
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingEditAccounts(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [editingItem, editingForm.kitchenId, toastError])

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
      const accountId = value as string
      const selectedSupplierAccount =
        supplierAccountOptions.find(
          (account) => account.accountId === accountId
        ) ?? null
      const supplierId = selectedSupplierAccount?.supplierId ?? ''
      const autoProducts =
        selectedSupplierAccount?.supplierProducts.length === 1
          ? selectedSupplierAccount.supplierProducts
          : []

      setForm((current) => ({
        ...current,
        supplierId,
        accountId,
        selectedProducts: autoProducts,
        amount: ''
      }))

      if (autoProducts.length === 1) {
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

  async function startEditingItem(item: MakerItem) {
    if (item.status === 'PROCESSED' || item.status === 'REALIZED') {
      return
    }

    setEditingItem(item)
    setLoadingEditAccounts(true)
    setErrorMessage('')

    try {
      const incomeAccounts = await getMakerAccountOptions(
        item.kitchenId,
        'income'
      )
      const neutralAccounts = await getMakerAccountOptions(
        item.kitchenId,
        'neutral'
      )
      const nextAccounts = [...incomeAccounts, ...neutralAccounts]
      setEditingAccounts(nextAccounts)

      const selectedAccount = nextAccounts.find(
        (account) => account.accountId === item.accountId
      )

      if (!selectedAccount) {
        throw new Error(
          'Rekening request tidak lagi tersedia pada mapping dapur.'
        )
      }

      setEditingForm({
        transactionDate: item.transactionDate,
        kitchenId: item.kitchenId,
        flowType: item.flowType,
        accountId: item.accountId,
        selectedProducts: item.selectedProducts,
        amount: String(item.amount)
      })
    } catch (error) {
      console.error(error)
      setEditingItem(null)
      setEditingAccounts([])
      toastError(
        'Gagal membuka editor',
        error instanceof Error ? error.message : 'Data request gagal dimuat.'
      )
    } finally {
      setLoadingEditAccounts(false)
    }
  }

  function cancelEditingItem() {
    setEditingItem(null)
    setEditingAccounts([])
    setEditingSaving(false)
  }

  function updateEditingForm(
    key: keyof typeof editingForm,
    value: string | string[]
  ) {
    setEditingForm((current) => ({
      ...current,
      [key]: value
    }))
  }

  async function saveEditingItem() {
    if (!editingItem || !user?.id || editingSaving) {
      return
    }

    setEditingSaving(true)
    setErrorMessage('')

    try {
      const updatedItem = await updateMakerItemDetails({
        makerItemId: editingItem.id,
        kitchenId: editingForm.kitchenId,
        transactionDate: editingForm.transactionDate,
        accountId: editingForm.accountId,
        amount: editingForm.amount,
        flowType: editingForm.flowType,
        selectedProducts:
          editingForm.flowType === 'income' ? editingForm.selectedProducts : [],
        updatedBy: user.id
      })

      setItems((current) =>
        current.map((candidate) =>
          candidate.id === updatedItem.id ? updatedItem : candidate
        )
      )
      success('Request diperbarui', 'Data pencairan berhasil disimpan.')
      cancelEditingItem()
    } catch (error) {
      console.error(error)
      toastError(
        'Gagal menyimpan perubahan',
        error instanceof Error ? error.message : 'Request gagal diperbarui.'
      )
    } finally {
      setEditingSaving(false)
    }
  }

  async function acceptRequest(item: MakerItem) {
    if (item.status !== 'REQUEST') return

    try {
      const updatedItem = await updateMakerStatus(
        item.id,
        'READY',
        undefined,
        user?.id
      )

      setItems((current) =>
        current.map((candidate) =>
          candidate.id === updatedItem.id ? updatedItem : candidate
        )
      )
      success('Request diterima', 'Request masuk ke antrean pencairan.')
    } catch (error) {
      console.error(error)
      toastError(
        'Gagal menerima request',
        error instanceof Error ? error.message : 'Request gagal diproses.'
      )
    }
  }

  async function setProcessed(item: MakerItem) {
    if (item.status !== 'READY') return

    try {
      const updatedItem = await updateMakerStatus(
        item.id,
        'PROCESSED',
        undefined,
        user?.id
      )

      setItems((current) =>
        current.map((candidate) =>
          candidate.id === updatedItem.id ? updatedItem : candidate
        )
      )
      success('Pencairan selesai', 'Item berhasil ditandai sudah diproses.')
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
      const updatedItem = await updateMakerStatus(
        item.id,
        'READY',
        undefined,
        user?.id
      )

      setItems((current) =>
        current.map((candidate) =>
          candidate.id === updatedItem.id ? updatedItem : candidate
        )
      )
      success('Status dikembalikan', 'Item kembali ke status siap diproses.')
    } catch (error) {
      console.error(error)
      toastError(
        'Gagal mengubah status',
        error instanceof Error ? error.message : 'Status Maker gagal diubah.'
      )
    }
  }

  async function deleteMaker(item: MakerItem) {
    if (item.status === 'PROCESSED' || item.status === 'REALIZED') return

    const confirmed = window.confirm(
      `Hapus pencairan ${getFlowLabel(item.flowType)} sebesar ${formatCurrency(
        item.amount
      )}?`
    )

    if (!confirmed) return

    try {
      await deleteMakerItem(item.id)
      setItems((current) =>
        current.filter((candidate) => candidate.id !== item.id)
      )
      success('Pencairan dihapus', 'Item Maker berhasil dihapus.')
    } catch (error) {
      console.error(error)
      toastError(
        'Gagal menghapus',
        error instanceof Error ? error.message : 'Item Maker gagal dihapus.'
      )
    }
  }

  function deleteLocalOperationalItem(item: LocalOperationalItem) {
    if (
      !window.confirm(`Hapus operasional lokal ${formatCurrency(item.amount)}?`)
    ) {
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
            <SingleDatePicker
              label="Tanggal"
              value={form.transactionDate}
              onChange={(value) => updateField('transactionDate', value)}
            />

            <AnimatedSelect
              label="Dapur"
              value={form.kitchenId}
              options={[
                {
                  value: '',
                  label: loadingKitchens ? 'Memuat dapur...' : 'Pilih dapur'
                },
                ...kitchens.map((kitchen) => ({
                  value: kitchen.id,
                  label: kitchen.name
                }))
              ]}
              placeholder={loadingKitchens ? 'Memuat dapur...' : 'Pilih dapur'}
              disabled={loadingKitchens}
              onChange={(value) => updateField('kitchenId', value)}
            />

            <AnimatedSelect
              label="Jenis pencairan"
              value={form.flowType}
              options={[
                {
                  value: '',
                  label: dateAndKitchenReady
                    ? 'Pilih jenis pencairan'
                    : 'Pilih tanggal dan dapur terlebih dahulu'
                },
                { value: 'income', label: 'RAB' },
                { value: 'operational', label: 'Biaya Operasional' },
                { value: 'neutral', label: 'Gas' }
              ]}
              placeholder={
                dateAndKitchenReady
                  ? 'Pilih jenis pencairan'
                  : 'Pilih tanggal dan dapur terlebih dahulu'
              }
              disabled={!dateAndKitchenReady}
              onChange={(value) =>
                updateField('flowType', value as MakerFormFlow)
              }
            />
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
            <h2>
              {form.flowType ? getFlowLabel(form.flowType) : 'Tambah pencairan'}
            </h2>
            <p>
              {form.flowType === 'income'
                ? 'Pilih supplier, produk, dan nominal.'
                : form.flowType === 'operational'
                  ? 'Operasional hanya disimpan di browser ini.'
                  : form.flowType === 'neutral'
                    ? 'Rekening gas otomatis ARUTALA BNI.'
                    : 'Pilih jenis pencairan terlebih dahulu.'}
            </p>
          </div>
        </div>

        {form.flowType === 'income' ? (
          <div className="maker-rab-grid">
            <div className="maker-field maker-field--select">
              <AnimatedSelect
                label="Supplier"
                value={form.accountId}
                options={[
                  {
                    value: '',
                    label: loadingAccounts
                      ? 'Memuat supplier...'
                      : 'Pilih supplier'
                  },
                  ...supplierAccountOptions.map((account) => ({
                    value: account.accountId,
                    label: formatSupplierAccountLabel(account)
                  }))
                ]}
                placeholder={
                  loadingAccounts ? 'Memuat supplier...' : 'Pilih supplier'
                }
                disabled={loadingAccounts || !supplierAccountOptions.length}
                onChange={(value) => updateField('supplierId', value)}
              />
            </div>

            <div className="maker-field maker-products-field">
              <span>Bahan Baku</span>
              {selectedSupplierAccount?.supplierProducts.length ? (
                <div className="maker-product-list">
                  {selectedSupplierAccount.supplierProducts.map((product) => {
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
                  {form.accountId
                    ? 'Tidak ada produk supplier. Output tetap “Belanja Bahan Baku”.'
                    : 'Pilih supplier terlebih dahulu.'}
                </div>
              )}
            </div>

            <div className="maker-rab-amount">
              <label className="maker-field">
                <span>Nominal</span>
                <input
                  ref={amountInputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="Contoh: 2.315.000"
                  value={form.amount}
                  onChange={(event) =>
                    updateField('amount', event.target.value)
                  }
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
          </div>
        ) : null}

        {form.flowType === 'operational' || form.flowType === 'neutral' ? (
          <div
            className={`maker-form-grid maker-form-grid--entry maker-form-grid--${form.flowType}`}
          >
            {form.flowType === 'neutral' ? (
              <div className="maker-field maker-selected-account maker-entry-account">
                <span>Rekening</span>
                {selectedAccount ? (
                  <div className="maker-entry-account-copy">
                    <strong>{selectedAccount.accountName}</strong>
                    <span>
                      {selectedAccount.bank} • {selectedAccount.accountNumber}
                    </span>
                  </div>
                ) : (
                  <div className="maker-entry-account-copy">
                    <strong>
                      {loadingAccounts ? 'Memuat rekening...' : 'Rekening gas'}
                    </strong>
                    <span>
                      {loadingAccounts
                        ? 'Menyiapkan rekening tujuan'
                        : 'Rekening gas otomatis'}
                    </span>
                  </div>
                )}
              </div>
            ) : null}

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
        ) : null}

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
          {totals.request > 0 ? (
            <small>Request: {formatCurrency(totals.request)}</small>
          ) : null}
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

      {editingItem ? (
        <section className="maker-form-panel">
          <div className="maker-form-heading">
            <div className="maker-form-copy">
              <span className="maker-eyebrow">Review Request</span>
              <h2>Edit pencairan</h2>
              <p>
                Request dan item yang belum diproses masih dapat dikoreksi.
                Setelah transfer diproses, data akan dikunci.
              </p>
            </div>

            <button
              type="button"
              className="maker-item-button maker-item-button--secondary"
              onClick={cancelEditingItem}
              disabled={editingSaving}
              title="Tutup editor"
            >
              <X aria-hidden="true" />
            </button>
          </div>

          {loadingEditAccounts ? (
            <div className="maker-empty">Memuat data rekening...</div>
          ) : (
            <div className="maker-form-grid maker-form-grid--entry">
              <SingleDatePicker
                label="Tanggal"
                value={editingForm.transactionDate}
                onChange={(value) =>
                  updateEditingForm('transactionDate', value)
                }
              />

              <AnimatedSelect
                label="Dapur"
                value={editingForm.kitchenId}
                options={kitchens.map((kitchen) => ({
                  value: kitchen.id,
                  label: kitchen.name
                }))}
                placeholder="Pilih dapur"
                onChange={(value) => updateEditingForm('kitchenId', value)}
              />

              <AnimatedSelect
                label="Jenis pencairan"
                value={editingForm.flowType}
                options={[
                  { value: 'income', label: 'RAB' },
                  { value: 'neutral', label: 'Gas' }
                ]}
                onChange={(value) =>
                  setEditingForm((current) => ({
                    ...current,
                    flowType: value as MakerFlow,
                    accountId:
                      value === 'neutral'
                        ? (editingAccounts.find(
                            (account) =>
                              account.accountName === 'ARUTALA' &&
                              account.bank === 'BNI' &&
                              account.accountNumber === '1985322260'
                          )?.accountId ?? current.accountId)
                        : current.accountId,
                    selectedProducts:
                      value === 'neutral' ? [] : current.selectedProducts
                  }))
                }
              />

              {editingForm.flowType === 'income' ? (
                <div className="maker-field maker-field--select">
                  <AnimatedSelect
                    label="Supplier / Rekening"
                    value={editingForm.accountId}
                    options={editingAccounts
                      .filter((account) =>
                        Boolean(account.supplierId && account.supplierName)
                      )
                      .map((account) => ({
                        value: account.accountId,
                        label: formatSupplierAccountLabel(account)
                      }))}
                    placeholder="Pilih supplier"
                    onChange={(value) =>
                      setEditingForm((current) => ({
                        ...current,
                        accountId: value,
                        selectedProducts: []
                      }))
                    }
                  />
                </div>
              ) : (
                <div className="maker-field maker-selected-account">
                  <span>Rekening</span>
                  <div className="maker-entry-account-copy">
                    <strong>ARUTALA</strong>
                    <span>BNI • 1985322260</span>
                  </div>
                </div>
              )}

              {editingForm.flowType === 'income' ? (
                <div className="maker-field maker-products-field">
                  <span>Bahan Baku</span>
                  <div className="maker-product-list">
                    {(
                      editingAccounts.find(
                        (account) => account.accountId === editingForm.accountId
                      )?.supplierProducts ?? []
                    ).map((product) => {
                      const selected =
                        editingForm.selectedProducts.includes(product)

                      return (
                        <button
                          key={product}
                          type="button"
                          className={`maker-product-chip${
                            selected ? ' is-selected' : ''
                          }`}
                          onClick={() =>
                            updateEditingForm(
                              'selectedProducts',
                              selected
                                ? editingForm.selectedProducts.filter(
                                    (item) => item !== product
                                  )
                                : [...editingForm.selectedProducts, product]
                            )
                          }
                        >
                          {selected ? <Check aria-hidden="true" /> : null}
                          <span>{product}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <label className="maker-field">
                <span>Nominal</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editingForm.amount}
                  onChange={(event) =>
                    updateEditingForm('amount', event.target.value)
                  }
                />
              </label>

              <div className="maker-form-actions">
                <button
                  type="button"
                  className="app-action-button app-action-button--secondary"
                  onClick={cancelEditingItem}
                  disabled={editingSaving}
                >
                  <X aria-hidden="true" />
                  <span>Batal</span>
                </button>

                <button
                  type="button"
                  className="app-action-button"
                  onClick={() => void saveEditingItem()}
                  disabled={editingSaving}
                >
                  <Check aria-hidden="true" />
                  <span>
                    {editingSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

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
        ) : filteredItems.length === 0 &&
          filteredLocalOperationalItems.length === 0 ? (
          <div className="maker-empty">
            Belum ada pencairan untuk tanggal dan dapur ini.
          </div>
        ) : (
          <div className="maker-table-wrap">
            <div
              className="maker-table"
              role="table"
              aria-label="Daftar pencairan"
            >
              <div className="maker-table-row maker-table-row--head" role="row">
                <span role="columnheader">#</span>
                <span role="columnheader">Supplier / Rekening</span>
                <span role="columnheader">Jenis</span>
                <span role="columnheader">Nominal</span>
                <span role="columnheader">Output</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Aksi</span>
              </div>

              {filteredItems.map((item, index) => {
                const description = buildMakerDescription(
                  item.transactionDate,
                  item.flowType,
                  item.selectedProducts
                )
                const account = getItemAccount(item.accountId)

                return (
                  <div
                    className={`maker-table-row ${
                      item.status === 'PROCESSED'
                        ? 'maker-table-row--processed'
                        : item.status === 'REALIZED'
                          ? 'maker-table-row--realized'
                          : ''
                    }`}
                    role="row"
                    key={item.id}
                  >
                    <span className="maker-table-index" role="cell">
                      {index + 1}
                    </span>

                    <div className="maker-table-supplier" role="cell">
                      <strong>
                        {account?.supplierName ??
                          account?.accountName ??
                          item.accountId}
                      </strong>
                      <span>
                        {account?.supplierOwnerName
                          ? `${account.supplierOwnerName} · `
                          : ''}
                        {account?.bank ?? '-'} · {account?.accountNumber ?? '-'}
                      </span>
                    </div>

                    <span className="maker-table-flow" role="cell">
                      {getFlowLabel(item.flowType)}
                    </span>

                    <button
                      type="button"
                      className="maker-table-copy"
                      onClick={() => void handleCopyNominal(item.amount)}
                      title="Klik untuk copy nominal"
                      role="cell"
                    >
                      <span>{formatNumber(item.amount)}</span>
                      <Copy aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      className="maker-table-copy maker-table-copy--output"
                      onClick={() => void handleCopyDescription(description)}
                      title="Klik untuk copy output"
                      role="cell"
                    >
                      <span>{description}</span>
                      <Copy aria-hidden="true" />
                    </button>

                    <span className={getStatusClass(item.status)} role="cell">
                      {getStatusLabel(item.status)}
                    </span>

                    <div className="maker-table-actions" role="cell">
                      {item.status === 'REQUEST' ? (
                        <>
                          <button
                            type="button"
                            className="maker-item-button maker-item-button--secondary"
                            onClick={() => void startEditingItem(item)}
                            title="Review dan edit request"
                          >
                            <Pencil aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="maker-item-button maker-item-button--success"
                            onClick={() => void acceptRequest(item)}
                            title="Terima request"
                          >
                            <Check aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="maker-item-button maker-item-button--danger"
                            onClick={() => void deleteMaker(item)}
                            title="Hapus request"
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </>
                      ) : item.status === 'READY' ? (
                        <>
                          <button
                            type="button"
                            className="maker-item-button maker-item-button--secondary"
                            onClick={() => void startEditingItem(item)}
                            title="Edit sebelum diproses"
                          >
                            <Pencil aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="maker-item-button maker-item-button--success"
                            onClick={() => void setProcessed(item)}
                            title="Tandai sudah diproses"
                          >
                            <Check aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="maker-item-button maker-item-button--danger"
                            onClick={() => void deleteMaker(item)}
                            title="Hapus"
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </>
                      ) : item.status === 'PROCESSED' ? (
                        <button
                          type="button"
                          className="maker-item-button maker-item-button--secondary"
                          onClick={() => void setReady(item)}
                          title="Kembalikan ke siap diproses"
                        >
                          <RefreshCw aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}

              {filteredLocalOperationalItems.map((item, index) => (
                <div
                  className="maker-table-row maker-table-row--local"
                  role="row"
                  key={item.id}
                >
                  <span className="maker-table-index" role="cell">
                    L{index + 1}
                  </span>

                  <div className="maker-table-supplier" role="cell">
                    <strong>Biaya Operasional</strong>
                    <span>Disimpan lokal · tidak masuk database Maker</span>
                  </div>

                  <span className="maker-table-flow" role="cell">
                    Biaya Ops
                  </span>

                  <button
                    type="button"
                    className="maker-table-copy"
                    onClick={() => void handleCopyNominal(item.amount)}
                    title="Klik untuk copy nominal"
                    role="cell"
                  >
                    <span>{formatNumber(item.amount)}</span>
                    <Copy aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    className="maker-table-copy maker-table-copy--output"
                    onClick={() => void handleCopyDescription(item.description)}
                    title="Klik untuk copy output"
                    role="cell"
                  >
                    <span>{item.description}</span>
                    <Copy aria-hidden="true" />
                  </button>

                  <span className="maker-status maker-status-local" role="cell">
                    Lokal
                  </span>

                  <div className="maker-table-actions" role="cell">
                    <button
                      type="button"
                      className="maker-item-button maker-item-button--danger"
                      onClick={() => deleteLocalOperationalItem(item)}
                      title="Hapus"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="maker-realize-panel">
          <div>
            <span className="maker-eyebrow">Realisasi</span>
            <h2>Masukkan pencairan ke transaksi</h2>
            <p>
              Request harus diterima menjadi READY lalu diproses menjadi
              PROCESSED. Hanya item PROCESSED yang masuk ke transaksi.
              Operasional lokal tidak ikut.
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
