import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const printSource = await readFile(
  new URL('../src/features/report/report-print.ts', import.meta.url),
  'utf8'
)

test('overall report print iframe wraps headers and vertically centers them', () => {
  assert.match(
    printSource,
    /\.reports-overall-belanja-block \.reports-table-overall thead th\s*\{[\s\S]*?white-space: normal !important;/
  )
  assert.match(
    printSource,
    /\.reports-overall-belanja-block \.reports-table-overall thead th\s*\{[\s\S]*?vertical-align: middle !important;/
  )
  assert.match(
    printSource,
    /\.reports-overall-belanja-block \.reports-table-overall thead th\s*\{[\s\S]*?height: auto !important;/
  )
})

test('overall report print fits ten columns and keeps Dapur compact', () => {
  assert.match(
    printSource,
    /\.reports-table-overall th:nth-child\(1\),[\s\S]*?\.reports-table-overall td:nth-child\(1\) \{ width: 9% !important; \}/
  )
  assert.match(
    printSource,
    /\.reports-table-overall th:nth-child\(10\),[\s\S]*?\.reports-table-overall td:nth-child\(10\) \{ width: 12% !important; \}/
  )
  assert.ok(printSource.includes('background: #DBEAFE !important;'))
})

test('print table typography avoids extra-bold weights', () => {
  assert.ok(printSource.includes('font-family: Arial, Helvetica, sans-serif;'))
  assert.ok(printSource.includes('font-weight: 600 !important;'))
  assert.ok(printSource.includes('font-weight: 700 !important;'))
  assert.ok(!printSource.includes('font-weight: 900 !important;'))
})
