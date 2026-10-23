export type MakerImportKind =
  | 'rab'
  | 'gas'
  | 'ops_harian'
  | 'real_ops'
  | 'sppg_rent'
  | 'relawan_salary'
  | 'pic_school'
  | 'pic_posyandu'
  | 'combined_pic_incentive'
  | 'combined_payroll'
  | 'vehicle_rent'
  | 'lain_lain'

export type MakerManualFlow =
  | ''
  | 'real_ops'
  | 'ops_disbursement'
  | 'income'
  | 'gas'
  | 'neutral_lain_lain'
  | 'operational_disbursement'

export type MakerOperationalType =
  | ''
  | 'relawan_salary'
  | 'pic_incentive'
  | 'vehicle_rent'
  | 'sppg_rent'

export type MakerImportDraftRow = {
  id: string
  lineNumber: number
  rawLine: string
  kind: MakerImportKind
  sourceCategory: string
  recipientName: string
  bank: string
  accountNumber: string
  amount: number | null
  details: string
  manualFlow: MakerManualFlow
  operationalType: MakerOperationalType
  accountId: string
  operationalRuleId: string
  manualDecision: 'pending' | 'allow' | 'block'
  verified: boolean
}

export type ParsedMakerDocument = {
  kitchenName: string
  transactionDate: string
  rows: MakerImportDraftRow[]
  error: string | null
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  mei: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  agu: '08',
  sep: '09',
  oct: '10',
  okt: '10',
  nov: '11',
  dec: '12',
  des: '12'
}

export function normalizeMakerText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

export function normalizeMakerBank(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

export function matchesMakerAccountRecipient(
  recipientName: string | null | undefined,
  mapping: {
    accountName: string | null | undefined
    businessName: string | null | undefined
    ownerName: string | null | undefined
  }
): boolean {
  const target = normalizeMakerText(recipientName)
  if (!target) return false

  const accountName = mapping.accountName?.trim() ?? ''
  const businessName = mapping.businessName?.trim() || accountName
  const ownerName = mapping.ownerName?.trim() ?? ''
  const candidates = [
    accountName,
    businessName,
    ownerName,
    businessName && ownerName ? businessName + ' (' + ownerName + ')' : '',
    accountName && ownerName ? accountName + ' (' + ownerName + ')' : ''
  ]

  return candidates.some((name) => Boolean(name) && normalizeMakerText(name) === target)
}

function formatMakerProductList(value: string): string {
  const source = value.trim()
  if (!source) return ''

  const parts = source
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (parts.length > 1) {
    parts[parts.length - 1] = parts[parts.length - 1].replace(/^dan\s+/i, '').trim()
    if (parts.length === 2) return parts[0] + ' dan ' + parts[1]
    return parts.slice(0, -1).join(', ') + ', dan ' + parts[parts.length - 1]
  }

  const naturalPair = source.match(/^(.+?)\s+dan\s+(.+)$/i)
  return naturalPair ? naturalPair[1].trim() + ' dan ' + naturalPair[2].trim() : source
}

export function matchesMakerOperationalAccount(
  recipientName: string | null | undefined,
  bank: string | null | undefined,
  accountNumber: string | null | undefined,
  mapping: {
    ownerName: string | null | undefined
    bank: string | null | undefined
    accountNumber: string | null | undefined
  }
): boolean {
  const inputAccountNumber = normalizeMakerAccountNumber(accountNumber)
  const mappedAccountNumber = normalizeMakerAccountNumber(mapping.accountNumber)
  const maskedSuffix = inputAccountNumber.match(/^x{3,}(\d{4})$/i)?.[1]
  const accountNumberMatches = maskedSuffix
    ? mappedAccountNumber.endsWith(maskedSuffix)
    : inputAccountNumber === mappedAccountNumber

  return (
    normalizeMakerText(recipientName) === normalizeMakerText(mapping.ownerName) &&
    normalizeMakerBank(bank) === normalizeMakerBank(mapping.bank) &&
    accountNumberMatches
  )
}

export type MakerNeutralAccountCandidate = {
  id: string
  name: string
  bank: string
  accountNumber: string | null
  aliases?: Array<string | null | undefined>
}

/**
 * Detect the selected kitchen's canonical Koperasi Arutala BNI account for a
 * Lain-lain row. The account may be mapped under income/RAB or neutral/GAS, but
 * the resulting transaction is stored as neutral/LAIN_LAIN. Matching never depends
 * on the kitchen name; ambiguous matches are rejected.
 */
export function findMappedNeutralAccountForLainLain(
  row: MakerImportDraftRow,
  candidates: MakerNeutralAccountCandidate[]
): MakerNeutralAccountCandidate | null {
  if (
    row.kind !== 'lain_lain' ||
    !row.recipientName.trim() ||
    !row.bank.trim() ||
    !row.accountNumber.trim()
  ) {
    return null
  }

  const inputAccountNumber = normalizeMakerAccountNumber(row.accountNumber)
  const maskedSuffix = inputAccountNumber.match(/^x{3,}(\d{4})$/i)?.[1]
  const inputRecipient = normalizeMakerText(row.recipientName)
  const matches = candidates.filter((account) => {
    const mappedAccountNumber = normalizeMakerAccountNumber(account.accountNumber)
    const accountNumberMatches = maskedSuffix
      ? mappedAccountNumber.endsWith(maskedSuffix)
      : mappedAccountNumber === inputAccountNumber
    const accountName = normalizeMakerText(account.name)
    const recipientMatches = accountName === inputRecipient
    const isAllowedArutalaAccount =
      normalizeMakerBank(account.bank) === 'BNI' &&
      accountName === 'koperasi arutala'

    return (
      isAllowedArutalaAccount &&
      recipientMatches &&
      normalizeMakerBank(account.bank) === normalizeMakerBank(row.bank) &&
      accountNumberMatches
    )
  })

  return matches.length === 1 ? matches[0] : null
}

export function normalizeMakerAccountNumber(
  value: string | null | undefined
): string {
  return (value ?? '').replace(/\s+/g, '').trim()
}

export function parseMakerDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (!match) return null

  const month = MONTHS[match[2].toLowerCase()]
  if (!month) return null

  const day = match[1].padStart(2, '0')
  const date = match[3] + '-' + month + '-' + day
  const parsed = new Date(date + 'T00:00:00Z')

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(match[3]) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null
  }

  return date
}

