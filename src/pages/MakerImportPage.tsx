import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardPaste, Database, FileCheck2, LoaderCircle, RotateCcw, ShieldAlert, Upload } from 'lucide-react'
import { isOperationalTypeAvailable } from '@/features/transactions/operational-policy'
import {
  defaultManualFlow,
  defaultOperationalType,
  normalizeMakerAccountNumber,
  normalizeMakerBank,
  normalizeMakerText,
  operationalRuleTypeForKind,
  parseMakerDocument,
  type MakerImportDraftRow,
  type MakerImportKind,
  type MakerManualFlow,
  type MakerOperationalType
} from '@/features/maker-import/maker-import-utils'
import { supabase } from '@/lib/supabase'

type KitchenRef = { id: string; name: string; is_active: boolean; operational_recipient_name: string | null }
type AccountRef = {
  id: string
  name: string
  bank: string
  account_number: string | null
  account_category: string
  supplier_id: string | null
  income_suppliers:
    | { business_name: string | null; owner_name: string | null }
    | { business_name: string | null; owner_name: string | null }[]
    | null
}
type KitchenAccountRule = {
  kitchen_id: string
  account_id: string
  flow_type: string
}
type OperationalAccountRule = {
  id: string
  kitchen_id: string
  rule_type: string
  owner_name: string
  bank: string
  account_number: string
}
type ImportReferences = {
  kitchens: KitchenRef[]
  accounts: AccountRef[]
  accountRules: KitchenAccountRule[]
  operationalRules: OperationalAccountRule[]
}
type ImportRowPayload = {
  transaction_date: string
  kitchen_id: string
  amount: number
  note: string | null
  line_number: number
  maker_kind: MakerImportKind
  disposition: 'import' | 'excluded'
  excluded_reason: string | null
  flow_type: 'income' | 'neutral' | 'ops_disbursement' | 'real_ops' | 'operational_disbursement' | null
  category: 'RAB' | 'GAS' | 'OPS' | 'REAL_OPS' | 'OPERATIONAL' | null
  operational_type: Exclude<MakerOperationalType, ''> | null
  account_id: string | null
  supplier_id: null
  destination_label: string | null
  maker_source_line: string
  maker_source_category: string
  maker_recipient_name: string | null
  maker_bank: string | null
  maker_account_number: string | null
  maker_details: string | null
  maker_manual_verified: boolean
}

const EMPTY_REFERENCES: ImportReferences = {
  kitchens: [],
  accounts: [],
  accountRules: [],
  operationalRules: []
}

type RowDisposition = { status: 'import' | 'excluded'; reason: string | null }

const moneyFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0
})

function formatAmount(value: number | null): string {
  return value === null ? '' : moneyFormatter.format(value)
}

function getAccountSupplier(account: AccountRef) {
  return Array.isArray(account.income_suppliers)
    ? account.income_suppliers[0]
    : account.income_suppliers
}

function getAccountLabel(account: AccountRef): string {
  const supplier = getAccountSupplier(account)
  return supplier?.business_name?.trim() || account.name
}

function getAccountOptionLabel(account: AccountRef): string {
  return getAccountLabel(account) + ' — ' + account.bank + ' / ' + (account.account_number || '-')
}

function getRowFlow(
  row: MakerImportDraftRow
): MakerManualFlow {
  return row.kind === 'lain_lain'
    ? row.manualFlow
    : defaultManualFlow(row.kind)
}

function getRowOperationalType(
  row: MakerImportDraftRow
): MakerOperationalType {
  if (row.kind === 'lain_lain') return row.operationalType
  return defaultOperationalType(row.kind)
}

function getOperationalRuleType(row: MakerImportDraftRow): string | null {
  return operationalRuleTypeForKind(row.kind, getRowOperationalType(row))
}

function getExpectedAccountFlow(row: MakerImportDraftRow): 'income' | 'neutral' | null {
  const flow = getRowFlow(row)
  if (flow === 'income') return 'income'
  if (flow === 'gas') return 'neutral'
  return null
}

function accountMatchesRow(
  account: AccountRef,
  row: MakerImportDraftRow
): boolean {
  return (
    normalizeMakerBank(account.bank) === normalizeMakerBank(row.bank) &&
    normalizeMakerAccountNumber(account.account_number) ===
      normalizeMakerAccountNumber(row.accountNumber)
  )
}

function operationalRuleMatchesRow(
  rule: OperationalAccountRule,
  row: MakerImportDraftRow
): boolean {
  return (
    normalizeMakerBank(rule.bank) === normalizeMakerBank(row.bank) &&
    normalizeMakerAccountNumber(rule.account_number) ===
      normalizeMakerAccountNumber(row.accountNumber)
  )
}

