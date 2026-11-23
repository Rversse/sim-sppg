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
  assert.ok(printSource.includes("if (mode === 'belanja')"))
  assert.ok(printSource.includes('getBelanjaPrintSummaryLabel'))
  assert.ok(printSource.includes('grid-template-columns: repeat(3, minmax(0, 1fr)) !important;'))
})

test('print report uses system typography and tabular figures for amounts', () => {
  assert.ok(printSource.includes('font-family: "Segoe UI", system-ui'))
  assert.ok(printSource.includes('font-variant-numeric: tabular-nums lining-nums'))
  assert.ok(printSource.includes('font-feature-settings: "tnum" 1, "lnum" 1'))
  assert.ok(printSource.includes('letter-spacing: 0 !important;'))
})

test('three print summary cards receive subtle top and bottom accent borders', () => {
  assert.ok(printSource.includes('border-top-width: 2px !important;'))
  assert.ok(printSource.includes('border-bottom-width: 2px !important;'))
  assert.ok(printSource.includes('nth-child(1)'))
  assert.ok(printSource.includes('nth-child(2)'))
  assert.ok(printSource.includes('nth-child(3)'))
})
