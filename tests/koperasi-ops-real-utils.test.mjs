import test from 'node:test'
import assert from 'node:assert/strict'
import { buildKoperasiOpsRealRows } from '../src/features/real-import/koperasi-ops-real-utils.ts'

const kitchens = [
  { id: 'kitchen-1', name: 'Campakamulya' },
  { id: 'kitchen-2', name: 'Cibaregbeg' },
  { id: 'kitchen-3', name: 'Cisepat' },
  { id: 'kitchen-4', name: 'Kertajadi' }
]

test('builds one OPS / Real row for ordinary kitchens', () => {
  assert.deepEqual(
    buildKoperasiOpsRealRows(kitchens.slice(0, 2), {
      'kitchen-1': '104.000',
      'kitchen-2': '4.948.000'
    }),
    [
      { line_number: 1, kitchen_id: 'kitchen-1', kitchen_name: 'Campakamulya', amount: 104000, source_type: 'umum', note: 'OPS / Real' },
      { line_number: 2, kitchen_id: 'kitchen-2', kitchen_name: 'Cibaregbeg', amount: 4948000, source_type: 'umum', note: 'OPS / Real' }
    ]
  )
})

test('splits Cisepat and Kertajadi OPS / Real into Arutala Cianjur and Cidaun', () => {
  assert.deepEqual(
    buildKoperasiOpsRealRows(kitchens.slice(2), {
      'kitchen-3:cianjur': '917.500',
      'kitchen-3:cidaun': '450.000',
      'kitchen-4:cianjur': '1.000.000',
      'kitchen-4:cidaun': '0'
    }),
    [
      { line_number: 1, kitchen_id: 'kitchen-3', kitchen_name: 'Cisepat', amount: 917500, source_type: 'cianjur', note: 'Arutala Cianjur' },
      { line_number: 2, kitchen_id: 'kitchen-3', kitchen_name: 'Cisepat', amount: 450000, source_type: 'cidaun', note: 'Arutala Cidaun' },
      { line_number: 3, kitchen_id: 'kitchen-4', kitchen_name: 'Kertajadi', amount: 1000000, source_type: 'cianjur', note: 'Arutala Cianjur' }
    ]
  )
})

test('special kitchen matching is case and diacritic insensitive', () => {
  assert.deepEqual(
    buildKoperasiOpsRealRows([{ id: 'cisepat', name: 'CISEPAT' }], {
      'cisepat:cianjur': '100.000'
    }),
    [{
      line_number: 1,
      kitchen_id: 'cisepat',
      kitchen_name: 'CISEPAT',
      amount: 100000,
      source_type: 'cianjur',
      note: 'Arutala Cianjur'
    }]
  )
})

test('ignores empty, zero, and unsafe values', () => {
  assert.deepEqual(
    buildKoperasiOpsRealRows(kitchens, {
      'kitchen-1': '',
      'kitchen-2': '0',
      'kitchen-3:cianjur': '999999999999999999999',
      'kitchen-3:cidaun': ''
    }),
    []
  )
})