function applyInitialMappings(
  rows: MakerImportDraftRow[],
  kitchenId: string,
  refs: ImportReferences
): MakerImportDraftRow[] {
  return rows.map((row) => {
    const flow = getRowFlow(row)
    if (flow === 'income' || flow === 'gas') {
      const requiredFlow = flow === 'income' ? 'income' : 'neutral'
      const mappedAccountIds = new Set(
        refs.accountRules
          .filter((rule) =>
            rule.kitchen_id === kitchenId && rule.flow_type === requiredFlow
          )
          .map((rule) => rule.account_id)
      )
      const matches = refs.accounts.filter((account) =>
        mappedAccountIds.has(account.id) && accountMatchesRow(account, row)
      )
      if (matches.length === 1) {
        return { ...row, accountId: matches[0].id }
      }
      return row
    }

    const ruleType = getOperationalRuleType(row)
    if (!ruleType) return row
    const matches = refs.operationalRules.filter((rule) =>
      rule.kitchen_id === kitchenId &&
      rule.rule_type === ruleType &&
      operationalRuleMatchesRow(rule, row)
    )
    return matches.length === 1
      ? { ...row, operationalRuleId: matches[0].id }
      : row
  })
}

function getRowDisposition(
  row: MakerImportDraftRow,
  kitchenId: string,
  refs: ImportReferences
): RowDisposition {
  if (row.kind === 'combined_payroll') {
    return {
      status: 'excluded',
      reason: 'Maker menggabungkan Gaji Relawan dan Insentif PIC dalam satu nominal. Baris ini tidak boleh masuk ke database program; teruskan ke akuntan.'
    }
  }

  const flow = getRowFlow(row)
  const operationalType = getRowOperationalType(row)
  const protectedKind = ['sppg_rent', 'relawan_salary', 'pic_school', 'pic_posyandu'].includes(row.kind)
  const protectedManualType = flow === 'operational_disbursement' &&
    ['sppg_rent', 'relawan_salary', 'pic_incentive'].includes(operationalType)
  if (!protectedKind && !protectedManualType) return { status: 'import', reason: null }

  const kitchen = refs.kitchens.find((item) => item.id === kitchenId)
  const expectedPic = kitchen?.operational_recipient_name?.trim() ?? ''
  if (!expectedPic) {
    return {
      status: 'excluded',
      reason: 'Nama PIC Yayasan belum terisi di master dapur. Tidak masuk database program; serahkan ke akuntan.'
    }
  }
  if (normalizeMakerText(row.recipientName) !== normalizeMakerText(expectedPic)) {
    return {
      status: 'excluded',
      reason: 'Nama penerima pada teks Maker tidak sama dengan PIC Yayasan (' + expectedPic + '). Baris dikecualikan dari database program; serahkan ke akuntan.'
    }
  }

  const ruleType = getOperationalRuleType(row)
  const matchingRule = refs.operationalRules.some((rule) =>
    rule.kitchen_id === kitchenId &&
    (rule.rule_type === ruleType || (row.kind === 'lain_lain' && operationalType === 'pic_incentive' && ['pic_incentive_school', 'pic_incentive_posyandu'].includes(rule.rule_type))) &&
    normalizeMakerText(rule.owner_name) === normalizeMakerText(expectedPic) &&
    normalizeMakerBank(rule.bank) === normalizeMakerBank(row.bank) &&
    normalizeMakerAccountNumber(rule.account_number) === normalizeMakerAccountNumber(row.accountNumber)
  )
  if (!matchingRule) {
    return {
      status: 'excluded',
      reason: 'Bank/nomor rekening pada teks Maker tidak cocok dengan mapping rekening PIC Yayasan untuk dapur ini. Baris dikecualikan dari database program; serahkan ke akuntan.'
    }
  }
  return { status: 'import', reason: null }
}

function getExcludedBaselineValidation(
  row: MakerImportDraftRow,
  kitchenId: string,
  transactionDate: string,
  refs: ImportReferences
): { errors: string[]; confirmations: string[] } {
  const errors: string[] = []
  if (!kitchenId || !refs.kitchens.some((item) => item.id === kitchenId)) errors.push('Pilih dapur yang terdaftar di database.')
  if (!transactionDate) errors.push('Tanggal transaksi belum valid.')
  if (row.amount === null || !Number.isSafeInteger(row.amount) || row.amount <= 0) errors.push('Nominal sumber harus berupa bilangan bulat lebih dari 0.')
  return { errors, confirmations: [] }
}

