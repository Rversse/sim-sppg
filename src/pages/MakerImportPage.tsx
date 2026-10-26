import { useEffect, useMemo, useState } from 'react'
import { ImportConfirmationDialog } from '@/components/ui/import-confirmation-dialog'
import { AlertTriangle, CheckCircle2, ClipboardPaste, Database, FileCheck2, LoaderCircle, RotateCcw, ShieldAlert } from 'lucide-react'
import { isOperationalTypeAvailable } from '@/features/transactions/operational-policy'
import {
  defaultManualFlow,
  defaultOperationalType,
  normalizeMakerAccountNumber,
  normalizeMakerBank,
  normalizeMakerText,
  findMappedNeutralAccountForLainLain,
  matchesMakerAccountRecipient,
  matchesMakerOperationalAccount,
  operationalRuleTypeForKind,
  parseMakerDocument,
  type MakerImportDraftRow,
  type MakerImportKind,
  type MakerManualFlow,
  type MakerOperationalType
} from '@/features/maker-import/maker-import-utils'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/features/ui/toast-context'

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
  mapping_status: 'active' | 'excluded'
  target_role: 'aslap' | 'akuntan' | 'pic_yayasan' | 'berkah_mandiri_putra' | 'supplier' | 'other' | null
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
  category: 'RAB' | 'GAS' | 'LAIN_LAIN' | 'OPS' | 'REAL_OPS' | 'OPERATIONAL' | null
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

function accountNameMatchesRecipient(account: AccountRef, recipientName: string): boolean {
  const supplier = getAccountSupplier(account)
  return matchesMakerAccountRecipient(recipientName, {
    accountName: account.name,
    businessName: supplier?.business_name,
    ownerName: supplier?.owner_name
  })
}

function isKoperasiArutalaBniAccount(account: AccountRef): boolean {
  return normalizeMakerBank(account.bank) === 'BNI' &&
    normalizeMakerText(account.name) === 'koperasi arutala'
}

function operationalTargetRoleLabel(role: OperationalAccountRule['target_role']): string {
  switch (role) {
    case 'akuntan': return 'Akuntan'
    case 'aslap': return 'Aslap'
    case 'pic_yayasan': return 'PIC Yayasan'
    case 'berkah_mandiri_putra': return 'Berkah Mandiri Putra'
    case 'supplier': return 'Pihak Luar'
    case 'other': return 'OPS'
    default: return 'OPS'
  }
}

function getRowFlow(
  row: MakerImportDraftRow
): MakerManualFlow {
  return row.manualFlow || defaultManualFlow(row.kind)
}

function getRowOperationalType(
  row: MakerImportDraftRow
): MakerOperationalType {
  return row.operationalType || defaultOperationalType(row.kind)
}

function getOperationalRuleType(row: MakerImportDraftRow): string | null {
  return operationalRuleTypeForKind(row.kind, getRowOperationalType(row))
}

function getExpectedAccountFlow(row: MakerImportDraftRow): 'income' | 'neutral' | null {
  const flow = getRowFlow(row)
  if (flow === 'income') return 'income'
  if (flow === 'gas' || flow === 'neutral_lain_lain' || flow === 'neutral_ops_harian') return 'neutral'
  return null
}

function accountMatchesRow(
  account: AccountRef,
  row: MakerImportDraftRow
): boolean {
  const incomingAccountNumber = normalizeMakerAccountNumber(row.accountNumber)
  const mappedAccountNumber = normalizeMakerAccountNumber(account.account_number)
  const maskedSuffix = incomingAccountNumber.match(/^x{3,}(\d{4})$/i)?.[1]
  const accountNumberMatches = maskedSuffix
    ? mappedAccountNumber.endsWith(maskedSuffix)
    : mappedAccountNumber === incomingAccountNumber

  return (
    normalizeMakerBank(account.bank) === normalizeMakerBank(row.bank) &&
    accountNumberMatches
  )
}

function usesAutomaticRecipientMapping(row: MakerImportDraftRow): boolean {
  return [
    'sppg_rent',
    'relawan_salary',
    'pic_school',
    'pic_posyandu',
    'combined_pic_incentive',
    'vehicle_rent'
  ].includes(row.kind)
}

function operationalRuleMatchesRow(
  rule: OperationalAccountRule,
  row: MakerImportDraftRow
): boolean {
  return matchesMakerOperationalAccount(row.recipientName, row.bank, row.accountNumber, {
    ownerName: rule.owner_name,
    bank: rule.bank,
    accountNumber: rule.account_number
  })
}

