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

test('overall report print keeps the two OPS columns narrower', () => {
  assert.match(
    printSource,
    /\.reports-table-overall th:nth-child\(5\),[\s\S]*?\.reports-table-overall td:nth-child\(6\)\s*\{\s*width: 9\.5% !important;/
  )
  assert.doesNotMatch(
    printSource,
    /\.reports-table-overall th:not\(:first-child\)[\s\S]*?width: 11\.714%;/
  )
})