function getValidation(
  row: MakerImportDraftRow,
  kitchenId: string,
  transactionDate: string,
  refs: ImportReferences
): { errors: string[]; confirmations: string[]; account?: AccountRef; operationalRule?: OperationalAccountRule } {
  const errors: string[] = []
  const confirmations: string[] = []
  const kitchen = refs.kitchens.find((item) => item.id === kitchenId)
  const flow = getRowFlow(row)
  const operationalType = getRowOperationalType(row)

  if (!kitchenId || !kitchen) {
    errors.push('Pilih dapur yang terdaftar di database.')
  }
  if (!transactionDate) errors.push('Tanggal transaksi belum valid.')
  if (row.amount === null || !Number.isSafeInteger(row.amount) || row.amount <= 0) {
    errors.push('Nominal harus berupa bilangan bulat lebih dari 0.')
  }
  if (row.kind === 'lain_lain') {
    if (!flow) errors.push('Pilih klasifikasi database untuk Lain-lain.')
    if (!row.verified) confirmations.push('Lain-lain wajib kamu tandai sudah diverifikasi manual.')
  }

  let matchedAccount: AccountRef | undefined
  let matchedOperationalRule: OperationalAccountRule | undefined

  if (flow === 'income' || flow === 'gas') {
    const expectedFlow = flow === 'income' ? 'income' : 'neutral'
    const ruleAccountIds = new Set(
      refs.accountRules
        .filter((rule) =>
          rule.kitchen_id === kitchenId && rule.flow_type === expectedFlow
        )
        .map((rule) => rule.account_id)
    )
    matchedAccount = refs.accounts.find((account) => account.id === row.accountId)

    if (!matchedAccount || !ruleAccountIds.has(row.accountId)) {
      errors.push(
        flow === 'income'
          ? 'Rekening ini belum dimapping sebagai RAB/Pencairan untuk dapur terpilih.'
          : 'Rekening ini belum dimapping sebagai GAS untuk dapur terpilih.'
      )
    } else if (!accountMatchesRow(matchedAccount, row)) {
      errors.push('Bank/nomor rekening pada draft tidak sama dengan mapping database. Pilih ulang rekening yang benar.')
    } else {
      if (normalizeMakerText(getAccountLabel(matchedAccount)) !== normalizeMakerText(row.recipientName)) {
        confirmations.push('Nama penerima berbeda dari nama rekening di database.')
      }
    }

    if (flow === 'gas' && kitchen && ['sukaraja', 'cihaur'].includes(normalizeMakerText(kitchen.name))) {
      errors.push('GAS tidak tersedia untuk dapur Sukaraja dan Cihaur.')
    }
  } else if (flow === 'operational_disbursement') {
    if (!operationalType) {
      errors.push('Pilih jenis pencairan operasional.')
    } else if (kitchen && !isOperationalTypeAvailable(kitchen.name, operationalType, transactionDate)) {
      errors.push('Jenis operasional ini tidak tersedia untuk dapur/tanggal tersebut.')
    }

    const ruleType = getOperationalRuleType(row)
    if (ruleType && row.operationalRuleId) {
      matchedOperationalRule = refs.operationalRules.find((rule) =>
        rule.id === row.operationalRuleId &&
        rule.kitchen_id === kitchenId &&
        rule.rule_type === ruleType
      )
    }

    if (!matchedOperationalRule) {
      errors.push('Mapping rekening operasional belum cocok. Pilih mapping database yang sesuai.')
    } else if (!operationalRuleMatchesRow(matchedOperationalRule, row)) {
      errors.push('Bank/nomor rekening berbeda dari mapping operasional database. Pilih ulang mapping.')
    } else if (
      normalizeMakerText(matchedOperationalRule.owner_name) !==
      normalizeMakerText(row.recipientName)
    ) {
      errors.push('Nama penerima tidak sama dengan pemilik rekening pada mapping operasional database. Baris ini tidak dapat diimpor.')
    }
  } else if (flow === 'real_ops' || flow === 'ops_disbursement') {
    matchedOperationalRule = refs.operationalRules.find((rule) =>
      rule.id === row.operationalRuleId &&
      rule.kitchen_id === kitchenId &&
      rule.rule_type === 'ops_harian'
    )
    if (!matchedOperationalRule) {
      errors.push('Mapping rekening Ops Harian belum tersedia untuk dapur ini.')
    } else if (!operationalRuleMatchesRow(matchedOperationalRule, row)) {
      errors.push('Bank/nomor rekening Ops Harian tidak sama dengan mapping database.')
    } else if (
      normalizeMakerText(matchedOperationalRule.owner_name) !==
      normalizeMakerText(row.recipientName)
    ) {
      errors.push('Nama penerima tidak sama dengan pemilik rekening Ops Harian pada mapping database.')
    }
  }

  if (confirmations.length > 0 && !row.verified) {
    // Confirmation is explicitly required for name discrepancies and manual rows.
  } else if (confirmations.length > 0 && row.verified) {
    // The admin has reviewed these non-account-number discrepancies.
  }

  return { errors, confirmations, account: matchedAccount, operationalRule: matchedOperationalRule }
}

function effectiveDatabaseFlow(row: MakerImportDraftRow): {
  flow_type: ImportRowPayload['flow_type'] | null
  category: ImportRowPayload['category'] | null
  operational_type: ImportRowPayload['operational_type']
} {
  const flow = getRowFlow(row)
  if (flow === 'income') {
    return { flow_type: 'income', category: 'RAB', operational_type: null }
  }
  if (flow === 'gas') {
    return { flow_type: 'neutral', category: 'GAS', operational_type: null }
  }
  if (flow === 'ops_disbursement') {
    return { flow_type: 'ops_disbursement', category: 'OPS', operational_type: null }
  }
  if (flow === 'real_ops') {
    return { flow_type: 'real_ops', category: 'REAL_OPS', operational_type: null }
  }
  if (flow === 'operational_disbursement') {
    const operationalType = getRowOperationalType(row)
    if (operationalType) {
      return {
        flow_type: 'operational_disbursement',
        category: 'OPERATIONAL',
        operational_type: operationalType
      }
    }
  }
  return { flow_type: null, category: null, operational_type: null }
}

