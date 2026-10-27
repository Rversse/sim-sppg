export type RealImportSource = 'cianjur' | 'cidaun'

export type RealImportDraftRow = {
  rowNumber: number
  sourceLineNumber: number
  rawLine: string
  kitchenName: string
  amount: number
}

export type RealImportParseResult = {
  error: string | null
  transactionDate: string | null
  rows: RealImportDraftRow[]
  sourceTotal: number | null
  warnings: string[]
}

const realImportMoneyFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0
})

export function formatRealImportAmount(value: number | null | undefined): string {
  return value == null ? '' : realImportMoneyFormatter.format(value)
}

const KITCHEN_ALIASES: Array<{ alias: string; kitchen: string }> = [
  { alias: 'Sukaraharja', kitchen: 'Sukaraharja' },
  { alias: 'Sukaraja', kitchen: 'Sukaraja' },
  { alias: 'Warungbitung', kitchen: 'Warungbitung' },
  { alias: 'Warbit', kitchen: 'Warungbitung' },
  { alias: 'Cibaregbeg', kitchen: 'Cibaregbeg' },
  { alias: 'Bunder', kitchen: 'Cibaregbeg' },
  { alias: 'Campakamulya', kitchen: 'Campakamulya' },
  { alias: 'Camul', kitchen: 'Campakamulya' },
  { alias: 'Cihaur', kitchen: 'Cihaur' },
  { alias: 'Ereng', kitchen: 'Cihaur' },
  { alias: 'Cikondang', kitchen: 'Cikondang' },
  { alias: 'Cisepat', kitchen: 'Cisepat' },
  { alias: 'Kertajadi', kitchen: 'Kertajadi' },
  { alias: 'Kertajdi', kitchen: 'Kertajadi' },
  { alias: 'Cipetir', kitchen: 'Cipetir' },
  { alias: 'Mayak', kitchen: 'Cipetir' },
  { alias: 'Sukamaju', kitchen: 'Cimanggu' },
  { alias: 'Cimanggu', kitchen: 'Cimanggu' }
].sort((a, b) => b.alias.length - a.alias.length)

const INDONESIAN_MONTHS: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12
}

function toIsoDate(day: number, month: number, year: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-')
}

function parseCianjurDate(sourceText: string): string | null {
  const match = sourceText.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (!match) return null
  return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

function parseCidaunDate(sourceText: string): string | null {
  const textDate = sourceText.match(
    /\b(?:kaping\s+)?(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})\b/i
  )
  if (textDate) {
    const month = INDONESIAN_MONTHS[textDate[2].toLowerCase()]
    return month ? toIsoDate(Number(textDate[1]), month, Number(textDate[3])) : null
  }

  // Cidaun also sends a compact header such as "Belanja Hari Selasa Cidaun 27/10/2026".
  const numericDate = sourceText.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (!numericDate) return null
  return toIsoDate(Number(numericDate[1]), Number(numericDate[2]), Number(numericDate[3]))
}

