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

test('Cianjur parser reads comma-separated thousands and additional kitchen aliases', () => {
  const parsed = parseRealImportDocument('cianjur', [
    "Belanja Harian Jum'at 16/10/2026",
    '',
    'cihaur        20,940,500',
    'bunder        23,835,000',
    'warbit        19,115,000',
    'mayak         13,692,000',
    'sukamaju      13,766,000',
    'camul         10,648,000',
    'cikondang      8,552,500',
    '',
    'sukaraharja    7,493,000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.transactionDate, '2026-10-16')
  assert.equal(parsed.rows.length, 8)
  assert.deepEqual(parsed.rows.map((row) => [row.kitchenName, row.amount]), [
    ['Cihaur', 20940500],
    ['Cibaregbeg', 23835000],
    ['Warungbitung', 19115000],
    ['Cipetir', 13692000],
    ['Cimanggu', 13766000],
    ['Campakamulya', 10648000],
    ['Cikondang', 8552500],
    ['Sukaraharja', 7493000]
  ])
  assert.equal(parsed.warnings.length, 0)
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


test('Cidaun parser reads compact numeric-date report and spaced thousand separator', () => {
  const parsed = parseRealImportDocument('cidaun', [
    'Belanja Hari Selasa Cidaun 27/10/2026',
    'Rp 13.589.000',
    '',
    '1 . Cisepat    9.349.000',
    '2 . Kertajdi  4. 240.000',
    'BRI/Aisa oktapiani 408501016060533'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.transactionDate, '2026-10-27')
  assert.deepEqual(parsed.rows.map((row) => [row.kitchenName, row.amount]), [
    ['Cisepat', 9349000],
    ['Kertajadi', 4240000]
  ])
  assert.equal(parsed.sourceTotal, 13589000)
  assert.equal(parsed.rows.reduce((sum, row) => sum + row.amount, 0), 13589000)
  assert.equal(parsed.warnings.length, 0)
})

test('Cianjur combined supplier report recognizes Cidaun kitchens and mixed thousand separators', () => {
  const parsed = parseRealImportDocument('cianjur', [
    'Belanja Harian Rabu 29/10/2026',
    '',
    'Ereng         19,464,000',
    'Bunder        21,631,000',
    'Warbit        14,099,000',
    'Cipetir       16,348,000',
    'Cimanggu      17,329,000',
    'Camul         11,415,000',
    'Cikondang     11,932,200',
    'Cisepat        5,112,500',
    'Kertajadi     12.042.000',
    'Sukaraharja    6,900,000'
  ].join('\n'))

  assert.equal(parsed.error, null)
  assert.equal(parsed.transactionDate, '2026-10-29')
  assert.equal(parsed.rows.length, 10)
  assert.equal(parsed.warnings.length, 0)
  assert.deepEqual(parsed.rows.map((row) => [row.kitchenName, row.amount]), [
    ['Cihaur', 19464000],
    ['Cibaregbeg', 21631000],
    ['Warungbitung', 14099000],
    ['Cipetir', 16348000],
    ['Cimanggu', 17329000],
    ['Campakamulya', 11415000],
    ['Cikondang', 11932200],
    ['Cisepat', 5112500],
    ['Kertajadi', 12042000],
    ['Sukaraharja', 6900000]
  ])
})
