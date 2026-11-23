import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getBelanjaPrintSummaryLabel } from '../src/features/report/report-print-utils.ts'

const printSource = await readFile(
  new URL('../src/features/report/report-print.ts', import.meta.url),
  'utf8'
)

test('belanja print keeps only the three requested summary cards with formula labels', () => {
  assert.equal(
    getBelanjaPrintSummaryLabel('Total RAB'),
    'TOTAL RAB (PENCAIRAN - REAL)'
  )
  assert.equal(
    getBelanjaPrintSummaryLabel('OPS / Pencairan'),
    'OPS / PENCAIRAN'
  )
  assert.equal(
    getBelanjaPrintSummaryLabel('Sisa OPS'),
    'SISA OPS (ARUTALA - REAL)'
  )
  assert.equal(getBelanjaPrintSummaryLabel('OPS / Arutala'), null)
  assert.equal(getBelanjaPrintSummaryLabel('OPS / Real'), null)
})

test('print report filters summary cards only in belanja print mode', () => {
  assert.match(printSource, /if \(mode === 'belanja'\) \{[\\s\\S]*?getBelanjaPrintSummaryLabel/)
  assert.match(
    printSource,
    /\.reports-summary-grid\.reports-summary-belanja\s*\{[\\s\\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important;/
  )
})

test('print report uses system typography and tabular figures for amounts', () => {
  assert.match(printSource, /font-family: "Segoe UI", system-ui/)
  assert.match(printSource, /font-variant-numeric: tabular-nums lining-nums/)
  assert.match(printSource, /font-feature-settings: "tnum" 1, "lnum" 1/)
  assert.match(printSource, /letter-spacing: 0 !important;/)
})

test('three print summary cards receive subtle top and bottom accent borders', () => {
  assert.match(printSource, /border-top-width: 2px !important;/)
  assert.match(printSource, /border-bottom-width: 2px !important;/)
  assert.match(printSource, /nth-child\(1\)[\\s\\S]*?border-top-color:/)
  assert.match(printSource, /nth-child\(2\)[\\s\\S]*?border-top-color:/)
  assert.match(printSource, /nth-child\(3\)[\\s\\S]*?border-top-color:/)
})