export function parseMakerAmount(value: string): number | null {
  // Maker emits integer IDR values, optionally grouped with Indonesian dots.
  // Do not silently turn decimals or malformed separators into another amount.
  const normalized = value.trim().replace(/^rp\s*/i, '').replace(/\s+/g, '')
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(normalized)) return null

  const amount = Number(normalized.replace(/\./g, ''))
  if (!Number.isSafeInteger(amount) || amount <= 0) return null
  return amount
}

function parseAccountLine(value: string): {
  recipientName: string
  bank: string
  accountNumber: string
  details: string
} | null {
  const match = value.trim().match(
    /^(.*?)\s+-\s+([A-Za-z][A-Za-z0-9 ]*?)\s*\/\s*((?:x{3,}\s+\d{4})|[^\s·]+)(?:\s*·\s*(.*))?$/i
  )

  if (!match) return null

  return {
    recipientName: match[1].trim(),
    bank: normalizeMakerBank(match[2]),
    accountNumber: normalizeMakerAccountNumber(match[3]),
    details: (match[4] ?? '').trim()
  }
}

function makeRow(
  line: string,
  lineNumber: number,
  label: string,
  body: string,
  amountText: string
): MakerImportDraftRow {
  const amount = parseMakerAmount(amountText)
  const id = 'line-' + lineNumber
  const unrecognized = {
    id,
    lineNumber,
    rawLine: line,
    kind: 'lain_lain' as const,
    sourceCategory: label || 'Lain-lain',
    recipientName: '',
    bank: '',
    accountNumber: '',
    amount,
    details: body.trim() || line,
    manualFlow: 'ops_disbursement' as const,
    operationalType: '' as const,
    accountId: '',
    operationalRuleId: '',
    manualDecision: 'pending' as const,
    verified: false
  }

  if (normalizeMakerText(label) === 'lain-lain' || !label) {
    const accountMatch = body.trim().match(
      /^(.*?)\s+-\s+([A-Za-z][A-Za-z0-9 ]*?)\s*\/\s*((?:x{3,}\s+\d{4})|[^\s·]+)$/i
    )
    if (!accountMatch) return unrecognized

    const descriptionAndOwner = accountMatch[1].trim()
    const splitAt = descriptionAndOwner.lastIndexOf(' - ')
    if (splitAt < 0) return unrecognized

    return {
      ...unrecognized,
      sourceCategory: 'Lain-lain',
      recipientName: descriptionAndOwner.slice(splitAt + 3).trim(),
      bank: normalizeMakerBank(accountMatch[2]),
      accountNumber: normalizeMakerAccountNumber(accountMatch[3]),
      details: descriptionAndOwner.slice(0, splitAt).trim()
    }
  }

  const vehicleMatch = label.match(
    /^Sewa Kendaraan\s+(Mobil|Motor)\s*\((.*?)\)$/i
  )
  const normalizedLabel = normalizeMakerText(label)
  const isSppgRentLabel = ['sewa sppg', 'insentif fasilitas sppg'].includes(normalizedLabel)
  const isCombinedPayroll =
    normalizedLabel.includes('gaji relawan') && normalizedLabel.includes('insentif pic')
  const isCombinedPicIncentive =
    !normalizedLabel.includes('gaji relawan') &&
    normalizedLabel.includes('insentif pic sekolah') &&
    normalizedLabel.includes('insentif pic posyandu')
  const kind: MakerImportKind =
    isCombinedPayroll
      ? 'combined_payroll'
      : isCombinedPicIncentive
        ? 'combined_pic_incentive'
        : normalizedLabel === 'ops real'
          ? 'real_ops'
          : normalizedLabel === 'rab'
        ? 'rab'
        : normalizedLabel === 'gas'
          ? 'gas'
          : normalizedLabel === 'ops harian'
            ? 'ops_harian'
            : isSppgRentLabel
              ? 'sppg_rent'
              : normalizedLabel === 'gaji relawan'
                ? 'relawan_salary'
                : normalizedLabel === 'insentif pic sekolah'
                  ? 'pic_school'
                  : normalizedLabel === 'insentif pic posyandu'
                    ? 'pic_posyandu'
                    : vehicleMatch
                      ? 'vehicle_rent'
                      : 'lain_lain'

  if (kind === 'real_ops') {
    return {
      ...unrecognized,
      kind: 'real_ops',
      sourceCategory: 'OPS Real',
      recipientName: '',
      bank: '',
      accountNumber: '',
      details: 'OPS Real',
      manualFlow: 'real_ops',
      operationalType: '',
      accountId: '',
      operationalRuleId: '',
      manualDecision: 'pending',
      verified: false
    }
  }

  const parsed = parseAccountLine(body)
  if (!parsed) {
    return {
      ...unrecognized,
      sourceCategory: kind === 'lain_lain' ? 'Lain-lain' : kind === 'sppg_rent' ? 'Insentif Fasilitas SPPG' : label,
      details: kind === 'gas'
        ? 'Gas'
        : kind === 'ops_harian'
          ? 'Ops Harian'
          : body.trim() || line
    }
  }

  // Maker emits GAS descriptions as "Recipient / Gas 12kg (3 tabung)".
  // Split that note back out so the mapped recipient remains the account name,
  // while the cylinder type/count is kept in the transaction note.
  const gasRecipientParts = kind === 'gas'
    ? parsed.recipientName.split(/\s\/\s/)
    : []
  const hasEmbeddedGasDetails = kind === 'gas' && gasRecipientParts.length > 1
  const recipientName = hasEmbeddedGasDetails
    ? gasRecipientParts.shift()!.trim()
    : parsed.recipientName
  const gasDetails = hasEmbeddedGasDetails
    ? gasRecipientParts.join(' / ').trim() || 'Gas'
    : 'Gas'

  const details =
    kind === 'vehicle_rent'
      ? 'Jenis kendaraan: ' + (vehicleMatch?.[1] ?? '—') + ' · Periode sewa: ' + (vehicleMatch?.[2] ?? '')
      : kind === 'gas'
        ? gasDetails
        : kind === 'ops_harian'
          ? parsed.details || 'Ops Harian'
          : kind === 'rab'
            ? formatMakerProductList(parsed.details)
            : parsed.details

  return {
    ...unrecognized,
    kind,
    sourceCategory: kind === 'lain_lain' ? 'Lain-lain' : kind === 'sppg_rent' ? 'Insentif Fasilitas SPPG' : label,
    recipientName,
    bank: parsed.bank,
    accountNumber: parsed.accountNumber,
    details,
    manualFlow: defaultManualFlow(kind),
    operationalType: defaultOperationalType(kind)
  }
}

