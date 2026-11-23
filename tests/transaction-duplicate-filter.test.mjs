import test from 'node:test'
import assert from 'node:assert/strict'
import { getExpenseDuplicateFilters } from '../src/features/transactions/transaction-duplicate-filter.ts'

test('OPS / Real duplicate identity matches a null supplier and OPS category', () => {
  assert.deepEqual(
    getExpenseDuplicateFilters('OPS', null),
    [
      { column: 'category', operator: 'eq', value: 'OPS' },
      { column: 'supplier_id', operator: 'is', value: null }
    ]
  )
})

test('RAB / Real duplicate identity remains scoped to its supplier', () => {
  assert.deepEqual(
    getExpenseDuplicateFilters('Supplier', 'supplier-123'),
    [
      { column: 'category', operator: 'eq', value: 'Supplier' },
      { column: 'supplier_id', operator: 'eq', value: 'supplier-123' }
    ]
  )
})

test('expense duplicate filters keep OPS / Real separate from supplier expenses', () => {
  const opsFilters = getExpenseDuplicateFilters('OPS', null)
  const rabFilters = getExpenseDuplicateFilters('Supplier', 'supplier-123')

  assert.notDeepEqual(opsFilters, rabFilters)
  assert.equal(opsFilters.some((filter) => filter.value === 'supplier-123'), false)
  assert.equal(rabFilters.some((filter) => filter.value === 'OPS'), false)
})
