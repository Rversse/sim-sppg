import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeRealImportKitchen,
  parseRealImportAmount,
  parseRealImportDocument
} from '../src/features/real-import/real-import-utils.ts'

test('RAB Real parser reads Cianjur numeric date and kitchen aliases', () => {
  const source = [
    'Belanja Harian Senin 12/10/2026',
    '',
    'Sukaraja       9.171.000',
    'Ereng          21.406.500',
    'Warbit         19.563.500',
    'Bunder         20.103.000',
    'Cipetir        14.374.500',
    'Cimanggu       17.646.500',
    'Camul          14.908.250',
    'Cikondang      12.145.300',
    'Cisepat        15.574.500',
    'Kertajadi      11.168.500',
    'Sukaraharja 480.000 + 583.000'
  ].join('\n')

  const parsed = parseRealImportDocument('cianjur', source)
  assert.equal(parsed.error, null)
  assert.equal(parsed.transactionDate, '2026-10-12')
  assert.equal(parsed.rows.length, 12)
  assert.equal(parsed.rows[1].kitchenName, 'Cihaur')
  assert.equal(parsed.rows[3].kitchenName, 'Cibaregbeg')
  assert.equal(parsed.rows[6].kitchenName, 'Campakamulya')
  assert.deepEqual(parsed.rows.slice(-2).map((row) => row.amount), [480000, 583000])
  assert.deepEqual(parsed.rows.slice(-2).map((row) => row.kitchenName), ['Sukaraharja', 'Sukaraharja'])
})

test('Cianjur parser ignores daily expense title even with common typo', () => {
  const parsed = parseRealImportDocument('cianjur', [
    'Belanaja Harian Rabu 14/10/2026',
    '',
    'Ereng           18.836.000',
    'Warbit          23.247.500',
    'Bunder          26.037.500',
    'Cipetir         17.256.500',
    'Cimanggu        16.678.000',
    'Camul           11.240.000',
    'Cikondang       11.528.300',
    'Sukaraharja      3.960.000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.transactionDate, '2026-10-14')
  assert.equal(parsed.rows.length, 8)
  assert.equal(parsed.warnings.length, 0)
  assert.deepEqual(parsed.rows.map((row) => row.kitchenName), [
    'Cihaur', 'Warungbitung', 'Cibaregbeg', 'Cipetir',
    'Cimanggu', 'Campakamulya', 'Cikondang', 'Sukaraharja'
  ])
})

test('RAB Real parser reads Cidaun Indonesian long month and source total', () => {
  const source = [
    "Assalamu'alaikum pak Haji punten tagihan dinten minggu kangge dinten senin kaping 12 oktober  2026",
    '',
    '1. Cisepat',
    '- basahan b3 + sekolah :12.784.000',
    '2. Kertajadi',
    '- basahan b3 + sekolah: 15.475.000',
    '',
    '*Total : 28.259.000*'
  ].join('\n')

  const parsed = parseRealImportDocument('cidaun', source)
  assert.equal(parsed.error, null)
  assert.equal(parsed.transactionDate, '2026-10-12')
  assert.deepEqual(parsed.rows.map((row) => [row.kitchenName, row.amount]), [
    ['Cisepat', 12784000],
    ['Kertajadi', 15475000]
  ])
  assert.equal(parsed.sourceTotal, 28259000)
  assert.equal(parsed.rows.reduce((sum, row) => sum + row.amount, 0), parsed.sourceTotal)
})

test('Cidaun parser reads total with mixed dot and space thousand separators', () => {
  const parsed = parseRealImportDocument('cidaun', [
    'Punten kaping 14 oktober 2026',
    '1. Cisepat',
    '- basahan b3 + sekolah :9.511.000',
    '2. Kertajadi',
    '- basahan b3 + sekolah: 16.510.000',
    '*Total : 26.021 000*'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.transactionDate, '2026-10-14')
  assert.deepEqual(parsed.rows.map((row) => row.amount), [9511000, 16510000])
  assert.equal(parsed.sourceTotal, 26021000)
  assert.equal(parsed.rows.reduce((sum, row) => sum + row.amount, 0), parsed.sourceTotal)
})

test('RAB Real parser rejects malformed amounts and maps alias names predictably', () => {
  assert.equal(parseRealImportAmount('15.475.000'), 15475000)
  assert.equal(parseRealImportAmount('15.47.000'), null)
  assert.equal(normalizeRealImportKitchen('Ereng'), 'Cihaur')
  assert.equal(normalizeRealImportKitchen('Warbit'), 'Warungbitung')
  assert.equal(normalizeRealImportKitchen('Bunder'), 'Cibaregbeg')
  assert.equal(normalizeRealImportKitchen('Camul'), 'Campakamulya')
})

test('Cidaun parser supports kitchen and amount on the same line without mistaking B3 for money', () => {
  const parsed = parseRealImportDocument('cidaun', [
    'Punten kaping 12 oktober 2026',
    '1. Cisepat - basahan b3 + sekolah: 12.784.000',
    '*Total: 12.784.000*'
  ].join(String.fromCharCode(10)))
  assert.equal(parsed.error, null)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].kitchenName, 'Cisepat')
  assert.equal(parsed.rows[0].amount, 12784000)
})
