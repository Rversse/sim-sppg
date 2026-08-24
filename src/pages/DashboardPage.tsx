import { useCallback, useEffect, useRef, useState } from 'react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/use-auth'
import {
  getActiveKitchens,
  getDashboardSummary,
  getDashboardTransactionPage,
  getDailyStatus,
  getSupplierOptions,
  type DashboardFilters,
  type DashboardKitchen,
  type DashboardSummary,
  type DashboardTransaction,
  type DashboardFlow
} from '@/features/dashboard/dashboard-service'

import {
  createTransaction,
  deleteTransaction,
  hasDuplicateTransaction,
  updateTransaction
} from '@/features/transactions/transaction-service'

import {
  getAccountsForFlow,
  getAvailableTransactionFlows,
  getDefaultOperationalAccount,
  getDefaultSupplier,
  getSuppliersForKitchen,
  type TransactionOption
} from '@/features/transactions/transaction-options-service'
import { DateRangePicker } from '@/components/ui/date-range-picker'

import {
  formatCurrency,
  formatDate,
  formatDateTimeWithSeconds,
  getTodayLocal
} from '@/lib/formatters'

const DASHBOARD_HISTORY_PAGE_SIZE = 6

const FLOW_OPTIONS: { value: DashboardFlow | ''; label: string }[] = [
  { value: '', label: 'Semua transaksi' },
  { value: 'income', label: 'RAB' },
  { value: 'expense', label: 'Pembayaran Supplier' },
  { value: 'neutral', label: 'Operasional' }
]

function flowLabel(flow: DashboardFlow) {
  if (flow === 'income') return 'RAB'
  if (flow === 'expense') return 'Supplier'
  return 'Operasional'
}

function flowClass(flow: DashboardFlow) {
  if (flow === 'income') return 'dashboard-flow dashboard-flow-income'
  if (flow === 'expense') return 'dashboard-flow dashboard-flow-expense'
  return 'dashboard-flow dashboard-flow-neutral'
}

function formatIntegerInput(value: string) {
  const digits = value.replace(/\D/g, '')

  if (!digits) return ''

  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0
  }).format(Number(digits))
}

function parseIntegerInput(value: string) {
  const digits = value.replace(/\D/g, '')

  return digits ? Number(digits) : 0
}

function formatHistoryInputTimestamp(value: string) {
  return `Input: ${formatDateTimeWithSeconds(value)}`
}

function getFormAccountLabel(
  option: TransactionOption,
  flowType: DashboardFlow | ''
) {
  if (flowType !== 'income') {
    return option.label
  }

  // RAB only needs business/owner identity in the picker. The account
  // number and bank are intentionally omitted from the UI label.
  return option.label.replace(/\s*\([^)]*\)\s*$/, '')
}

function getDashboardPaginationPages(
  currentPage: number,
  totalPages: number
): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages: Array<number | 'ellipsis'> = [1]

  if (currentPage > 4) {
    pages.push('ellipsis')
  }

  for (
    let page = Math.max(2, currentPage - 1);
    page <= Math.min(totalPages - 1, currentPage + 1);
    page += 1
  ) {
    pages.push(page)
  }

  if (currentPage < totalPages - 3) {
    pages.push('ellipsis')
  }

  pages.push(totalPages)
  return pages
}

type StatusData = Awaited<ReturnType<typeof getDailyStatus>>

type DashboardHistoryMeta = {
  businessName: string
  ownerName: string
  bankAccount: string
}

type HistoryAccountRow = {
  id: string
  name: string
  bank: string
  account_number: string
  income_suppliers:
    | {
        business_name: string | null
        owner_name: string | null
      }
    | {
        business_name: string | null
        owner_name: string | null
      }[]
    | null
}

type HistorySupplierRow = {
  id: string
  name: string | null
}

