import test from 'node:test'
import assert from 'node:assert/strict'
import { buildKoperasiOpsRealRows } from '../src/features/real-import/koperasi-ops-real-utils.ts'

const kitchens = [
  { id: 'kitchen-1', name: 'Campakamulya' },
  { id: 'kitchen-2', name: 'Cibaregbeg' },
  { id: 'kitchen-3', name: 'Cisepat' }
]

test('builds one OPS / Real row per kitchen with a positive amount', () => {
  assert.deepEqual(
    buildKoperasiOpsRealRows(kitchens, {
      'kitchen-1': '104.000',
      'kitchen-2': '4.948.000',
      'kitchen-3': '0'
    }),
    [
      { line_number: 1, kitchen_id: 'kitchen-1', kitchen_name: 'Campakamulya', amount: 104000 },
      { line_number: 2, kitchen_id: 'kitchen-2', kitchen_name: 'Cibaregbeg', amount: 4948000 }
    ]
  )
})

test('keeps special kitchens as one OPS / Real total instead of Arutala source splits', () => {
  assert.deepEqual(
    buildKoperasiOpsRealRows([{ id: 'cisepat', name: 'Cisepat' }], { cisepat: '917.500' }),
    [{ line_number: 1, kitchen_id: 'cisepat', kitchen_name: 'Cisepat', amount: 917500 }]
  )
})

test('ignores empty, zero, and unsafe values', () => {
  assert.deepEqual(
    buildKoperasiOpsRealRows(kitchens, {
      'kitchen-1': '',
      'kitchen-2': '0',
      'kitchen-3': '999999999999999999999'
    }),
    []
  )
})