export function MakerImportPage() {
  const [refs, setRefs] = useState<ImportReferences>(EMPTY_REFERENCES)
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [refsError, setRefsError] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [draftReady, setDraftReady] = useState(false)
  const [kitchenId, setKitchenId] = useState('')
  const [transactionDate, setTransactionDate] = useState('')
  const [sourceKitchenName, setSourceKitchenName] = useState('')
  const [sourceDate, setSourceDate] = useState('')
  const [rows, setRows] = useState<MakerImportDraftRow[]>([])
  const [parseError, setParseError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadReferences() {
      setLoadingRefs(true)
      setRefsError('')
      try {
        const [kitchensResult, accountsResult, accountRulesResult, operationalRulesResult] =
          await Promise.all([
            supabase.from('kitchens').select('id,name,is_active,operational_recipient_name').eq('is_active', true).order('name'),
            supabase
              .from('accounts')
              .select('id,name,bank,account_number,account_category,supplier_id,income_suppliers!accounts_supplier_id_fkey(business_name,owner_name)')
              .eq('account_category', 'supplier')
              .order('name'),
            supabase.from('kitchen_account_rules').select('kitchen_id,account_id,flow_type'),
            supabase
              .from('kitchen_operational_account_rules')
              .select('id,kitchen_id,rule_type,owner_name,bank,account_number')
              .eq('is_active', true)
          ])

        const failed = [
          kitchensResult.error,
          accountsResult.error,
          accountRulesResult.error,
          operationalRulesResult.error
        ].find(Boolean)
        if (failed) throw failed

        if (cancelled) return
        const nextRefs: ImportReferences = {
          kitchens: (kitchensResult.data ?? []) as KitchenRef[],
          accounts: (accountsResult.data ?? []) as AccountRef[],
          accountRules: (accountRulesResult.data ?? []) as KitchenAccountRule[],
          operationalRules: (operationalRulesResult.data ?? []) as OperationalAccountRule[]
        }
        setRefs(nextRefs)
      } catch (error) {
        if (!cancelled) {
          setRefsError(error instanceof Error ? error.message : 'Gagal mengambil mapping dari database.')
        }
      } finally {
        if (!cancelled) setLoadingRefs(false)
      }
    }
    void loadReferences()
    return () => {
      cancelled = true
    }
  }, [])

  const activeKitchen = refs.kitchens.find((item) => item.id === kitchenId)

  function handleParse() {
    setParseError('')
    setSaveError('')
    setSuccessMessage('')

    const parsed = parseMakerDocument(sourceText)
    if (parsed.error) {
      setDraftReady(false)
      setParseError(parsed.error)
      setRows([])
      setSourceKitchenName('')
      setSourceDate('')
      return
    }
    setSourceKitchenName(parsed.kitchenName)
    setSourceDate(parsed.transactionDate)

    const matchingKitchen = refs.kitchens.find(
      (kitchen) => normalizeMakerText(kitchen.name) === normalizeMakerText(parsed.kitchenName)
    )
    const selectedKitchenId = matchingKitchen?.id ?? ''
    setKitchenId(selectedKitchenId)
    setTransactionDate(parsed.transactionDate)
    setRows(applyInitialMappings(parsed.rows, selectedKitchenId, refs))
    setDraftReady(true)
    if (!matchingKitchen) {
      setParseError('Nama dapur "' + parsed.kitchenName + '" belum cocok dengan dapur aktif di database. Pilih dapur yang benar pada preview.')
    }
  }

  function updateRow(id: string, patch: Partial<MakerImportDraftRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
    setSaveError('')
    setSuccessMessage('')
  }

  function handleKitchenChange(nextKitchenId: string) {
    setKitchenId(nextKitchenId)
    setRows((current) => applyInitialMappings(
      current.map((row) => ({ ...row, accountId: '', operationalRuleId: '', verified: false })),
      nextKitchenId,
      refs
    ))
  }

  function chooseAccount(row: MakerImportDraftRow, accountId: string) {
    const account = refs.accounts.find((item) => item.id === accountId)
    if (!account) {
      updateRow(row.id, { accountId: '', verified: false })
      return
    }
    updateRow(row.id, { accountId: account.id, verified: false })
  }

  function chooseOperationalRule(row: MakerImportDraftRow, ruleId: string) {
    const rule = refs.operationalRules.find((item) =>
      item.id === ruleId && item.kitchen_id === kitchenId
    )
    if (!rule) {
      updateRow(row.id, { operationalRuleId: '', verified: false })
      return
    }
    updateRow(row.id, { operationalRuleId: rule.id, verified: false })
  }

  function changeManualFlow(row: MakerImportDraftRow, value: MakerManualFlow) {
    updateRow(row.id, {
      manualFlow: value,
      accountId: '',
      operationalRuleId: '',
      operationalType: '',
      verified: false
    })
  }

  function changeOperationalType(row: MakerImportDraftRow, value: MakerOperationalType) {
    updateRow(row.id, {
      operationalType: value,
      operationalRuleId: '',
      verified: false
    })
  }

  const checks = rows.map((row) => {
    const disposition = getRowDisposition(row, kitchenId, refs)
    const validation = disposition.status === 'excluded'
      ? getExcludedBaselineValidation(row, kitchenId, transactionDate, refs)
      : getValidation(row, kitchenId, transactionDate, refs)
    return { row, validation, flowInfo: effectiveDatabaseFlow(row), disposition }
  })

  const totalAmount = rows.reduce((total, row) => total + (row.amount ?? 0), 0)
  const excludedChecks = checks.filter(({ disposition }) => disposition.status === 'excluded')
  const importableChecks = checks.filter(({ disposition }) => disposition.status === 'import')
  const excludedAmount = excludedChecks.reduce((total, { row }) => total + (row.amount ?? 0), 0)
  const importableAmount = importableChecks.reduce((total, { row }) => total + (row.amount ?? 0), 0)
  const sourceIdentityMismatch = Boolean(draftReady) && (
    !activeKitchen ||
    normalizeMakerText(activeKitchen.name) !== normalizeMakerText(sourceKitchenName) ||
    transactionDate !== sourceDate
  )
  const blockingCount = checks.filter(({ row, validation, flowInfo, disposition }) =>
    validation.errors.length > 0 ||
    (disposition.status === 'import' && ((validation.confirmations.length > 0 && !row.verified) || !flowInfo.flow_type || !flowInfo.category))
  ).length + (sourceIdentityMismatch ? 1 : 0)
  const canSave = draftReady && !loadingRefs && !refsError && Boolean(activeKitchen) &&
    Boolean(transactionDate) && rows.length > 0 && blockingCount === 0 && !sourceIdentityMismatch && !saving

  async function handleSave() {
    if (!canSave || !activeKitchen) return
    setSaveError('')
    setSuccessMessage('')
    if (!window.confirm(
      'Simpan batch Maker untuk ' + activeKitchen.name + ' tanggal ' + transactionDate + '?\n\n' +
      'Masuk database program: ' + importableChecks.length + ' baris (Rp ' + formatAmount(importableAmount) + ').\n' +
      'Dikecualikan / rekening akuntan: ' + excludedChecks.length + ' baris (Rp ' + formatAmount(excludedAmount) + ').\n\n' +
      'Baris yang dikecualikan hanya masuk audit impor, bukan transaksi program.'
    )) return

    setSaving(true)
    try {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(sourceText.replace(/\r\n?/g, '\n').trim())
      )
      const contentHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')

      const payload: ImportRowPayload[] = checks.map(({ row, validation, flowInfo, disposition }) => {
        if (validation.errors.length) {
          throw new Error('Perbaiki nominal sumber atau identitas dapur pada baris ' + row.lineNumber + ' sebelum menyimpan.')
        }
        if (disposition.status === 'import' && (!flowInfo.flow_type || !flowInfo.category)) {
          throw new Error('Klasifikasi pada baris ' + row.lineNumber + ' belum ditentukan.')
        }
        if (disposition.status === 'import' && validation.confirmations.length && !row.verified) {
          throw new Error('Periksa dan centang verifikasi pada baris ' + row.lineNumber + ' sebelum menyimpan.')
        }
        const flow = flowInfo.flow_type
        const isIncome = flow === 'income'
        const isGas = flow === 'neutral'
        const isOperational = flow === 'operational_disbursement'
        const isOpsDisbursement = flow === 'ops_disbursement'
        return {
          transaction_date: transactionDate,
          kitchen_id: activeKitchen.id,
          line_number: row.lineNumber,
          maker_kind: row.kind,
          disposition: disposition.status,
          excluded_reason: disposition.reason,
          amount: row.amount as number,
          note: isIncome ? (row.details.trim() || null) : isOpsDisbursement ? 'Ops Harian' : null,
          flow_type: disposition.status === 'excluded' ? null : flow,
          category: disposition.status === 'excluded' ? null : flowInfo.category,
          operational_type: disposition.status === 'excluded' || !isOperational ? null : flowInfo.operational_type,
          account_id: disposition.status === 'excluded' || (!isIncome && !isGas) ? null : row.accountId,
          supplier_id: null,
          destination_label: disposition.status === 'excluded' || !isOpsDisbursement ? null : 'Akuntan ' + activeKitchen.name,
          maker_source_line: row.rawLine,
          maker_source_category: row.sourceCategory || 'Lain-lain',
          maker_recipient_name: row.recipientName.trim() || null,
          maker_bank: normalizeMakerBank(row.bank) || null,
          maker_account_number: normalizeMakerAccountNumber(row.accountNumber) || null,
          maker_details: row.details.trim() || null,
          maker_manual_verified: row.verified
        }
      })

      const normalizedSourceText = sourceText.replace(/\r\n?/g, '\n').trim()
      const { data, error } = await supabase.rpc('import_maker_transactions', {
        p_content_hash: contentHash,
        p_kitchen_id: activeKitchen.id,
        p_transaction_date: transactionDate,
        p_source_text: normalizedSourceText,
        p_rows: payload
      })

      if (error) throw error
      const result = data as { duplicate?: boolean; inserted_count?: number; excluded_count?: number; total_amount?: number; excluded_total_amount?: number; batch_id?: string }
      if (result?.duplicate) {
        setSaveError('Batch ini sudah pernah diinput ke database. Tidak ada transaksi baru yang ditambahkan.')
      } else {
        setSuccessMessage(
          'Batch berhasil diaudit. ' + (result?.inserted_count ?? importableChecks.length) +
          ' transaksi masuk database program (Rp ' + formatAmount(result?.total_amount ?? importableAmount) + '); ' +
          (result?.excluded_count ?? excludedChecks.length) + ' baris dikecualikan untuk akuntan (Rp ' +
          formatAmount(result?.excluded_total_amount ?? excludedAmount) + ').'
        )
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Impor gagal. Tidak ada transaksi yang disimpan.')
    } finally {
      setSaving(false)
    }
  }

  const availableKitchens = useMemo(
    () => refs.kitchens.slice().sort((a, b) => a.name.localeCompare(b.name, 'id')),
    [refs.kitchens]
  )

  return (
    <section className="maker-import-page">
      <div className="maker-import-hero">
        <div className="maker-import-hero-icon"><ClipboardPaste aria-hidden="true" /></div>
        <div>
          <span className="maker-import-eyebrow">ENCODER → DECODER</span>
          <h2>Impor dari Maker-Pencairan</h2>
          <p>Tempel teks WhatsApp Maker, cocokkan mapping database, tinjau dan koreksi draft, baru simpan transaksi.</p>
        </div>
      </div>

      {refsError ? <div className="maker-import-message is-error"><AlertTriangle /> {refsError}</div> : null}
      {loadingRefs ? <div className="maker-import-loading"><LoaderCircle className="is-spinning" /> Mengambil dapur dan mapping rekening dari database…</div> : null}

      <section className="maker-import-panel">
        <div className="maker-import-panel-head">
          <div>
            <span>LANGKAH 1</span>
            <h3>Tempel output Maker-Pencairan</h3>
          </div>
          <button
            type="button"
            className="maker-import-secondary"
            onClick={() => {
              setSourceText('')
              setRows([])
              setDraftReady(false)
              setParseError('')
              setSaveError('')
              setSuccessMessage('')
            }}
            disabled={!sourceText && rows.length === 0}
          >
            <RotateCcw aria-hidden="true" /> Reset
          </button>
        </div>
        <textarea
          className="maker-import-source"
          value={sourceText}
          onChange={(event) => {
            setSourceText(event.target.value)
            setDraftReady(false)
            setSaveError('')
            setSuccessMessage('')
          }}
          placeholder={'Cisepat, 05-Oct-2026\nRAB : CV KRAMAT - BNI / 1908102325 · Beras · 241.000\nGAS : KOPERASI ARUTALA - BNI / 1985322260 · 124.000'}
          spellCheck={false}
          disabled={loadingRefs || saving}
        />
        <div className="maker-import-source-footer">
          <span>Format nominal mengikuti integer database: <strong>241</strong> tetap 241; <strong>241.000</strong> menjadi 241.000.</span>
          <button
            type="button"
            className="maker-import-primary"
            onClick={handleParse}
            disabled={loadingRefs || Boolean(refsError) || !sourceText.trim() || saving}
          >
            <FileCheck2 aria-hidden="true" /> Baca &amp; buat preview
          </button>
        </div>
        {parseError ? <div className="maker-import-message is-warning"><AlertTriangle /> {parseError}</div> : null}
      </section>

      {draftReady ? (
        <>
          <section className="maker-import-panel">
            <div className="maker-import-panel-head">
              <div>
                <span>LANGKAH 2</span>
                <h3>Identitas batch</h3>
              </div>
              <span className="maker-import-chip"><Database aria-hidden="true" /> Draft saja — belum tersimpan</span>
            </div>
            <div className="maker-import-batch-grid">
              <label>
                <span>Dapur</span>
                <select value={kitchenId} onChange={(event) => handleKitchenChange(event.target.value)} disabled={saving || (activeKitchen !== undefined && normalizeMakerText(activeKitchen.name) === normalizeMakerText(sourceKitchenName))}>
                  <option value="">Pilih dapur sesuai database</option>
                  {availableKitchens.map((kitchen) => (
                    <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Tanggal transaksi</span>
                <input type="date" value={transactionDate} readOnly disabled={saving} aria-describedby="maker-import-date-help" />
              </label>
            </div>
            <p id="maker-import-date-help" className="maker-import-identity-help">Dapur dan tanggal harus mengikuti header teks Maker. Kalau salah, koreksi di Maker lalu tempel ulang.</p>
            {sourceIdentityMismatch ? <div className="maker-import-message is-error"><AlertTriangle aria-hidden="true" /> Header sumber ({sourceKitchenName}, {sourceDate}) tidak sama dengan dapur/tanggal terpilih. Batch tidak dapat disimpan; reset dan tempel output yang benar.</div> : null}
            <div className="maker-import-summary">
              <div><small>Baris total</small><strong>{rows.length}</strong></div>
              <div><small>Masuk program</small><strong>{importableChecks.length}</strong><small>Rp {formatAmount(importableAmount)}</small></div>
              <div className={excludedChecks.length > 0 ? 'is-attention' : 'is-ready'}><small>Dikecualikan</small><strong>{excludedChecks.length}</strong><small>Rp {formatAmount(excludedAmount)}</small></div>
              <div className={blockingCount > 0 ? 'is-attention' : 'is-ready'}><small>Status validasi</small><strong>{blockingCount > 0 ? blockingCount + ' perlu koreksi' : 'Siap disimpan'}</strong></div>
            </div>
          </section>

          <section className="maker-import-panel">
            <div className="maker-import-panel-head">
              <div>
                <span>LANGKAH 3</span>
                <h3>Verifikasi tiap transaksi</h3>
              </div>
              <p>Nomor rekening harus cocok dengan mapping dapur. Baris Lain-lain memerlukan klasifikasi dan centang verifikasi manual.</p>
            </div>
            <div className="maker-import-row-list">
              {checks.map(({ row, validation, flowInfo, disposition }) => {
                const flow = getRowFlow(row)
                const accountFlow = getExpectedAccountFlow(row)
                const rowAccounts = accountFlow
                  ? refs.accounts.filter((account) =>
                      refs.accountRules.some((rule) =>
                        rule.kitchen_id === kitchenId &&
                        rule.account_id === account.id &&
                        rule.flow_type === accountFlow
                      )
                    )
                  : []
                const ruleType = flow === 'real_ops' || flow === 'ops_disbursement' ? 'ops_harian' : getOperationalRuleType(row)
                const rowOperationalRules = ruleType
                  ? refs.operationalRules.filter((rule) =>
                      rule.kitchen_id === kitchenId && rule.rule_type === ruleType
                    )
                  : []
                const expectedAccount = row.accountId
                  ? refs.accounts.find((account) => account.id === row.accountId)
                  : undefined
                const expectedOperational = row.operationalRuleId
                  ? refs.operationalRules.find((rule) => rule.id === row.operationalRuleId)
                  : undefined
                const hasNameMismatch = flow === 'income' || flow === 'gas'
                  ? Boolean(expectedAccount && normalizeMakerText(getAccountLabel(expectedAccount)) !== normalizeMakerText(row.recipientName))
                  : Boolean(expectedOperational && normalizeMakerText(expectedOperational.owner_name) !== normalizeMakerText(row.recipientName))
                const manualRequired = row.kind === 'lain_lain' || hasNameMismatch
                const rowInvalid = disposition.status === 'import' && (validation.errors.length > 0 ||
                  (validation.confirmations.length > 0 && !row.verified) ||
                  !flowInfo.flow_type || !flowInfo.category)
                const title = row.sourceCategory === 'Lain-lain' ? 'Lain-lain • verifikasi manual' : row.sourceCategory

                return (
                  <article className={'maker-import-row' + (disposition.status === 'excluded' ? ' is-excluded' : rowInvalid ? ' is-invalid' : ' is-valid')} key={row.id}>
                    <div className="maker-import-row-head">
                      <div>
                        <span className="maker-import-row-number">BARIS {row.lineNumber}</span>
                        <h4>{title}</h4>
                      </div>
                      <span className={'maker-import-row-status' + (disposition.status === 'excluded' ? ' is-excluded' : rowInvalid ? ' is-invalid' : ' is-valid')}>
                        {disposition.status === 'excluded' ? <><ShieldAlert aria-hidden="true" /> Di luar database program</> : rowInvalid ? <><AlertTriangle aria-hidden="true" /> Perlu ditinjau</> : <><CheckCircle2 aria-hidden="true" /> Valid</>}
                      </span>
                    </div>
                    <p className="maker-import-original"><strong>Teks asli:</strong> {row.rawLine}</p>
                    {disposition.status === 'excluded' && disposition.reason ? <div className="maker-import-excluded-reason"><ShieldAlert aria-hidden="true" /><span>{disposition.reason}</span></div> : null}

                    {row.kind === 'lain_lain' ? (
                      <div className="maker-import-fields maker-import-fields--manual">
                        <label>
                          <span>Masukkan sebagai</span>
                          <select value={row.manualFlow} onChange={(event) => changeManualFlow(row, event.target.value as MakerManualFlow)} disabled={saving}>
                            <option value="">Pilih kategori transaksi</option>
                            <option value="real_ops">Realisasi Ops</option>
                            <option value="income">RAB / Pencairan</option>
                            <option value="gas">GAS</option>
                            <option value="operational_disbursement">Pencairan Operasional</option>
                          </select>
                        </label>
                        {row.manualFlow === 'operational_disbursement' ? (
                          <label>
                            <span>Jenis operasional</span>
                            <select value={row.operationalType} onChange={(event) => changeOperationalType(row, event.target.value as MakerOperationalType)} disabled={saving}>
                              <option value="">Pilih jenis</option>
                              <option value="relawan_salary">Gaji Relawan</option>
                              <option value="pic_incentive">Insentif PIC</option>
                              <option value="sppg_rent">Sewa SPPG</option>
                              <option value="vehicle_rent">Sewa Kendaraan</option>
                            </select>
                          </label>
                        ) : null}
                      </div>
                    ) : (
                      <div className="maker-import-readonly-kind">
                        Jenis transaksi terdeteksi: <strong>{row.kind === 'combined_payroll' ? 'Payroll gabungan — wajib dikecualikan karena satu nominal mencakup beberapa jenis' : flow === 'income' ? 'RAB / Pencairan' : flow === 'gas' ? 'GAS' : flow === 'ops_disbursement' ? 'OPS / Pencairan' : flow === 'real_ops' ? 'Realisasi Ops' : 'Pencairan Operasional — ' + operationalTypeLabel(row.operationalType || defaultOperationalType(row.kind))}</strong>
                      </div>
                    )}

                    {(flow === 'income' || flow === 'gas') ? (
                      <label className="maker-import-account-select">
                        <span>Rekening terhubung ke mapping dapur</span>
                        <select
                          value={row.accountId}
                          onChange={(event) => chooseAccount(row, event.target.value)}
                          disabled={saving || !kitchenId}
                        >
                          <option value="">Pilih rekening yang dimapping</option>
                          {rowAccounts.map((account) => (
                            <option key={account.id} value={account.id}>{getAccountOptionLabel(account)}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {(flow === 'operational_disbursement' || flow === 'real_ops' || flow === 'ops_disbursement') ? (
                      <label className="maker-import-account-select">
                        <span>{flow === 'real_ops' || flow === 'ops_disbursement' ? 'Mapping rekening Ops Harian database' : 'Mapping rekening operasional database'}</span>
                        <select
                          value={row.operationalRuleId}
                          onChange={(event) => chooseOperationalRule(row, event.target.value)}
                          disabled={saving || !kitchenId || rowOperationalRules.length === 0 || disposition.status === 'excluded'}
                        >
                          <option value="">Pilih mapping untuk dapur ini</option>
                          {rowOperationalRules.map((rule) => (
                            <option key={rule.id} value={rule.id}>
                              {rule.owner_name} — {rule.bank} / {rule.account_number}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <div className="maker-import-fields">
                      <label>
                        <span>Nama penerima / rekening</span>
                        <input value={row.recipientName} readOnly title="Data sumber. Koreksi di Maker lalu tempel ulang agar jejak sumber tetap konsisten." disabled={saving} />
                      </label>
                      <label>
                        <span>Bank</span>
                        <input value={row.bank} readOnly title="Data sumber. Koreksi di Maker lalu tempel ulang." disabled={saving} />
                      </label>
                      <label>
                        <span>Nomor rekening</span>
                        <input value={row.accountNumber} readOnly title="Data sumber. Koreksi di Maker lalu tempel ulang." disabled={saving} />
                      </label>
                      <label>
                        <span>Nominal (integer sesuai database)</span>
                        <input inputMode="numeric" value={formatAmount(row.amount)} readOnly title="Nominal harus sesuai teks asli Maker. Koreksi di Maker lalu tempel ulang." disabled={saving} />
                      </label>
                      <label className="maker-import-detail-field">
                        <span>Detail / produk / periode / keperluan</span>
                        <input value={row.details} readOnly title="Detail dari output Maker. Koreksi di Maker lalu tempel ulang." disabled={saving} />
                      </label>
                    </div>

                    {validation.errors.length > 0 || validation.confirmations.length > 0 ? (
                      <div className="maker-import-row-issues">
                        {validation.errors.map((issue) => <p key={issue}><AlertTriangle aria-hidden="true" /> {issue}</p>)}
                        {validation.confirmations.map((issue) => <p key={issue} className="is-confirm"><AlertTriangle aria-hidden="true" /> {issue}</p>)}
                      </div>
                    ) : null}

                    {manualRequired ? (
                      <label className="maker-import-verify">
                        <input
                          type="checkbox"
                          checked={row.verified}
                          onChange={(event) => updateRow(row.id, { verified: event.target.checked })}
                          disabled={saving}
                        />
                        <span>Saya sudah memeriksa baris ini dan data rekeningnya benar.</span>
                      </label>
                    ) : null}
                  </article>
                )
              })}
            </div>
            {saveError ? <div className="maker-import-message is-error"><AlertTriangle /> {saveError}</div> : null}
            {successMessage ? <div className="maker-import-message is-success"><CheckCircle2 /> {successMessage}</div> : null}
            <div className="maker-import-save-footer">
              <div>
                <strong>{importableChecks.length} baris masuk program</strong>
                <span>Rp {formatAmount(importableAmount)} masuk · {excludedChecks.length} dikecualikan · Rp {formatAmount(totalAmount)} total sumber</span>
              </div>
              <button type="button" className="maker-import-primary" onClick={() => void handleSave()} disabled={!canSave}>
                {saving ? <><LoaderCircle className="is-spinning" /> Menyimpan…</> : <><Upload aria-hidden="true" /> Verifikasi selesai &amp; simpan ke database</>}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </section>
  )
}

function operationalTypeLabel(value: MakerOperationalType): string {
  switch (value) {
    case 'relawan_salary': return 'Gaji Relawan'
    case 'pic_incentive': return 'Insentif PIC'
    case 'sppg_rent': return 'Sewa SPPG'
    case 'vehicle_rent': return 'Sewa Kendaraan'
    default: return 'Operasional'
  }
}