export function DashboardPage() {
  const { user } = useAuth()
  const today = getTodayLocal()

  const [filters, setFilters] = useState<DashboardFilters>({
    startDate: today,
    endDate: today,
    kitchenId: '',
    flowType: '',
    supplierFilter: ''
  })

  const [kitchens, setKitchens] = useState<DashboardKitchen[]>([])
  const [supplierOptions, setSupplierOptions] = useState<
    { value: string; label: string }[]
  >([])
  const [availableFilterFlows, setAvailableFilterFlows] = useState<
    DashboardFlow[]
  >(['income', 'expense', 'neutral'])
  const [summary, setSummary] = useState<DashboardSummary>({
    income: 0,
    expense: 0,
    operational: 0
  })
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([])
  const [totalTransactions, setTotalTransactions] = useState(0)
  const [transactionPage, setTransactionPage] = useState(1)
  const [dailyStatus, setDailyStatus] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [formDate, setFormDate] = useState(today)
  const [formKitchenId, setFormKitchenId] = useState('')
  const [formFlowType, setFormFlowType] = useState<DashboardFlow | ''>('')
  const [availableFormFlows, setAvailableFormFlows] = useState<DashboardFlow[]>(
    []
  )
  const [formAccountId, setFormAccountId] = useState('')
  const [formSupplierId, setFormSupplierId] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formNote, setFormNote] = useState('')

  const [formAccounts, setFormAccounts] = useState<TransactionOption[]>([])
  const [formSuppliers, setFormSuppliers] = useState<TransactionOption[]>([])
  const [formEntryUnlocked, setFormEntryUnlocked] = useState(false)
  const nominalInputRef = useRef<HTMLInputElement | null>(null)

  function focusNominalInput() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        nominalInputRef.current?.focus()
      })
    })
  }
  const [historyMeta, setHistoryMeta] = useState<
    Record<string, DashboardHistoryMeta>
  >({})

  const loadDashboardData = useCallback(async () => {
    const [
      nextSummary,
      nextStatus,
      nextKitchens,
      nextTransactions,
      nextSuppliers
    ] = await Promise.all([
      getDashboardSummary(filters),
      getDailyStatus(filters.startDate),
      kitchens.length ? Promise.resolve(kitchens) : getActiveKitchens(),
      getDashboardTransactionPage(
        filters,
        transactionPage,
        DASHBOARD_HISTORY_PAGE_SIZE
      ),
      getSupplierOptions(filters)
    ])

    return {
      summary: nextSummary,
      dailyStatus: nextStatus,
      kitchens: nextKitchens,
      transactions: nextTransactions,
      supplierOptions: nextSuppliers
    }
  }, [filters, kitchens, transactionPage])

  const applyDashboardData = useCallback(
    (data: Awaited<ReturnType<typeof loadDashboardData>>) => {
      setSummary(data.summary)
      setTransactions(data.transactions.data)
      setTotalTransactions(data.transactions.total)
      setDailyStatus(data.dailyStatus)
      setKitchens(data.kitchens)
      setSupplierOptions(data.supplierOptions)
    },
    []
  )

  const refreshDashboard = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setLoading(true)
      }

      setError(null)

      try {
        const data = await loadDashboardData()
        applyDashboardData(data)
      } catch (loadError) {
        console.error(loadError)
        setError('Gagal memuat Dashboard. Coba refresh atau periksa koneksi.')
      } finally {
        if (showLoading) {
          setLoading(false)
        }
      }
    },
    [applyDashboardData, loadDashboardData]
  )

  useEffect(() => {
    let cancelled = false

    void Promise.resolve()
      .then(() => {
        if (cancelled) {
          return null
        }

        setLoading(true)
        setError(null)

        return loadDashboardData()
      })
      .then((data) => {
        if (!data || cancelled) {
          return
        }

        applyDashboardData(data)
        setLoading(false)
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return
        }

        console.error(loadError)
        setError('Gagal memuat Dashboard. Coba refresh atau periksa koneksi.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [applyDashboardData, loadDashboardData])

  useEffect(() => {
    let cancelled = false
    let refreshInFlight = false
    let refreshQueued = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRealtimeRefresh = () => {
      if (cancelled) {
        return
      }

      if (refreshTimer !== null) {
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

        void refreshDashboard(false)
          .catch((refreshError) => {
            console.error(
              'Gagal memperbarui Dashboard dari Realtime:',
              refreshError
            )
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

    const channel = supabase
      .channel('dashboard-transactions-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        () => {
          scheduleRealtimeRefresh()
        }
      )
      .subscribe((status) => {
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          console.warn(`[Dashboard Realtime] ${status}`)
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
  }, [refreshDashboard])

  const net = filters.flowType === '' ? summary.income - summary.expense : 0

  const selectedFilterKitchen = kitchens.find(
    (kitchen) => kitchen.id === filters.kitchenId
  )
  const isSukarajaFilterKitchen =
    selectedFilterKitchen?.name?.includes('Sukaraja') ?? false

  const supplierLockedToArutala =
    filters.flowType === 'expense' &&
    Boolean(filters.kitchenId) &&
    !isSukarajaFilterKitchen

  const supplierDisabled =
    filters.flowType === 'neutral' || supplierLockedToArutala

  const supplierFilterLabel =
    filters.flowType === 'income'
      ? 'Rekening Supplier'
      : filters.flowType === 'expense'
        ? 'Supplier'
        : filters.flowType === 'neutral'
          ? 'Rekening Operasional'
          : 'Supplier / Rekening'

  const supplierPlaceholder = supplierDisabled
    ? filters.flowType === 'neutral'
      ? 'Arutala BNI'
      : 'Koperasi Arutala'
    : filters.flowType === 'expense' && isSukarajaFilterKitchen
      ? 'Semua supplier'
      : filters.flowType === 'income'
        ? 'Semua rekening'
        : 'Semua supplier / rekening'

  const selectedFormKitchen = kitchens.find(
    (kitchen) => kitchen.id === formKitchenId
  )
  const isSukarajaFormKitchen =
    selectedFormKitchen?.name?.includes('Sukaraja') ?? false

  function updateFilter<K extends keyof DashboardFilters>(
    key: K,
    value: DashboardFilters[K]
  ) {
    setTransactionPage(1)
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function handleDateRangeChange({
    startDate,
    endDate
  }: {
    startDate: string
    endDate: string
  }) {
    setTransactionPage(1)
    setFilters((current) => ({
      ...current,
      startDate,
      endDate,
      supplierFilter: ''
    }))
  }

  function handleKitchen(value: string) {
    setTransactionPage(1)

    // Changing the kitchen always resets the dependent filters.
    setFilters((current) => ({
      ...current,
      kitchenId: value,
      flowType: '',
      supplierFilter: ''
    }))

    // Start from the common flows while the kitchen-specific rules load.
    // This prevents a stale "Operasional" selection from surviving a kitchen change.
    if (!value) {
      setAvailableFilterFlows(['income', 'expense', 'neutral'])
      return
    }

    setAvailableFilterFlows(['income', 'expense'])

    void getAvailableTransactionFlows(value)
      .then((flows) => {
        setAvailableFilterFlows(flows)
      })
      .catch((loadError) => {
        console.error(loadError)
        setAvailableFilterFlows(['income', 'expense'])
      })
  }

  async function handleFlow(value: DashboardFlow | '') {
    setTransactionPage(1)
    setFilters((current) => ({
      ...current,
      flowType: value,
      supplierFilter: ''
    }))

    if (value === 'neutral') {
      try {
        const options = await getSupplierOptions({
          startDate: filters.startDate,
          endDate: filters.endDate,
          kitchenId: filters.kitchenId,
          flowType: value
        })

        const operationalAccount = options[0]

        if (operationalAccount) {
          setFilters((current) => {
            if (current.flowType !== 'neutral') return current

            return {
              ...current,
              supplierFilter: operationalAccount.value
            }
          })
        }
      } catch (loadError) {
        console.error(loadError)
      }
    }
  }

  const loadHistoryMeta = useCallback(async () => {
    if (!transactions.length) {
      return {} as Record<string, DashboardHistoryMeta>
    }

    const accountIds = [
      ...new Set(
        transactions
          .map((transaction) => transaction.account_id)
          .filter((value): value is string => Boolean(value))
      )
    ]

    const supplierIds = [
      ...new Set(
        transactions
          .map((transaction) => transaction.supplier_id)
          .filter((value): value is string => Boolean(value))
      )
    ]

    const [accountsResult, suppliersResult] = await Promise.all([
      accountIds.length
        ? supabase
            .from('accounts')
            .select(
              `
              id,
              name,
              bank,
              account_number,
              income_suppliers(
                business_name,
                owner_name
              )
              `
            )
            .in('id', accountIds)
        : Promise.resolve({ data: [], error: null }),
      supplierIds.length
        ? supabase.from('suppliers').select('id,name').in('id', supplierIds)
        : Promise.resolve({ data: [], error: null })
    ])

    if (accountsResult.error) {
      throw accountsResult.error
    }

    if (suppliersResult.error) {
      throw suppliersResult.error
    }

    const accountMap = new Map(
      ((accountsResult.data ?? []) as unknown as HistoryAccountRow[]).map(
        (account) => [account.id, account]
      )
    )

    const supplierMap = new Map(
      ((suppliersResult.data ?? []) as unknown as HistorySupplierRow[]).map(
        (supplier) => [supplier.id, supplier]
      )
    )

    const next: Record<string, DashboardHistoryMeta> = {}

    for (const transaction of transactions) {
      const account = transaction.account_id
        ? accountMap.get(transaction.account_id)
        : undefined

      const supplier = transaction.supplier_id
        ? supplierMap.get(transaction.supplier_id)
        : undefined

      const accountSupplier = account
        ? Array.isArray(account.income_suppliers)
          ? account.income_suppliers[0]
          : account.income_suppliers
        : null

      const businessName =
        transaction.flow_type === 'expense'
          ? supplier?.name?.trim() || 'Supplier tidak diketahui'
          : accountSupplier?.business_name?.trim() ||
            account?.name?.trim() ||
            'Transaksi'

      // `transactions` does not store an owner for expense rows.
      // Keep this empty instead of guessing from unrelated master data.
      const ownerName =
        transaction.flow_type === 'expense'
          ? ''
          : accountSupplier?.owner_name?.trim() || ''

      const bankAccount = account
        ? `${account.bank} - ${account.account_number}`
        : ''

      next[transaction.id] = {
        businessName,
        ownerName,
        bankAccount
      }
    }

    return next
  }, [transactions])

  useEffect(() => {
    let cancelled = false

    void loadHistoryMeta()
      .then((next) => {
        if (!cancelled) {
          setHistoryMeta(next)
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          console.error('Gagal memuat metadata riwayat transaksi:', loadError)
          setHistoryMeta({})
        }
      })

    return () => {
      cancelled = true
    }
  }, [loadHistoryMeta])

  function resetTransactionForm() {
    setFormDate(today)
    setFormKitchenId('')
    setFormFlowType('')
    setAvailableFormFlows([])
    setFormAccountId('')
    setFormSupplierId('')
    setFormAmount('')
    setFormNote('')
    setFormError(null)
    setFormAccounts([])
    setFormSuppliers([])
    setFormEntryUnlocked(false)
  }

  function closeTransactionModal() {
    if (saving) return

    setModalOpen(false)
    setModalMode('create')
    setEditingId(null)
    resetTransactionForm()
  }

  async function loadFormOptions(
    kitchenId: string,
    flowType: DashboardFlow | '',
    preserveAccountId = '',
    preserveSupplierId = ''
  ) {
    if (!kitchenId || !flowType) {
      setFormAccounts([])
      setFormSuppliers([])
      return
    }

    if (flowType === 'income' || flowType === 'neutral') {
      const accounts = await getAccountsForFlow(kitchenId, flowType)

      setFormAccounts(accounts)
      setFormSuppliers([])
      setFormSupplierId('')

      if (
        preserveAccountId &&
        accounts.some((item) => item.value === preserveAccountId)
      ) {
        setFormAccountId(preserveAccountId)
        setFormEntryUnlocked(true)
      } else if (flowType === 'neutral') {
        const operationalAccount = getDefaultOperationalAccount(accounts)
        setFormAccountId(operationalAccount)
        setFormEntryUnlocked(Boolean(operationalAccount))
      } else {
        setFormAccountId('')
        setFormEntryUnlocked(false)
      }

      return
    }

    const suppliers = await getSuppliersForKitchen(kitchenId)

    setFormSuppliers(suppliers)
    setFormAccounts([])
    setFormAccountId('')

    if (
      preserveSupplierId &&
      suppliers.some((item) => item.value === preserveSupplierId)
    ) {
      setFormSupplierId(preserveSupplierId)
      setFormEntryUnlocked(true)
    } else {
      const selectedKitchen = kitchens.find(
        (kitchen) => kitchen.id === kitchenId
      )
      const isSukaraja = selectedKitchen?.name?.includes('Sukaraja') ?? false
      const defaultSupplier = isSukaraja ? '' : getDefaultSupplier(suppliers)

      setFormSupplierId(defaultSupplier)
      setFormEntryUnlocked(Boolean(defaultSupplier))
    }
  }

  function openCreateTransactionModal() {
    if (user?.role !== 'admin') return

    resetTransactionForm()
    setModalMode('create')
    setEditingId(null)
    setModalOpen(true)
  }

  async function openEditTransactionModal(transaction: DashboardTransaction) {
    if (user?.role !== 'admin') return

    setModalMode('edit')
    setEditingId(transaction.id)
    setFormError(null)
    setFormDate(transaction.transaction_date)
    setFormKitchenId(transaction.kitchen_id ?? '')
    setFormFlowType(transaction.flow_type)
    setFormAmount(formatIntegerInput(String(Number(transaction.amount) || 0)))
    setFormNote(transaction.note ?? '')
    setFormEntryUnlocked(true)
    setFormAccountId(transaction.account_id ?? '')
    setFormSupplierId(transaction.supplier_id ?? '')
    setFormAccounts([])
    setFormSuppliers([])
    setAvailableFormFlows([])
    setModalOpen(true)

    try {
      const availableFlows = await getAvailableTransactionFlows(
        transaction.kitchen_id ?? ''
      )

      setAvailableFormFlows(availableFlows)

      await loadFormOptions(
        transaction.kitchen_id ?? '',
        transaction.flow_type,
        transaction.account_id ?? '',
        transaction.supplier_id ?? ''
      )
    } catch (loadError) {
      console.error(loadError)
      setFormError('Gagal memuat rekening atau supplier transaksi.')
    }
  }

  async function handleFormKitchenChange(value: string) {
    const preserveSupplierFlow = formFlowType === 'expense'

    setFormKitchenId(value)
    setFormAccountId('')
    setFormSupplierId('')
    setFormAmount('')
    setFormNote('')
    setFormEntryUnlocked(false)
    setFormAccounts([])
    setFormSuppliers([])
    setFormError(null)

    if (!value) {
      setAvailableFormFlows([])
      setFormFlowType('')
      setFormEntryUnlocked(false)
      return
    }

    try {
      const availableFlows = await getAvailableTransactionFlows(value)
      const nextFlowType =
        preserveSupplierFlow && availableFlows.includes('expense')
          ? 'expense'
          : ''

      setAvailableFormFlows(availableFlows)
      setFormFlowType(nextFlowType)

      if (nextFlowType === 'expense') {
        await loadFormOptions(value, nextFlowType)

        const selectedKitchen = kitchens.find((kitchen) => kitchen.id === value)
        const isSukaraja = selectedKitchen?.name?.includes('Sukaraja') ?? false

        if (!isSukaraja) {
          focusNominalInput()
        }
      }
    } catch (loadError) {
      console.error(loadError)
      setAvailableFormFlows([])
      setFormFlowType('')
      setFormError('Gagal memuat jenis transaksi.')
    }
  }

  async function handleFormFlowChange(value: DashboardFlow | '') {
    setFormFlowType(value)
    setFormAccountId('')
    setFormSupplierId('')
    setFormAmount('')
    setFormNote('')
    setFormEntryUnlocked(false)
    setFormAccounts([])
    setFormSuppliers([])
    setFormError(null)

    if (!formKitchenId || !value) {
      return
    }

    try {
      await loadFormOptions(formKitchenId, value)

      if (value === 'expense') {
        const selectedKitchen = kitchens.find(
          (kitchen) => kitchen.id === formKitchenId
        )
        const isSukaraja = selectedKitchen?.name?.includes('Sukaraja') ?? false

        // Non-Sukaraja supplier payments use the fixed/default supplier,
        // so jump directly to the amount field for rapid entry.
        if (!isSukaraja) {
          focusNominalInput()
        }
      } else if (value === 'neutral') {
        // Operational account is selected automatically, so go directly to amount.
        focusNominalInput()
      }
    } catch (loadError) {
      console.error(loadError)
      setFormError('Gagal memuat rekening atau supplier transaksi.')
    }
  }

  async function handleTransactionSubmit() {
    if (saving) return

    if (!formDate) {
      setFormError('Tanggal wajib dipilih.')
      return
    }

    if (!formKitchenId) {
      setFormError('Dapur wajib dipilih.')
      return
    }

    if (!formFlowType) {
      setFormError('Jenis transaksi wajib dipilih.')
      return
    }

    const amount = parseIntegerInput(formAmount)

    if (!transactionDetailsUnlocked) {
      setFormError(
        formFlowType === 'income'
          ? 'Pilih rekening supplier terlebih dahulu.'
          : formFlowType === 'expense'
            ? 'Pilih supplier terlebih dahulu.'
            : formFlowType === 'neutral'
              ? 'Rekening operasional belum siap.'
              : 'Lengkapi dapur dan jenis transaksi terlebih dahulu.'
      )
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Nominal harus lebih dari 0.')
      return
    }

    if (
      (formFlowType === 'income' || formFlowType === 'neutral') &&
      !formAccountId
    ) {
      setFormError('Rekening wajib dipilih.')
      return
    }

    if (formFlowType === 'expense' && !formSupplierId) {
      setFormError('Supplier wajib dipilih.')
      return
    }

    const payload = {
      transaction_date: formDate,
      kitchen_id: formKitchenId,
      amount,
      note: formNote.trim() || null,
      flow_type: formFlowType,
      category:
        formFlowType === 'income'
          ? 'RAB'
          : formFlowType === 'expense'
            ? 'Supplier'
            : 'OPS',
      account_id:
        formFlowType === 'income' || formFlowType === 'neutral'
          ? formAccountId
          : null,
      supplier_id: formFlowType === 'expense' ? formSupplierId : null
    } as const

    setSaving(true)
    setFormError(null)

    try {
      if (modalMode === 'create') {
        const duplicate = await hasDuplicateTransaction(payload)

        let allowDuplicate = false

        if (duplicate) {
          const confirmed = window.confirm(
            'Transaksi dengan tanggal, dapur, rekening/supplier, dan nominal yang sama sudah ada.\n\nTetap simpan?'
          )

          if (!confirmed) {
            setSaving(false)
            return
          }

          allowDuplicate = true
        }

        await createTransaction(payload, supabase, { allowDuplicate })
      } else {
        if (!editingId) {
          throw new Error('ID transaksi tidak ditemukan')
        }

        await updateTransaction(editingId, payload)
      }

      if (modalMode === 'edit') {
        setModalOpen(false)
        setModalMode('create')
        setEditingId(null)
        resetTransactionForm()
      } else {
        // Keep the modal open for rapid multi-entry input.
        // Preserve kitchen + flow + date, clear only the field that
        // identifies the next transaction within that flow.
        setFormAmount('')
        setFormNote('')
        setFormError(null)

        if (formFlowType === 'income') {
          // RAB: choose a different supplier account for the next entry.
          setFormAccountId('')
          setFormEntryUnlocked(false)
        } else if (formFlowType === 'expense') {
          const isSukaraja = isSukarajaFormKitchen

          if (isSukaraja) {
            // Sukaraja: choose a supplier again for the next entry.
            setFormSupplierId('')
            setFormEntryUnlocked(false)
          } else {
            // Other kitchens: supplier is permanently Koperasi Arutala.
            // Keep it selected/locked so the next entry can be keyed immediately.
            setFormEntryUnlocked(true)
          }
        } else if (formFlowType === 'neutral') {
          // Operational: Arutala BNI stays selected and locked.
          setFormEntryUnlocked(Boolean(formAccountId))
        }
      }

      if (transactionPage !== 1) {
        setTransactionPage(1)
      } else {
        await refreshDashboard(false)
      }
    } catch (saveError) {
      console.error(saveError)
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : 'Gagal menyimpan transaksi.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleTransactionDelete(transaction: DashboardTransaction) {
    if (user?.role !== 'admin') return

    const confirmed = window.confirm(
      `Hapus transaksi ${formatDate(transaction.transaction_date)} sebesar ${formatCurrency(
        Number(transaction.amount) || 0
      )}?`
    )

    if (!confirmed) return

    try {
      await deleteTransaction(transaction.id)

      if (transactionPage > 1 && transactions.length === 1) {
        setTransactionPage((current) => current - 1)
      } else {
        await refreshDashboard(false)
      }
    } catch (deleteError) {
      console.error(deleteError)
      setError('Gagal menghapus transaksi.')
    }
  }

  const transactionDetailsUnlocked = modalMode === 'edit' || formEntryUnlocked

  const totalTransactionPages = Math.max(
    1,
    Math.ceil(totalTransactions / DASHBOARD_HISTORY_PAGE_SIZE)
  )
  const transactionPaginationPages = getDashboardPaginationPages(
    transactionPage,
    totalTransactionPages
  )

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-actions">
          <div className="dashboard-date-chip">
            <span>Periode : </span>
            <strong>
              {formatDate(filters.startDate)}
              {filters.endDate !== filters.startDate
                ? ` — ${formatDate(filters.endDate)}`
                : ''}
            </strong>
          </div>

          {user?.role === 'admin' ? (
            <button
              type="button"
              className="dashboard-transaction-action"
              onClick={openCreateTransactionModal}
            >
              + Transaksi
            </button>
          ) : null}
        </div>
      </section>

      <section className="dashboard-filter-card">
        <div className="dashboard-filter-heading">
          <div>
            <strong>Filter Dashboard</strong>
            <span>
              Gunakan filter untuk mempersempit data yang ditampilkan.
            </span>
          </div>
          <button
            type="button"
            className="dashboard-reset"
            onClick={() => {
              setTransactionPage(1)
              setFilters({
                startDate: today,
                endDate: today,
                kitchenId: '',
                flowType: '',
                supplierFilter: ''
              })
            }}
          >
            Reset
          </button>
        </div>

        <div className="dashboard-filter-grid">
          <DateRangePicker
            className="dashboard-date-range-field"
            value={{
              startDate: filters.startDate,
              endDate: filters.endDate
            }}
            onChange={handleDateRangeChange}
          />

          <label>
            <span>Dapur</span>
            <select
              value={filters.kitchenId}
              onChange={(event) => handleKitchen(event.target.value)}
            >
              <option value="">Semua dapur</option>
              {kitchens.map((kitchen) => (
                <option key={kitchen.id} value={kitchen.id}>
                  {kitchen.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Jenis transaksi</span>
            <select
              value={filters.flowType}
              onChange={(event) =>
                handleFlow(event.target.value as DashboardFlow | '')
              }
            >
              {FLOW_OPTIONS.filter(
                (option) =>
                  option.value === '' ||
                  availableFilterFlows.includes(option.value as DashboardFlow)
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{supplierFilterLabel}</span>
            <select
              value={
                supplierLockedToArutala
                  ? 'Koperasi Arutala'
                  : filters.supplierFilter
              }
              disabled={supplierDisabled}
              onChange={(event) =>
                updateFilter('supplierFilter', event.target.value)
              }
            >
              <option value="">{supplierPlaceholder}</option>
              {supplierOptions
                .filter(
                  (option) =>
                    !supplierLockedToArutala ||
                    option.value === 'Koperasi Arutala'
                )
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>

      {error ? <div className="dashboard-error">{error}</div> : null}

      <section className="dashboard-kpi-grid">
        <article
          className={`dashboard-kpi ${
            filters.flowType === 'income' ? 'dashboard-kpi-primary' : ''
          }`}
        >
          <span>Pencairan / RAB</span>
          <strong>
            {loading ? 'Memuat…' : formatCurrency(summary.income)}
          </strong>
          <small>Total RAB pada periode terpilih</small>
        </article>

        <article
          className={`dashboard-kpi ${
            filters.flowType === 'expense' ? 'dashboard-kpi-primary' : ''
          }`}
        >
          <span>Pembayaran Supplier</span>
          <strong>
            {loading ? 'Memuat…' : formatCurrency(summary.expense)}
          </strong>
          <small>Total pembayaran ke supplier pada periode terpilih</small>
        </article>

        <article
          className={`dashboard-kpi ${
            filters.flowType === 'neutral' ? 'dashboard-kpi-primary' : ''
          }`}
        >
          <span>Operasional</span>
          <strong>
            {loading ? 'Memuat…' : formatCurrency(summary.operational)}
          </strong>
          <small>Total transaksi operasional pada periode terpilih</small>
        </article>

        <article
          className={`dashboard-kpi ${
            filters.flowType === '' ? 'dashboard-kpi-primary' : ''
          }`}
        >
          <span>RAB − Pembayaran Supplier</span>
          <strong>
            {loading
              ? 'Memuat…'
              : formatCurrency(filters.flowType === '' ? net : 0)}
          </strong>
          <small>
            Sisa dana setelah dilakukan pembayaran ke supplier dari RAB pada
            periode terpilih
          </small>
        </article>
      </section>

      <section className="dashboard-main-grid">
        <article className="dashboard-panel dashboard-status-panel dashboard-main-panel">
          <div className="dashboard-panel-header">
            <div>
              <h2>Status Pencairan</h2>
            </div>
          </div>

          {dailyStatus ? (
            <>
              <div className="dashboard-status-summary">
                <span className="status-summary-green">
                  <b>{dailyStatus.green}</b> Lengkap
                </span>
                <span className="status-summary-yellow">
                  <b>{dailyStatus.yellow}</b> Proses
                </span>
                <span className="status-summary-red">
                  <b>{dailyStatus.red}</b> Belum
                </span>
              </div>

              <div className="dashboard-status-list">
                {dailyStatus.rows.map((row) => (
                  <div className="dashboard-status-row" key={row.kitchen}>
                    <div>
                      <strong>{row.kitchen}</strong>
                      <span>
                        {row.completed}/{row.required} aktivitas
                      </span>
                    </div>
                    <div className="dashboard-status-flags">
                      <span className={row.income ? 'is-done' : ''}>B</span>
                      <span className={row.expense ? 'is-done' : ''}>S</span>
                      {row.required === 3 ? (
                        <span className={row.operational ? 'is-done' : ''}>
                          O
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="dashboard-empty">Memuat status dapur…</div>
          )}
        </article>

        <section className="dashboard-panel dashboard-history-panel dashboard-main-panel">
          <div className="dashboard-panel-header">
            <div>
              <h2>Riwayat Transaksi</h2>
              <p>
                Menampilkan {transactions.length} dari {totalTransactions}{' '}
                transaksi sesuai filter.
              </p>
            </div>
            <span className="dashboard-panel-badge">Live dari Database</span>
          </div>

          <div className="dashboard-history">
            {transactions.length ? (
              transactions.map((transaction) => {
                const kitchen = kitchens.find(
                  (item) => item.id === transaction.kitchen_id
                )
                const meta = historyMeta[transaction.id]

                return (
                  <div className="dashboard-history-row" key={transaction.id}>
                    <div className="dashboard-history-main">
                      <div className="dashboard-history-heading">
                        <strong>
                          {kitchen?.name ?? 'Dapur tidak diketahui'}
                        </strong>
                        <span className={flowClass(transaction.flow_type)}>
                          {flowLabel(transaction.flow_type)}
                        </span>
                      </div>

                      <div className="dashboard-history-party">
                        <strong>
                          {meta?.businessName ??
                            transaction.category ??
                            'Transaksi'}
                        </strong>

                        {meta?.ownerName ? (
                          <>
                            <i aria-hidden="true">•</i>
                            <span>{meta.ownerName}</span>
                          </>
                        ) : null}

                        {meta?.bankAccount ? (
                          <>
                            <i aria-hidden="true">•</i>
                            <span>{meta.bankAccount}</span>
                          </>
                        ) : null}
                      </div>

                      <time
                        className="dashboard-history-timestamp"
                        dateTime={transaction.created_at}
                      >
                        {formatHistoryInputTimestamp(transaction.created_at)}
                      </time>

                      <div className="dashboard-history-divider" />

                      <p className="dashboard-history-note">
                        <span>Catatan:</span> {transaction.note?.trim() || '-'}
                      </p>
                    </div>
                    <div className="dashboard-history-side">
                      <strong className="dashboard-history-amount">
                        {formatCurrency(Number(transaction.amount))}
                      </strong>

                      {user?.role === 'admin' ? (
                        <div className="dashboard-history-actions">
                          <button
                            type="button"
                            onClick={() =>
                              void openEditTransactionModal(transaction)
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleTransactionDelete(transaction)
                            }
                          >
                            Hapus
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="dashboard-empty">
                Tidak ada transaksi yang cocok dengan filter.
              </div>
            )}
          </div>

          {totalTransactions > 0 ? (
            <nav
              className="dashboard-pagination"
              aria-label="Pagination riwayat transaksi"
            >
              <span className="dashboard-pagination-summary">
                Menampilkan{' '}
                {(transactionPage - 1) * DASHBOARD_HISTORY_PAGE_SIZE + 1}–
                {Math.min(
                  transactionPage * DASHBOARD_HISTORY_PAGE_SIZE,
                  totalTransactions
                )}{' '}
                dari {totalTransactions}
              </span>

              <div className="dashboard-pagination-controls">
                <button
                  type="button"
                  className="dashboard-pagination-button dashboard-pagination-nav"
                  disabled={transactionPage === 1 || loading}
                  onClick={() =>
                    setTransactionPage((current) => Math.max(1, current - 1))
                  }
                  aria-label="Halaman sebelumnya"
                >
                  ‹
                </button>

                <div className="dashboard-pagination-pages">
                  {transactionPaginationPages.map((page, index) =>
                    page === 'ellipsis' ? (
                      <span
                        className="dashboard-pagination-ellipsis"
                        key={`ellipsis-${index}`}
                        aria-hidden="true"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={page}
                        type="button"
                        className={`dashboard-pagination-page ${
                          page === transactionPage ? 'is-active' : ''
                        }`}
                        aria-current={
                          page === transactionPage ? 'page' : undefined
                        }
                        disabled={loading}
                        onClick={() => setTransactionPage(page)}
                      >
                        {page}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  className="dashboard-pagination-button dashboard-pagination-nav"
                  disabled={transactionPage >= totalTransactionPages || loading}
                  onClick={() =>
                    setTransactionPage((current) =>
                      Math.min(totalTransactionPages, current + 1)
                    )
                  }
                  aria-label="Halaman berikutnya"
                >
                  ›
                </button>
              </div>
            </nav>
          ) : null}
        </section>
      </section>

      {modalOpen ? (
        <div
          className="dashboard-transaction-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTransactionModal()
            }
          }}
        >
          <section
            className="dashboard-transaction-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-transaction-modal-title"
          >
            <div className="dashboard-transaction-modal-header">
              <div>
                <span>
                  {modalMode === 'edit' ? 'UBAH TRANSAKSI' : 'TRANSAKSI BARU'}
                </span>
                <h2 id="dashboard-transaction-modal-title">
                  {modalMode === 'edit' ? 'Edit Transaksi' : 'Tambah Transaksi'}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeTransactionModal}
                disabled={saving}
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            {formError ? (
              <div className="dashboard-transaction-form-error">
                {formError}
              </div>
            ) : null}

            <div className="dashboard-transaction-form-grid">
              <label>
                <span>Tanggal</span>
                <input
                  type="date"
                  value={formDate}
                  onChange={(event) => setFormDate(event.target.value)}
                />
              </label>

              <label>
                <span>Dapur</span>
                <select
                  value={formKitchenId}
                  disabled={modalMode === 'edit'}
                  onChange={(event) =>
                    void handleFormKitchenChange(event.target.value)
                  }
                >
                  <option value="">Pilih dapur</option>
                  {kitchens.map((kitchen) => (
                    <option key={kitchen.id} value={kitchen.id}>
                      {kitchen.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Jenis transaksi</span>
                <select
                  value={formFlowType}
                  disabled={!formKitchenId || modalMode === 'edit'}
                  onChange={(event) =>
                    void handleFormFlowChange(
                      event.target.value as DashboardFlow | ''
                    )
                  }
                >
                  <option value="">Pilih jenis transaksi</option>
                  {FLOW_OPTIONS.filter(
                    (option) =>
                      option.value !== '' &&
                      availableFormFlows.includes(option.value as DashboardFlow)
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>
                  {!formFlowType
                    ? 'Supplier / Rekening'
                    : formFlowType === 'expense'
                      ? 'Supplier'
                      : formFlowType === 'neutral'
                        ? 'Rekening Operasional'
                        : 'Rekening'}
                </span>

                {formFlowType === 'expense' ? (
                  <select
                    value={formSupplierId}
                    disabled={
                      !formKitchenId ||
                      !formFlowType ||
                      modalMode === 'edit' ||
                      !isSukarajaFormKitchen
                    }
                    onChange={(event) => {
                      const value = event.target.value
                      setFormSupplierId(value)
                      setFormEntryUnlocked(Boolean(value))

                      if (value) {
                        focusNominalInput()
                      }
                    }}
                  >
                    <option value="">
                      {!formKitchenId
                        ? 'Pilih dapur terlebih dahulu'
                        : 'Pilih supplier'}
                    </option>

                    {formSuppliers.map((supplier) => (
                      <option key={supplier.value} value={supplier.value}>
                        {supplier.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={formAccountId}
                    disabled={
                      !formKitchenId ||
                      !formFlowType ||
                      modalMode === 'edit' ||
                      formFlowType === 'neutral'
                    }
                    onChange={(event) => {
                      const value = event.target.value
                      setFormAccountId(value)
                      setFormEntryUnlocked(Boolean(value))

                      if (value) {
                        focusNominalInput()
                      }
                    }}
                  >
                    <option value="">
                      {!formKitchenId
                        ? 'Pilih dapur terlebih dahulu'
                        : !formFlowType
                          ? 'Pilih jenis transaksi terlebih dahulu'
                          : formFlowType === 'neutral'
                            ? 'Rekening operasional dipilih otomatis'
                            : 'Pilih rekening'}
                    </option>

                    {formAccounts.map((account) => (
                      <option key={account.value} value={account.value}>
                        {getFormAccountLabel(account, formFlowType)}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label>
                <span>Nominal</span>
                <input
                  ref={nominalInputRef}
                  type="text"
                  inputMode="numeric"
                  value={formAmount}
                  disabled={!transactionDetailsUnlocked}
                  onChange={(event) =>
                    setFormAmount(formatIntegerInput(event.target.value))
                  }
                  placeholder="0"
                />
              </label>

              <label className="dashboard-transaction-form-note">
                <span>Catatan</span>
                <textarea
                  rows={3}
                  value={formNote}
                  disabled={!transactionDetailsUnlocked}
                  onChange={(event) => setFormNote(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key !== 'Enter' ||
                      event.nativeEvent.isComposing
                    ) {
                      return
                    }

                    event.preventDefault()
                    void handleTransactionSubmit()
                  }}
                  placeholder="Pilih dapur, jenis transaksi, dan tujuan terlebih dahulu"
                />
              </label>
            </div>

            <div className="dashboard-transaction-modal-actions">
              <button
                type="button"
                onClick={closeTransactionModal}
                disabled={saving}
              >
                Batal
              </button>

              <button
                type="button"
                className="dashboard-transaction-action"
                onClick={() => void handleTransactionSubmit()}
                disabled={saving}
              >
                {saving
                  ? 'Menyimpan…'
                  : modalMode === 'edit'
                    ? 'Update Transaksi'
                    : 'Simpan Transaksi'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