export function defaultManualFlow(kind: MakerImportKind): MakerManualFlow {
  if (kind === 'real_ops') return 'real_ops'
  if (kind === 'lain_lain') return 'ops_disbursement'
  if (kind === 'rab') return 'income'
  if (kind === 'gas') return 'gas'
  if (kind === 'ops_harian') return 'ops_disbursement'
  if (
    kind === 'sppg_rent' ||
    kind === 'relawan_salary' ||
    kind === 'pic_school' ||
    kind === 'pic_posyandu' ||
    kind === 'combined_pic_incentive' ||
    kind === 'vehicle_rent'
  ) {
    return 'operational_disbursement'
  }
  return ''
}

export function defaultOperationalType(
  kind: MakerImportKind
): MakerOperationalType {
  if (kind === 'sppg_rent') return 'sppg_rent'
  if (kind === 'relawan_salary') return 'relawan_salary'
  if (
    kind === 'pic_school' ||
    kind === 'pic_posyandu' ||
    kind === 'combined_pic_incentive'
  ) {
    return 'pic_incentive'
  }
  if (kind === 'vehicle_rent') return 'vehicle_rent'
  return ''
}

export function operationalRuleTypeForKind(
  kind: MakerImportKind,
  operationalType: MakerOperationalType
): string | null {
  switch (kind) {
    case 'ops_harian':
      return 'ops_harian'
    case 'sppg_rent':
      return 'sppg_rent'
    case 'relawan_salary':
      return 'gaji_relawan'
    case 'pic_school':
      return 'pic_incentive_school'
    case 'pic_posyandu':
      return 'pic_incentive_posyandu'
    case 'combined_pic_incentive':
      return 'pic_incentive_school'
    case 'vehicle_rent':
      return 'vehicle_rent'
    case 'lain_lain':
      if (operationalType === 'relawan_salary') return 'gaji_relawan'
      if (operationalType === 'pic_incentive') return 'pic_incentive_school'
      if (operationalType === 'sppg_rent') return 'sppg_rent'
      if (operationalType === 'vehicle_rent') return 'vehicle_rent'
      return null
    case 'rab':
    case 'gas':
    case 'real_ops':
    case 'combined_payroll':
      return null
  }
}

