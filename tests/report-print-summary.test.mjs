import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getBelanjaPrintSummaryDescription, getBelanjaPrintSummaryLabel } from '../src/features/report/report-print-utils.ts'

const printSource = await readFile(
  new URL('../src/features/report/report-print.ts', import.meta.url),
  'utf8'
)

test('belanja print keeps the three net totals with formula labels', () => {
  assert.equal(
    getBelanjaPrintSummaryLabel('Total RAB'),
    'TOTAL RAB (PENCAIRAN - REAL)'
  )
  assert.equal(
    getBelanjaPrintSummaryLabel('Total OPS Arutala'),
    'TOTAL OPS ARUTALA (ARUTALA - REAL)'
  )
  assert.equal(
    getBelanjaPrintSummaryLabel('Total OPS Dapur'),
    'TOTAL OPS DAPUR (PENCAIRAN - REAL)'
  )
  assert.equal(getBelanjaPrintSummaryLabel('OPS - Pencairan'), null)
  assert.equal(getBelanjaPrintSummaryLabel('OPS - Arutala'), null)
})

test('belanja print shows the requested explanation under each summary amount', () => {
  assert.equal(getBelanjaPrintSummaryDescription('Total RAB'), 'Belanja Harian')
  assert.equal(getBelanjaPrintSummaryDescription('Total OPS Arutala'), 'Belanja Ops Harian')
  assert.equal(
    getBelanjaPrintSummaryDescription('Total OPS Dapur'),
    'Belanja Ops Harian ke Akuntan / Aslap / PIC Yayasan'
  )
  assert.equal(getBelanjaPrintSummaryDescription('OPS - Pencairan'), null)
  assert.ok(printSource.includes('descriptionElement.textContent = description'))
  assert.ok(printSource.includes('display: block !important;'))
})

test('print report filters summary cards only in belanja print mode', () => {
  assert.ok(printSource.includes("if (mode === 'belanja')"))
  assert.ok(printSource.includes('getBelanjaPrintSummaryLabel'))
  assert.ok(printSource.includes('grid-template-columns: repeat(3, minmax(0, 1fr)) !important;'))
})

test('print report uses readable Arial typography and tabular figures for amounts', () => {
  assert.ok(printSource.includes('font-family: Arial, Helvetica, sans-serif;'))
  assert.ok(printSource.includes('font-weight: 400;'))
  assert.ok(printSource.includes('font-variant-numeric: tabular-nums lining-nums'))
  assert.ok(printSource.includes('font-feature-settings: "tnum" 1, "lnum" 1'))
  assert.ok(printSource.includes('letter-spacing: 0 !important;'))
  assert.ok(!printSource.includes('font-weight: 900 !important;'))
})

test('print summary cards use a consistent black border', () => {
  assert.ok(printSource.includes('border: 1.5px solid #000000 !important;'))
  assert.ok(!printSource.includes('border-top-color: #93C5FD'))
  assert.ok(!printSource.includes('border-top-color: #60A5FA'))
  assert.ok(!printSource.includes('border-top-color: #2563EB'))
  assert.ok(!printSource.includes('border-left: 5px solid #0f766e'))
})