export function parseRealImportAmount(raw: string): number | null {
  const value = raw.trim().replace(/^Rp\s*/i, '')
  if (!value || !/^(?:\d+|\d{1,3}(?:(?:\.\s*|\s+)\d{3})+)$/.test(value)) return null

  const amount = Number(value.replace(/[.\s]/g, ''))
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

export function normalizeRealImportKitchen(raw: string): string | null {
  const value = raw.trim().toLocaleLowerCase('id-ID')
  return KITCHEN_ALIASES.find((item) => item.alias.toLocaleLowerCase('id-ID') === value)?.kitchen ?? null
}

function matchKitchenAtStart(line: string): { kitchen: string; rest: string; alias: string } | null {
  const trimmed = line.trim()
  for (const item of KITCHEN_ALIASES) {
    if (trimmed.length < item.alias.length) continue
    const start = trimmed.slice(0, item.alias.length)
    if (start.toLocaleLowerCase('id-ID') !== item.alias.toLocaleLowerCase('id-ID')) continue
    const boundary = trimmed[item.alias.length]
    if (boundary && !/[\s:]/.test(boundary)) continue

    return {
      kitchen: item.kitchen,
      alias: item.alias,
      rest: trimmed.slice(item.alias.length).trim().replace(/^[:\-–]+\s*/, '')
    }
  }
  return null
}

function extractAmounts(text: string): number[] {
  const tokens = text.match(/(?:Rp\s*)?\d+(?:[.\s]+\d+)*/gi) ?? []
  const result: number[] = []
  for (const token of tokens) {
    const amount = parseRealImportAmount(token)
    if (amount !== null) result.push(amount)
  }
  return result
}

// Cianjur's alternate report uses commas as thousand separators (e.g. 20,940,500).
// Keep this handling source-specific so the Cidaun parser's rules stay unchanged.
function extractCianjurAmounts(text: string): number[] {
  const tokens = text.match(/(?:Rp\s*)?\d[\d,.]*(?:\s+\d[\d,.]*)*/gi) ?? []
  const result: number[] = []
  for (const token of tokens) {
    const value = token.trim().replace(/^Rp\s*/i, '')
    const amount = /^\d{1,3}(?:,\d{3})+$/.test(value)
      ? parseRealImportAmount(value.replace(/,/g, ''))
      : parseRealImportAmount(value)
    if (amount !== null) result.push(amount)
  }
  return result
}

export function parseRealImportDocument(
  sourceType: RealImportSource,
  sourceText: string
): RealImportParseResult {
  const text = sourceText.replace(/\r\n?/g, '\n').trim()
  if (!text) {
    return { error: 'Tempel laporan Cianjur atau Cidaun terlebih dahulu.', transactionDate: null, rows: [], sourceTotal: null, warnings: [] }
  }

  const transactionDate = sourceType === 'cianjur'
    ? parseCianjurDate(text)
    : parseCidaunDate(text)

  if (!transactionDate) {
    return {
      error: sourceType === 'cianjur'
        ? 'Tanggal Cianjur tidak ditemukan. Format yang diharapkan DD/MM/YYYY, misalnya 12/10/2026.'
        : 'Tanggal Cidaun tidak ditemukan. Gunakan tanggal teks Bahasa Indonesia, misalnya 12 oktober 2026.',
      transactionDate: null,
      rows: [],
      sourceTotal: null,
      warnings: []
    }
  }

  const lines = text.split('\n')
  const draftRows: Array<Omit<RealImportDraftRow, 'rowNumber'>> = []
  const warnings: string[] = []
  let sourceTotal: number | null = null

  if (sourceType === 'cianjur') {
    lines.forEach((rawLine, index) => {
      const line = rawLine.trim()
      if (!line || /^belan(?:j|aj)a\s+harian\b/i.test(line)) return

      const kitchenMatch = matchKitchenAtStart(line)
      if (kitchenMatch) {
        const amounts = extractCianjurAmounts(kitchenMatch.rest)
        if (amounts.length === 0) {
          warnings.push('Baris ' + (index + 1) + ': nominal tidak terbaca — ' + line)
          return
        }
        for (const amount of amounts) {
          draftRows.push({
            sourceLineNumber: index + 1,
            rawLine,
            kitchenName: kitchenMatch.kitchen,
            amount
          })
        }
        return
      }

      if (extractCianjurAmounts(line).length > 0 && !/^total\b/i.test(line)) {
        warnings.push('Baris ' + (index + 1) + ': nama dapur tidak dikenali — ' + line)
      }
    })
  } else {
    let currentKitchen: string | null = null
    let currentKitchenLine = 0
    let currentKitchenRaw = ''
    let currentKitchenHasAmount = false

    lines.forEach((rawLine, index) => {
      const line = rawLine.trim()
      if (!line) return

      const totalMatch = line.match(/\btotal\s*:?\s*((?:Rp\s*)?\d+(?:[.\s]+\d+)*)/i)
      const standaloneRpTotal = line.match(/^\s*Rp\s*((?:\d{1,3}(?:[.\s]+\d{3})+|\d+))\s*$/i)
      if (totalMatch || standaloneRpTotal) {
        sourceTotal = parseRealImportAmount((totalMatch ?? standaloneRpTotal)![1])
        return
      }

      const numbered = line.replace(/^\s*\d+\s*[.)]\s*/, '').trim()
      const kitchenMatch = matchKitchenAtStart(numbered)
      if (kitchenMatch) {
        currentKitchen = kitchenMatch.kitchen
        currentKitchenLine = index + 1
        currentKitchenRaw = rawLine
        currentKitchenHasAmount = false

        const colon = line.lastIndexOf(':')
        const afterColon = colon >= 0 ? line.slice(colon + 1) : ''
        const amountOnlyRemainder = /^(?:Rp\s*)?\d{1,3}(?:\.\s*\d{3})+(?:\s*\+\s*(?:Rp\s*)?\d{1,3}(?:\.\s*\d{3})+)*$/i.test(kitchenMatch.rest)
        const sameLineAmounts = colon >= 0
          ? extractAmounts(afterColon)
          : amountOnlyRemainder
            ? extractAmounts(kitchenMatch.rest)
            : []
        if (sameLineAmounts.length > 0) {
          for (const amount of sameLineAmounts) {
            draftRows.push({
              sourceLineNumber: currentKitchenLine,
              rawLine,
              kitchenName: currentKitchen,
              amount
            })
          }
          currentKitchenHasAmount = true
        }
        return
      }

      if (currentKitchen && !currentKitchenHasAmount && !/^total\b/i.test(line)) {
        const colon = line.indexOf(':')
        const amountText = colon >= 0 ? line.slice(colon + 1) : ''
        const amounts = extractAmounts(amountText)
        if (amounts.length > 0) {
          for (const amount of amounts) {
            draftRows.push({
              sourceLineNumber: currentKitchenLine,
              rawLine: currentKitchenRaw + '\n' + rawLine,
              kitchenName: currentKitchen,
              amount
            })
          }
          currentKitchenHasAmount = true
          return
        }
      }

      if (/^\s*\d+\s*[.)]\s*/.test(line) && !normalizeRealImportKitchen(numbered)) {
        warnings.push('Baris ' + (index + 1) + ': nama dapur tidak dikenali — ' + line)
      }
    })

    if (sourceTotal === null) {
      warnings.push('Total sumber Cidaun tidak ditemukan; periksa ulang total sebelum menyimpan.')
    }
  }

  if (draftRows.length === 0) {
    return {
      error: 'Tidak ada transaksi yang berhasil dibaca. Periksa format nama dapur dan nominal.',
      transactionDate,
      rows: [],
      sourceTotal,
      warnings
    }
  }

  return {
    error: null,
    transactionDate,
    rows: draftRows.map((row, index) => ({ ...row, rowNumber: index + 1 })),
    sourceTotal,
    warnings
  }
}
