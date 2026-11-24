const BELANJA_PRINT_SUMMARY_LABELS: Record<string, string> = {
  'TOTAL RAB': 'TOTAL RAB (PENCAIRAN - REAL)',
  'TOTAL OPS ARUTALA': 'TOTAL OPS ARUTALA (ARUTALA - REAL)',
  'TOTAL OPS DAPUR': 'TOTAL OPS DAPUR (PENCAIRAN - REAL)'
}

export function getBelanjaPrintSummaryLabel(label: string): string | null {
  const normalized = label.trim().replace(/\s+/g, ' ').toUpperCase()
  return BELANJA_PRINT_SUMMARY_LABELS[normalized] ?? null
}

const BELANJA_PRINT_SUMMARY_DESCRIPTIONS: Record<string, string> = {
  'TOTAL RAB': 'Belanja Harian',
  'TOTAL OPS ARUTALA': 'Belanja Ops Harian',
  'TOTAL OPS DAPUR': 'Belanja Ops Harian ke Akuntan / Aslap / PIC Yayasan'
}

export function getBelanjaPrintSummaryDescription(label: string): string | null {
  const normalized = label.trim().replace(/\s+/g, ' ').toUpperCase()
  return BELANJA_PRINT_SUMMARY_DESCRIPTIONS[normalized] ?? null
}