export function parseMakerDocument(text: string): ParsedMakerDocument {
  // Normalize exactly the outer whitespace and line endings used by the server hash.
  // Keep internal blank lines so each row retains its physical source line number.
  const normalizedText = text.replace(/\r\n?/g, '\n').trim()
  const allLines = normalizedText.split('\n')
  if (allLines.length < 2 || allLines.slice(1).every((line) => !line.trim())) {
    return {
      kitchenName: '',
      transactionDate: '',
      rows: [],
      error: 'Tempel header dapur/tanggal dan minimal satu baris transaksi.'
    }
  }

  const header = allLines[0].trim().match(/^(.+?),\s*(\d{1,2}-[A-Za-z]{3}-\d{4})$/)
  if (!header) {
    return {
      kitchenName: '',
      transactionDate: '',
      rows: [],
      error: 'Header tidak dikenali. Format yang diharapkan: Cisepat, 05-Okt-2026.'
    }
  }

  const transactionDate = parseMakerDate(header[2])
  if (!transactionDate) {
    return {
      kitchenName: header[1].trim(),
      transactionDate: '',
      rows: [],
      error: 'Tanggal pada header tidak valid.'
    }
  }

  const rows = allLines.slice(1).map((rawLine, index) => ({
    line: rawLine.trim(),
    lineNumber: index + 2
  })).filter((entry) => entry.line.length > 0).map(({ line, lineNumber }) => {
    const amountDivider = line.lastIndexOf('·')
    if (amountDivider < 0) {
      return makeRow(line, lineNumber, 'Lain-lain', line, '')
    }

    const beforeAmount = line.slice(0, amountDivider).trim()
    const amountText = line.slice(amountDivider + 1).trim()
    if (/^_OPS Real_$/i.test(beforeAmount)) {
      return makeRow(line, lineNumber, 'OPS Real', '', amountText)
    }
    const colonAt = beforeAmount.indexOf(':')
    if (colonAt < 0) {
      return makeRow(line, lineNumber, 'Lain-lain', beforeAmount, amountText)
    }

    const label = beforeAmount.slice(0, colonAt).trim()
    const body = beforeAmount.slice(colonAt + 1).trim()
    return makeRow(line, lineNumber, label, body, amountText)
  })

  return {
    kitchenName: header[1].trim(),
    transactionDate,
    rows,
    error: null
  }
}