function applyInitialMappings(
  rows: MakerImportDraftRow[],
  kitchenId: string,
  refs: ImportReferences
): MakerImportDraftRow[] {
  return rows.map((row) => {
    if (row.kind === 'lain_lain') {
      const neutralAccountIds = new Set(
        refs.accountRules
          .filter((rule) => rule.kitchen_id === kitchenId && (rule.flow_type === 'neutral' || rule.flow_type === 'income'))
          .map((rule) => rule.account_id)
      )
      const neutralCandidates = refs.accounts
        .filter((account) => neutralAccountIds.has(account.id))
        .map((account) => ({
          id: account.id,
          name: account.name,
          bank: account.bank,
          accountNumber: account.account_number,
          aliases: [getAccountLabel(account), getAccountSupplier(account)?.owner_name]
        }))
      const matchedNeutralAccount = findMappedNeutralAccountForLainLain(row, neutralCandidates)
      if (matchedNeutralAccount) {
        return {
          ...row,
          manualFlow: 'neutral_lain_lain',
          operationalType: '',
          accountId: matchedNeutralAccount.id,
          operationalRuleId: ''
        }
      }
      if (row.manualFlow === 'neutral_lain_lain') {
        row = { ...row, manualFlow: 'ops_disbursement', accountId: '', operationalRuleId: '' }
      }
    }

    // Only the exact "Ops Harian" note to an active Akuntan/Aslap mapping
    // is an OPS disbursement. Every other OPS HARIAN row follows its mapped
    // neutral destination account (for example Koperasi Arutala), globally.
    if (row.kind === 'ops_harian') {
      const normalizedDetails = normalizeMakerText(row.details)
      const standardOpsMatches = refs.operationalRules.filter((rule) =>
        rule.kitchen_id === kitchenId &&
        rule.rule_type === 'ops_harian' &&
        rule.mapping_status === 'active' &&
        (rule.target_role === 'akuntan' || rule.target_role === 'aslap') &&
        operationalRuleMatchesRow(rule, row)
      )
      if (normalizedDetails === 'ops harian' && standardOpsMatches.length === 1) {
        return {
          ...row,
          manualFlow: 'ops_disbursement',
          operationalType: '',
          accountId: '',
          operationalRuleId: standardOpsMatches[0].id
        }
      }

      const neutralAccountIds = new Set(
        refs.accountRules
          .filter((rule) => rule.kitchen_id === kitchenId && rule.flow_type === 'neutral')
          .map((rule) => rule.account_id)
      )
      const neutralMatches = refs.accounts.filter((account) =>
        neutralAccountIds.has(account.id) &&
        accountMatchesRow(account, row) &&
        accountNameMatchesRecipient(account, row.recipientName)
      )
      if (neutralMatches.length === 1) {
        return {
          ...row,
          manualFlow: 'neutral_ops_harian',
          operationalType: '',
          accountId: neutralMatches[0].id,
          operationalRuleId: ''
        }
      }
      if (row.manualFlow === 'neutral_ops_harian') {
        row = { ...row, manualFlow: 'ops_disbursement', accountId: '', operationalRuleId: '' }
      }
    }

    const flow = getRowFlow(row)
    if (flow === 'income' || flow === 'gas' || flow === 'neutral_ops_harian') {
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
      reason: 'Payroll gabungan dikecualikan dari transaksi program.'
    }
  }

  if (row.kind === 'lain_lain') {
    if (row.manualDecision === 'block') {
      return {
        status: 'excluded',
        reason: 'Diblokir manual oleh Admin. Baris hanya disimpan untuk audit dan tidak dibuat sebagai transaksi program.'
      }
    }
    if (row.manualDecision === 'pending') {
      return { status: 'import', reason: null }
    }
  }

  const flow = getRowFlow(row)
  const operationalType = getRowOperationalType(row)
  let ruleTypes: string[] = []

  if (flow === 'ops_disbursement') {
    ruleTypes = ['ops_harian']
  } else if (flow === 'operational_disbursement') {
    const ruleType = getOperationalRuleType(row)
    if (ruleType) ruleTypes = [ruleType]
    if (row.kind === 'lain_lain' && operationalType === 'pic_incentive') {
      ruleTypes = ['pic_incentive_school', 'pic_incentive_posyandu']
    }
  }

  if (ruleTypes.length === 0) return { status: 'import', reason: null }

  const matchingRules = refs.operationalRules.filter((rule) =>
    rule.kitchen_id === kitchenId &&
    ruleTypes.includes(rule.rule_type) &&
    operationalRuleMatchesRow(rule, row)
  )

  const hasActiveMatch = matchingRules.some((rule) => rule.mapping_status === 'active')
  if (matchingRules.length > 0 && !hasActiveMatch) {
    return {
      status: 'excluded',
      reason: 'Mapping Data Rekening ditandai Dikecualikan. Baris tetap masuk riwayat audit, tetapi tidak dibuat sebagai transaksi SIM-SPPG.'
    }
  }

  return { status: 'import', reason: null }
}
function getExcludedBaselineValidation(
  row: MakerImportDraftRow,
  kitchenId: string,
  transactionDate: string,
  refs: ImportReferences
): { errors: string[]; confirmations: string[]; account?: AccountRef; operationalRule?: OperationalAccountRule } {
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
  let matchedAccount: AccountRef | undefined
  let matchedOperationalRule: OperationalAccountRule | undefined

  if (flow === 'income' || flow === 'gas' || flow === 'neutral_lain_lain' || flow === 'neutral_ops_harian') {
    const expectedFlow = flow === 'income' ? 'income' : 'neutral'
    const ruleAccountIds = new Set(
      refs.accountRules
        .filter((rule) =>
          rule.kitchen_id === kitchenId && (
            rule.flow_type === expectedFlow ||
            (flow === 'neutral_lain_lain' && rule.flow_type === 'income')
          )
        )
        .map((rule) => rule.account_id)
    )

    if (flow === 'gas') {
      // GAS uses the kitchen's single Koperasi Arutala BNI mapping; no manual dropdown.
      const automaticMatches = refs.accounts.filter((account) =>
        ruleAccountIds.has(account.id) && accountMatchesRow(account, row)
      )
      matchedAccount = automaticMatches.length === 1 ? automaticMatches[0] : undefined
      if (!matchedAccount) {
        errors.push(automaticMatches.length === 0
          ? 'Rekening GAS otomatis tidak cocok dengan mapping Koperasi Arutala — BNI untuk dapur ini.'
          : 'Mapping GAS tidak tunggal untuk dapur ini. Periksa mapping Koperasi Arutala di database.')
      }
    } else {
      matchedAccount = refs.accounts.find((account) => account.id === row.accountId)
      if (!matchedAccount || !ruleAccountIds.has(matchedAccount.id)) {
        errors.push(flow === 'income'
          ? 'Rekening ini belum dimapping sebagai RAB/Pencairan untuk dapur terpilih.'
          : flow === 'neutral_ops_harian'
            ? 'Rekening OPS HARIAN custom belum dimapping sebagai rekening netral untuk dapur terpilih.'
            : 'Rekening Lain-lain belum dimapping sebagai rekening netral untuk dapur terpilih.')
      } else if (
        flow === 'neutral_lain_lain' &&
        !isKoperasiArutalaBniAccount(matchedAccount)
      ) {
        errors.push('Lain-lain hanya boleh Allow ke Koperasi Arutala BNI, Akuntan, atau Aslap.')
      }
    }

    if (matchedAccount && !accountMatchesRow(matchedAccount, row)) {
      errors.push('Bank/nomor rekening pada draft tidak sama dengan mapping database. Periksa data sumber.')
    } else if (matchedAccount && !accountNameMatchesRecipient(matchedAccount, row.recipientName)) {
      confirmations.push('Nama penerima berbeda dari nama rekening di database.')
    }

    if (flow === 'gas' && kitchen && ['sukaraja', 'cihaur'].includes(normalizeMakerText(kitchen.name))) {
      errors.push('GAS tidak tersedia untuk dapur Sukaraja dan Cihaur.')
    }
  } else if (flow === 'operational_disbursement') {
    if (row.kind === 'lain_lain' && ['sppg_rent', 'relawan_salary', 'pic_incentive'].includes(operationalType)) {
      const expectedPic = kitchen?.operational_recipient_name?.trim() ?? ''
      if (!expectedPic) {
        errors.push('Nama PIC Yayasan belum diisi di master dapur.')
      } else if (normalizeMakerText(row.recipientName) !== normalizeMakerText(expectedPic)) {
        errors.push('Nama penerima transaksi manual harus sama dengan PIC Yayasan (' + expectedPic + '). Koreksi sumber di Maker.')
      }
    }

    if (!operationalType) {
      errors.push('Pilih jenis pencairan operasional.')
    } else if (kitchen && !isOperationalTypeAvailable(kitchen.name, operationalType, transactionDate)) {
      errors.push('Jenis operasional ini tidak tersedia untuk dapur/tanggal tersebut.')
    }

    const ruleType = getOperationalRuleType(row)
    if (row.kind === 'combined_pic_incentive') {
      // A combined PIC source amount is recorded once under PIC Sekolah.
      // PIC Posyandu mapping is intentionally not required and no second transaction is created.
      const schoolMatches = refs.operationalRules.filter((rule) =>
        rule.kitchen_id === kitchenId &&
        rule.rule_type === 'pic_incentive_school' &&
        rule.mapping_status === 'active' &&
        operationalRuleMatchesRow(rule, row)
      )
      matchedOperationalRule = schoolMatches.length === 1 ? schoolMatches[0] : undefined
      if (!matchedOperationalRule) {
        errors.push(
          'Mapping aktif Insentif PIC Sekolah tidak ditemukan atau ambigu untuk rekening gabungan.'
        )
      }
    } else if (usesAutomaticRecipientMapping(row)) {
      const matches = refs.operationalRules.filter((rule) =>
        rule.kitchen_id === kitchenId &&
        rule.rule_type === ruleType &&
        operationalRuleMatchesRow(rule, row)
      )
      matchedOperationalRule = matches.length === 1 ? matches[0] : undefined
    } else if (ruleType && row.operationalRuleId) {
      matchedOperationalRule = refs.operationalRules.find((rule) =>
        rule.id === row.operationalRuleId &&
        rule.kitchen_id === kitchenId &&
        rule.rule_type === ruleType
      )
    }

    if (!matchedOperationalRule) {
      errors.push(usesAutomaticRecipientMapping(row)
        ? 'Mapping aktif berdasarkan nama penerima, bank, nomor rekening, dan jenis pencairan tidak ditemukan atau ambigu.'
        : 'Mapping rekening operasional belum cocok. Pilih mapping database yang sesuai.')
    } else if (!operationalRuleMatchesRow(matchedOperationalRule, row)) {
      errors.push('Nama penerima, bank, atau nomor rekening berbeda dari mapping operasional database. Periksa identitas sumber.')
    } else if (
      normalizeMakerText(matchedOperationalRule.owner_name) !==
      normalizeMakerText(row.recipientName)
    ) {
      errors.push('Nama penerima tidak sama dengan pemilik rekening pada mapping operasional database. Baris ini tidak dapat diimpor.')
    }
  } else if (flow === 'ops_disbursement') {
    const matchingOpsRules = refs.operationalRules.filter((rule) =>
      rule.kitchen_id === kitchenId &&
      rule.rule_type === 'ops_harian' &&
      rule.mapping_status === 'active' &&
      operationalRuleMatchesRow(rule, row)
    )
    const opsMatches = matchingOpsRules.filter((rule) =>
      (row.kind !== 'lain_lain' && row.kind !== 'ops_harian') ||
      rule.target_role === 'akuntan' ||
      rule.target_role === 'aslap'
    )
    matchedOperationalRule = opsMatches.length === 1 ? opsMatches[0] : undefined
    const normalizedOpsDetails = normalizeMakerText(row.details)
    if (row.kind === 'ops_harian' && normalizedOpsDetails !== 'ops harian') {
      errors.push('OPS HARIAN dengan deskripsi selain "Ops Harian" harus cocok dengan rekening netral yang dimapping pada dapur.')
    }
    if (opsMatches.length === 0 && row.kind === 'ops_harian' && normalizedOpsDetails === 'ops harian') {
      errors.push('OPS HARIAN berdeskripsi "Ops Harian" harus memakai rekening Akuntan atau Aslap yang aktif dimapping.')
    } else if (opsMatches.length !== 1) {
      errors.push(row.kind === 'lain_lain'
        ? opsMatches.length === 0
          ? 'Lain-lain hanya bisa Allow jika rekening terdeteksi sebagai Akuntan, Aslap, atau Koperasi Arutala BNI.'
          : 'Mapping Akuntan/Aslap lebih dari satu untuk rekening ini. Periksa mapping aktif di database.'
        : 'Mapping Ops Harian lebih dari satu. Periksa mapping aktif di database.')
    }
  } else if (flow === 'real_ops') {
    if (row.kind !== 'real_ops') {
      errors.push('OPS / Real harus memakai jenis sumber OPS Real.')
    }
    if (row.recipientName.trim() || row.bank.trim() || row.accountNumber.trim() || row.accountId || row.operationalRuleId) {
      errors.push('OPS / Real hanya menyimpan nominal per dapur dan tidak memakai mapping rekening.')
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
  if (flow === 'neutral_lain_lain') {
    return { flow_type: 'neutral', category: 'LAIN_LAIN', operational_type: null }
  }
  if (flow === 'neutral_ops_harian') {
    return { flow_type: 'neutral', category: 'OPS', operational_type: null }
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
  const { success: toastSuccess } = useToast()
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [duplicateRows, setDuplicateRows] = useState<Record<string, string>>({})
  const [duplicateBatch, setDuplicateBatch] = useState(false)
  const [duplicateBatchMessage, setDuplicateBatchMessage] = useState('')
  const [duplicateCheckError, setDuplicateCheckError] = useState('')

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
              .select('id,kitchen_id,rule_type,owner_name,bank,account_number,mapping_status,target_role')
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

  async function handleParse() {
    setParseError('')
    setSaveError('')
    setDuplicateRows({})
    setDuplicateBatchMessage('')
    setDuplicateCheckError('')
    setCheckingDuplicates(false)

    const parsed = parseMakerDocument(sourceText)
    if (parsed.error) {
      setDraftReady(false)
      setParseError(parsed.error)
      setRows([])
      setSourceKitchenName('')
      setSourceDate('')
      setDuplicateRows({})
      setDuplicateBatchMessage('')
      setDuplicateCheckError('')
      return
    }
    setCheckingDuplicates(true)
    setSourceKitchenName(parsed.kitchenName)
    setSourceDate(parsed.transactionDate)

    const matchingKitchen = refs.kitchens.find(
      (kitchen) => normalizeMakerText(kitchen.name) === normalizeMakerText(parsed.kitchenName)
    )
    const selectedKitchenId = matchingKitchen?.id ?? ''
    const initialRows = applyInitialMappings(parsed.rows, selectedKitchenId, refs)
    setKitchenId(selectedKitchenId)
    setTransactionDate(parsed.transactionDate)
    setRows(initialRows)
    setDraftReady(true)
    if (!matchingKitchen) {
      setParseError('Nama dapur "' + parsed.kitchenName + '" belum cocok dengan dapur aktif di database. Pilih dapur yang benar pada preview.')
    }

  }

  function updateRow(id: string, patch: Partial<MakerImportDraftRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
    setSaveError('')
  }

  function handleKitchenChange(nextKitchenId: string) {
    setKitchenId(nextKitchenId)
    setRows((current) => applyInitialMappings(
      current.map((row) => ({
        ...row,
        accountId: '',
        operationalRuleId: '',
        verified: false,
        manualDecision: row.kind === 'lain_lain' ? 'pending' : row.manualDecision
      })),
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

  function decideLainLain(row: MakerImportDraftRow, decision: 'allow' | 'block') {
    updateRow(row.id, { manualDecision: decision, verified: false })
  }

  const checks = useMemo(() => rows.map((row) => {
    const disposition = getRowDisposition(row, kitchenId, refs)
    const validation = disposition.status === 'excluded'
      ? getExcludedBaselineValidation(row, kitchenId, transactionDate, refs)
      : getValidation(row, kitchenId, transactionDate, refs)
    return { row, validation, flowInfo: effectiveDatabaseFlow(row), disposition }
  }), [rows, kitchenId, transactionDate, refs])

  useEffect(() => {
    if (!draftReady || !transactionDate || !sourceText.trim()) return

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setCheckingDuplicates(true)
      setDuplicateRows({})
      setDuplicateBatchMessage('')
      setDuplicateCheckError('')
      setDuplicateBatch(false)
      try {
        const normalizedSourceText = sourceText.replace(/\r\n?/g, '\n').trim()
        const digest = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(normalizedSourceText)
        )
        const contentHash = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
        const batchResult = await supabase
          .from('maker_import_batches')
          .select('id')
          .eq('content_hash', contentHash)
          .maybeSingle()
        if (batchResult.error) throw batchResult.error
        if (batchResult.data && !cancelled) {
          setDuplicateBatch(true)
          setDuplicateBatchMessage('Dokumen Maker ini sudah pernah diimpor. Tidak bisa diposting ulang.')
        }

        if (!kitchenId) return
        const transactionResult = await supabase
          .from('transactions')
          .select('id,flow_type,category,amount,account_id,destination_label,operational_type')
          .eq('transaction_date', transactionDate)
          .eq('kitchen_id', kitchenId)
        if (transactionResult.error) throw transactionResult.error
        type ExistingMakerTransaction = {
          id: string
          flow_type: string
          category: string
          amount: number | string
          account_id: string | null
          destination_label: string | null
          operational_type: string | null
        }
        const existing = (transactionResult.data ?? []) as ExistingMakerTransaction[]
        const reasons: Record<string, string> = {}
        const seen = new Map<string, MakerImportDraftRow>()
        const selectedKitchenName = refs.kitchens.find((item) => item.id === kitchenId)?.name ?? ''

        for (const { row, validation, flowInfo, disposition } of checks) {
          if (disposition.status !== 'import' || row.amount === null) continue
          if (row.kind === 'lain_lain' && row.manualDecision !== 'allow') continue
          if (!flowInfo.flow_type || !flowInfo.category) continue
          const flow = flowInfo.flow_type
          const isIncome = flow === 'income'
          const isGas = flow === 'neutral'
          const isOps = flow === 'ops_disbursement'
          const isOperational = flow === 'operational_disbursement'
          const accountId = isIncome ? row.accountId : isGas ? (validation.account?.id ?? row.accountId) : null
          const rolePrefix: Record<string, string> = {
            aslap: 'Aslap',
            akuntan: 'Akuntan',
            pic_yayasan: 'PIC Yayasan',
            berkah_mandiri_putra: 'Berkah Mandiri Putra',
            supplier: 'Pihak Luar',
            other: 'OPS'
          }
          const destinationLabel = isOps
            ? (rolePrefix[validation.operationalRule?.target_role ?? ''] ?? 'Akuntan') + ' ' + selectedKitchenName
            : null
          const candidate = {
            flow_type: flow,
            category: flowInfo.category,
            amount: row.amount,
            account_id: accountId,
            destination_label: destinationLabel,
            operational_type: isOperational ? flowInfo.operational_type : null
          }
          const existingMatch = existing.find((item) =>
            item.flow_type === candidate.flow_type &&
            item.category === candidate.category &&
            Number(item.amount) === candidate.amount &&
            (candidate.flow_type === 'income' || candidate.flow_type === 'neutral'
              ? item.account_id === candidate.account_id
              : candidate.flow_type === 'ops_disbursement'
                ? item.destination_label === candidate.destination_label && item.account_id === null
                : candidate.flow_type === 'operational_disbursement'
                  ? item.operational_type === candidate.operational_type
                  : item.account_id === null)
          )
          if (existingMatch) {
            reasons[row.id] = 'Tanggal, dapur, jenis, rekening/tujuan, dan nominal sama dengan transaksi yang sudah ada.'
          }

          const key = [
            candidate.flow_type,
            candidate.category,
            candidate.amount,
            candidate.flow_type === 'income' || candidate.flow_type === 'neutral'
              ? candidate.account_id ?? ''
              : candidate.flow_type === 'ops_disbursement'
                ? candidate.destination_label ?? ''
                : candidate.operational_type ?? ''
          ].join('|')
          const prior = seen.get(key)
          if (prior) {
            reasons[row.id] = 'Transaksi ini berulang pada dokumen yang sama; periksa baris ' + prior.lineNumber + '.'
            reasons[prior.id] = reasons[prior.id] || 'Transaksi ini berulang pada dokumen yang sama; periksa baris ' + row.lineNumber + '.'
          } else {
            seen.set(key, row)
          }
        }

        if (!cancelled) setDuplicateRows(reasons)
      } catch (duplicateError) {
        if (!cancelled) setDuplicateCheckError(duplicateError instanceof Error ? duplicateError.message : 'Gagal memeriksa duplikat sebelum impor.')
      } finally {
        if (!cancelled) setCheckingDuplicates(false)
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draftReady, sourceText, kitchenId, transactionDate, checks, refs])

  const totalAmount = rows.reduce((total, row) => total + (row.amount ?? 0), 0)
  const excludedChecks = checks.filter(({ disposition }) => disposition.status === 'excluded')
  const pendingManualChecks = checks.filter(({ row }) => row.kind === 'lain_lain' && row.manualDecision === 'pending')
  const importableChecks = checks.filter(({ row, disposition }) =>
    disposition.status === 'import' && !(row.kind === 'lain_lain' && row.manualDecision === 'pending')
  )
  const excludedAmount = excludedChecks.reduce((total, { row }) => total + (row.amount ?? 0), 0)
  const importableAmount = importableChecks.reduce((total, { row }) => total + (row.amount ?? 0), 0)
  const sourceIdentityMismatch = Boolean(draftReady) && (
    !activeKitchen ||
    normalizeMakerText(activeKitchen.name) !== normalizeMakerText(sourceKitchenName) ||
    transactionDate !== sourceDate
  )
  const duplicateCount = checks.filter(({ row, disposition }) =>
    disposition.status === 'import' && Boolean(duplicateRows[row.id])
  ).length
  const blockingCount = checks.filter(({ row, validation, flowInfo, disposition }) =>
    validation.errors.length > 0 ||
    (row.kind === 'lain_lain' && row.manualDecision === 'pending') ||
    (row.kind === 'lain_lain' && row.manualDecision === 'allow' && !row.verified) ||
    (disposition.status === 'import' && ((validation.confirmations.length > 0 && !row.verified) || !flowInfo.flow_type || !flowInfo.category))
  ).length + (sourceIdentityMismatch ? 1 : 0) + duplicateCount
  const canSave = draftReady && !loadingRefs && !refsError && Boolean(activeKitchen) &&
    Boolean(transactionDate) && rows.length > 0 && blockingCount === 0 &&
    !sourceIdentityMismatch && !checkingDuplicates && !duplicateBatch && !duplicateBatchMessage &&
    !duplicateCheckError && !saving

  function handleSave() {
    if (!canSave || !activeKitchen) return
    setSaveError('')
    setConfirmOpen(true)
  }

  async function confirmSave() {
    if (!canSave || !activeKitchen) return
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
          note: isIncome || isGas || isOpsDisbursement ? (row.details.trim() || null) : null,
          // Retain intended classification in the audit row when excluded; the SQL
          // function verifies the exclusion against Data Rekening before allowing audit-only save.
          flow_type: flow,
          category: flowInfo.category,
          operational_type: !isOperational ? null : flowInfo.operational_type,
          account_id: disposition.status === 'excluded' || (!isIncome && !isGas) ? null : isGas ? (validation.account?.id ?? null) : row.accountId,
          supplier_id: null,
          destination_label: disposition.status === 'excluded' || !isOpsDisbursement
            ? null
            : validation.operationalRule?.target_role === 'aslap'
              ? 'Aslap ' + activeKitchen.name
              : validation.operationalRule?.target_role === 'akuntan'
                ? 'Akuntan ' + activeKitchen.name
                : validation.operationalRule?.target_role === 'pic_yayasan'
                  ? 'PIC Yayasan ' + activeKitchen.name
                  : validation.operationalRule?.target_role === 'supplier'
                    ? 'Pihak Luar ' + activeKitchen.name
                    : validation.operationalRule?.target_role === 'other'
                      ? 'OPS ' + activeKitchen.name
                      : 'Akuntan ' + activeKitchen.name,
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
        // Close the confirmation dialog only after the database RPC succeeded.
        // The success toast is then shown on the underlying page.
        setConfirmOpen(false)
        toastSuccess(
          'Batch berhasil diimpor',
          (result?.inserted_count ?? importableChecks.length) +
          ' transaksi masuk database program (Rp ' + formatAmount(result?.total_amount ?? importableAmount) + '); ' +
          (result?.excluded_count ?? excludedChecks.length) + ' baris dikecualikan (Rp ' +
          formatAmount(result?.excluded_total_amount ?? excludedAmount) + ').'
        )

        // Return the import page to its initial blank state after the successful save.
        setSourceText('')
        setDraftReady(false)
        setKitchenId('')
        setTransactionDate('')
        setSourceKitchenName('')
        setSourceDate('')
        setRows([])
        setParseError('')
        setSaveError('')
        setCheckingDuplicates(false)
        setDuplicateRows({})
        setDuplicateBatch(false)
        setDuplicateBatchMessage('')
        setDuplicateCheckError('')
        window.scrollTo({ top: 0, behavior: 'smooth' })
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
          <h2>Import dari Maker-Pencairan</h2>
        </div>
      </div>

      {refsError ? <div className="maker-import-message is-error"><AlertTriangle /> {refsError}</div> : null}
      {duplicateBatchMessage ? <div className="maker-import-message is-error"><ShieldAlert /> {duplicateBatchMessage}</div> : null}
      {duplicateCheckError ? <div className="maker-import-message is-error"><ShieldAlert /> Pemeriksaan duplikat gagal: {duplicateCheckError}</div> : null}
      {loadingRefs ? <div className="maker-import-loading"><LoaderCircle className="is-spinning" /> Mengambil dapur dan mapping rekening dari database…</div> : null}

      <section className="maker-import-panel maker-import-source-panel">
        <div className="maker-import-panel-head">
          <div>
            <span>LANGKAH 1</span>
            <h3>Input Data</h3>
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
              setDuplicateRows({})
              setDuplicateBatchMessage('')
              setDuplicateCheckError('')
              setDuplicateBatch(false)
              setCheckingDuplicates(false)
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
            setDuplicateRows({})
            setDuplicateBatchMessage('')
            setDuplicateCheckError('')
            setDuplicateBatch(false)
            setCheckingDuplicates(false)
          }}
          placeholder="Paste data disini..."
          spellCheck={false}
          disabled={loadingRefs || saving}
        />
        <div className="maker-import-source-footer">
          <button
            type="button"
            className="maker-import-primary"
            onClick={handleParse}
            disabled={loadingRefs || Boolean(refsError) || !sourceText.trim() || saving}
          >
            <FileCheck2 aria-hidden="true" /> Decode
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
                <input type="date" value={transactionDate} readOnly disabled={saving} />
              </label>
            </div>
            {sourceIdentityMismatch ? <div className="maker-import-message is-error"><AlertTriangle aria-hidden="true" /> Header sumber ({sourceKitchenName}, {sourceDate}) tidak sama dengan dapur/tanggal terpilih. Batch tidak dapat disimpan; reset dan tempel output yang benar.</div> : null}
            <div className="maker-import-summary">
              <div><small>Total pencairan</small><strong>{rows.length}</strong></div>
              <div><small>Pencairan masuk</small><strong>{importableChecks.length}</strong><small>Rp {formatAmount(importableAmount)}</small></div>
              <div className={excludedChecks.length > 0 ? 'is-attention' : 'is-ready'}><small>Dikecualikan</small><strong>{excludedChecks.length}</strong><small>Rp {formatAmount(excludedAmount)}</small></div>
              <div className={pendingManualChecks.length > 0 ? 'is-attention' : 'is-ready'}><small>Perlu keputusan</small><strong>{pendingManualChecks.length}</strong><small>Lain-Lain</small></div>
              <div className={blockingCount > 0 ? 'is-attention' : 'is-ready'}><small>Status validasi</small><strong>{blockingCount > 0 ? blockingCount + ' perlu koreksi' : 'Siap disimpan'}</strong></div>
            </div>
          </section>

          <section className="maker-import-panel">
            <div className="maker-import-panel-head">
              <div>
                <span>LANGKAH 3</span>
                <h3>Verifikasi tiap transaksi</h3>
              </div>
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
                        (rule.flow_type === accountFlow ||
                          (flow === 'neutral_lain_lain' && rule.flow_type === 'income'))
                      ) &&
                      (flow !== 'neutral_lain_lain' || isKoperasiArutalaBniAccount(account))
                    )
                  : []
                const ruleType = flow === 'ops_disbursement' ? 'ops_harian' : getOperationalRuleType(row)
                const rowOperationalRules = row.kind === 'lain_lain'
                  ? refs.operationalRules.filter((rule) =>
                      rule.kitchen_id === kitchenId &&
                      rule.rule_type === 'ops_harian' &&
                      rule.mapping_status === 'active' &&
                      (rule.target_role === 'akuntan' || rule.target_role === 'aslap')
                    )
                  : ruleType
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
                const hasNameMismatch = flow === 'income' || flow === 'gas' || flow === 'neutral_lain_lain'
                  ? Boolean(expectedAccount && !accountNameMatchesRecipient(expectedAccount, row.recipientName))
                  : Boolean(expectedOperational && normalizeMakerText(expectedOperational.owner_name) !== normalizeMakerText(row.recipientName))
                const manualRequired = row.kind === 'lain_lain' || hasNameMismatch || validation.confirmations.length > 0
                const manualDecisionPending = row.kind === 'lain_lain' && row.manualDecision === 'pending'
                const rowBlocked = disposition.status === 'excluded'
                const rowLocked = rowBlocked && (row.kind !== 'lain_lain' || row.manualDecision === 'block')
                const rowInvalid = !rowBlocked && (manualDecisionPending ||
                  (row.kind === 'lain_lain' && row.manualDecision === 'allow' && !row.verified) ||
                  validation.errors.length > 0 ||
                  (validation.confirmations.length > 0 && !row.verified) ||
                  !flowInfo.flow_type || !flowInfo.category)
                const title = row.sourceCategory === 'Lain-lain' ? 'Lain-lain • keputusan Admin' : row.sourceCategory

                return (
                  <article className={'maker-import-row' + (rowBlocked ? ' is-blocked' : rowInvalid ? ' is-invalid' : ' is-valid')} key={row.id}>
                    <div className="maker-import-row-head">
                      <div>
                        <span className="maker-import-row-number">BARIS {row.lineNumber}</span>
                        <h4>{title}</h4>
                      </div>
                      <span className={'maker-import-row-status' + (rowBlocked ? ' is-blocked' : rowInvalid ? ' is-invalid' : ' is-valid')}>
                        {rowBlocked ? <><ShieldAlert aria-hidden="true" /> Tidak Valid</> : manualDecisionPending ? <><AlertTriangle aria-hidden="true" /> Perlu keputusan</> : rowInvalid ? <><AlertTriangle aria-hidden="true" /> Perlu koreksi</> : <><CheckCircle2 aria-hidden="true" /> Valid</>}
                      </span>
                    </div>
                    {row.kind === 'lain_lain' ? (
                      <div className={'maker-import-manual-decision' + (manualDecisionPending ? ' is-pending' : row.manualDecision === 'block' ? ' is-blocked' : ' is-allowed')}>
                        <div className="maker-import-manual-decision-actions">
                          <button type="button" className={'maker-import-decision-button is-allow' + (row.manualDecision === 'allow' ? ' is-selected' : '')}
                            aria-pressed={row.manualDecision === 'allow'} onClick={() => decideLainLain(row, 'allow')} disabled={saving}>
                            <CheckCircle2 aria-hidden="true" /> Allow — boleh masuk program
                          </button>
                          <button type="button" className={'maker-import-decision-button is-block' + (row.manualDecision === 'block' ? ' is-selected' : '')}
                            aria-pressed={row.manualDecision === 'block'} onClick={() => decideLainLain(row, 'block')} disabled={saving}>
                            <ShieldAlert aria-hidden="true" /> Block — audit saja
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="maker-import-readonly-kind">
                      Jenis transaksi: <strong>{flow === 'neutral_ops_harian' ? 'OPS HARIAN / Netral' : row.kind === 'lain_lain' ? (flow === 'neutral_lain_lain' ? 'Lain-lain / Netral' : 'OPS / Pencairan') : row.kind === 'combined_payroll' ? 'Payroll gabungan' : flow === 'income' ? 'RAB / Pencairan' : flow === 'gas' ? 'GAS' : flow === 'ops_disbursement' ? 'OPS / Pencairan' : flow === 'real_ops' ? 'OPS / Real' : 'Pencairan Operasional — ' + operationalTypeLabel(row.operationalType || defaultOperationalType(row.kind))}</strong>
                    </div>

                    {row.kind === 'lain_lain' && row.manualDecision === 'allow' ? (
                      <div className="maker-import-readonly-kind">
                        Tujuan terdeteksi: <strong>{
                          flow === 'neutral_lain_lain'
                            ? 'Koperasi Arutala — BNI'
                            : validation.operationalRule &&
                                (validation.operationalRule.target_role === 'akuntan' ||
                                  validation.operationalRule.target_role === 'aslap')
                              ? operationalTargetRoleLabel(validation.operationalRule.target_role) +
                                ' — ' + validation.operationalRule.owner_name +
                                ' — ' + validation.operationalRule.bank +
                                ' / ' + validation.operationalRule.account_number
                              : 'Tidak cocok dengan tujuan yang diizinkan'
                        }</strong>
                      </div>
                    ) : null}

                    {flow === 'income' || flow === 'neutral_lain_lain' || flow === 'neutral_ops_harian' ? (
                      <label className="maker-import-account-select">
                        <span>{flow === 'income' ? 'Rekening terhubung ke mapping dapur' : 'Rekening netral terhubung ke mapping dapur'}</span>
                        <select
                          value={row.accountId}
                          onChange={(event) => chooseAccount(row, event.target.value)}
                          disabled={saving || rowLocked || !kitchenId}
                        >
                          <option value="">Pilih rekening yang dimapping</option>
                          {rowAccounts.map((account) => (
                            <option key={account.id} value={account.id}>{getAccountOptionLabel(account)}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {flow === 'operational_disbursement' && !usesAutomaticRecipientMapping(row) ? (
                      <label className="maker-import-account-select">
                        <span>Mapping rekening operasional database</span>
                        <select
                          value={row.operationalRuleId}
                          onChange={(event) => chooseOperationalRule(row, event.target.value)}
                          disabled={saving || rowLocked || !kitchenId || rowOperationalRules.length === 0 || disposition.status === 'excluded'}
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

                    {row.kind === 'real_ops' ? (
                      <div className="maker-import-fields">
                        <label>
                          <span>Nominal (Rp)</span>
                          <input inputMode="numeric" value={formatAmount(row.amount)} onChange={(event) => {
                            const digits = event.target.value.replace(/[^0-9]/g, '')
                            const amount = digits ? Number(digits) : null
                            updateRow(row.id, { amount: amount !== null && Number.isSafeInteger(amount) ? amount : null, verified: false })
                          }} title="Nominal OPS / Real dapat dikoreksi. Sumber asli tetap disimpan untuk audit." disabled={saving || rowLocked} />
                        </label>
                      </div>
                    ) : (
                      <div className="maker-import-fields">
                        <label>
                          <span>Nama penerima / rekening</span>
                          <input value={row.recipientName} onChange={(event) => updateRow(row.id, { recipientName: event.target.value, accountId: '', operationalRuleId: '', verified: false })} title="Draft dapat dikoreksi. Teks sumber asli tetap tersimpan untuk audit; identitas rekening harus cocok dengan mapping database." disabled={saving || rowLocked} />
                        </label>
                        <label>
                          <span>Bank</span>
                          <input value={row.bank} onChange={(event) => updateRow(row.id, { bank: event.target.value, accountId: '', operationalRuleId: '', verified: false })} title="Bank pada draft dapat dikoreksi, tetapi harus cocok dengan mapping database." disabled={saving || rowLocked} />
                        </label>
                        <label>
                          <span>Nomor rekening</span>
                          <input value={row.accountNumber} onChange={(event) => updateRow(row.id, { accountNumber: event.target.value, accountId: '', operationalRuleId: '', verified: false })} title="Nomor rekening pada draft dapat dikoreksi, tetapi harus cocok dengan mapping database." disabled={saving || rowLocked} />
                        </label>
                        <label>
                          <span>Nominal (Rp)</span>
                          <input inputMode="numeric" value={formatAmount(row.amount)} onChange={(event) => {
                            const digits = event.target.value.replace(/[^0-9]/g, '')
                            const amount = digits ? Number(digits) : null
                            updateRow(row.id, { amount: amount !== null && Number.isSafeInteger(amount) ? amount : null, verified: false })
                          }} title="Nominal draft dapat dikoreksi. Nominal sumber asli tetap tersimpan untuk audit." disabled={saving || rowLocked} />
                        </label>
                        <label className="maker-import-detail-field">
                          <span>Detail / produk / periode / keperluan</span>
                          <input value={row.details} onChange={(event) => updateRow(row.id, { details: event.target.value, verified: false })} title="Detail draft dapat dikoreksi; baris sumber asli tetap disimpan untuk audit." disabled={saving || rowLocked} />
                        </label>
                      </div>
                    )}

                    {((row.kind !== 'lain_lain' || row.manualDecision === 'allow') && (validation.errors.length > 0 || validation.confirmations.length > 0)) || (duplicateRows[row.id] && disposition.status === 'import') ? (
                      <div className="maker-import-row-issues">
                        {(row.kind !== 'lain_lain' || row.manualDecision === 'allow') ? validation.errors.map((issue) => <p key={issue}><AlertTriangle aria-hidden="true" /> {issue}</p>) : null}
                        {(row.kind !== 'lain_lain' || row.manualDecision === 'allow') ? validation.confirmations.map((issue) => <p key={issue} className="is-confirm"><AlertTriangle aria-hidden="true" /> {issue}</p>) : null}
                        {duplicateRows[row.id] && disposition.status === 'import' ? <p><ShieldAlert aria-hidden="true" /> Duplikat: {duplicateRows[row.id]}</p> : null}
                      </div>
                    ) : null}

                    {manualRequired && !rowBlocked ? (
                      <label className="maker-import-verify">
                        <input
                          type="checkbox"
                          checked={row.verified}
                          onChange={(event) => updateRow(row.id, { verified: event.target.checked })}
                          disabled={saving}
                        />
                        <span>Sudah diperiksa dan diperbolehkan.</span>
                      </label>
                    ) : null}
                  </article>
                )
              })}
            </div>
            {saveError ? <div className="maker-import-message is-error"><AlertTriangle /> {saveError}</div> : null}
            <div className="maker-import-save-footer">
              <div>
                <strong>{importableChecks.length} baris masuk program</strong>
                <span>Rp {formatAmount(importableAmount)} masuk · {excludedChecks.length} dikecualikan · Rp {formatAmount(totalAmount)} total sumber</span>
              </div>
              <button type="button" className="maker-import-primary" onClick={handleSave} disabled={!canSave}>
                {checkingDuplicates ? <><LoaderCircle className="is-spinning" /> Memeriksa duplikat…</> : <><FileCheck2 aria-hidden="true" /> Lanjut ke konfirmasi</>}
              </button>
            </div>
          </section>
        </>
      ) : null}
      <ImportConfirmationDialog
        open={confirmOpen}
        title="Simpan batch Maker?"
        description={'Periksa ringkasan batch ' + (activeKitchen?.name ?? sourceKitchenName) + ' tanggal ' + transactionDate + '. Hanya baris yang masuk program akan menjadi transaksi.'}
        details={[
          { label: 'Dapur', value: activeKitchen?.name ?? sourceKitchenName },
          { label: 'Tanggal', value: transactionDate },
          { label: 'Masuk database', value: importableChecks.length + ' baris · Rp ' + formatAmount(importableAmount) },
          { label: 'Dikecualikan', value: excludedChecks.length + ' baris · Rp ' + formatAmount(excludedAmount) }
        ]}
        warning="Periksa lagi tanggal, nominal, penerima, rekening, dan detail. Setelah disimpan, transaksi masuk ke database dan riwayat."
        confirmLabel="Simpan ke database"
        cancelLabel="Periksa draft lagi"
        busy={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirmSave()}
      />
    </section>
  )
}

function operationalTypeLabel(value: MakerOperationalType): string {
  switch (value) {
    case 'relawan_salary': return 'Gaji Relawan'
    case 'pic_incentive': return 'Insentif PIC'
    case 'sppg_rent': return 'Insentif Fasilitas SPPG'
    case 'vehicle_rent': return 'Sewa Kendaraan'
    default: return 'Operasional'
  }
}
