const BELANJA_PRINT_SUMMARY_LABELS: Record<string, string> = {
  'TOTAL RAB': 'TOTAL RAB (PENCAIRAN - REAL)',
  'OPS / PENCAIRAN': 'OPS / PENCAIRAN',
  'SISA OPS': 'SISA OPS (ARUTALA - REAL)'
}

export function getBelanjaPrintSummaryLabel(label: string): string | null {
  const normalized = label.trim().replace(/\s+/g, ' ').toUpperCase()
  return BELANJA_PRINT_SUMMARY_LABELS[normalized] ?? null
}
