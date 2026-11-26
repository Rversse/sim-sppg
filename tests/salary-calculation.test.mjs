import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adjustSalaryAllocation,
  validateSalaryAllocation
} from '../src/features/salary-calculation/salary-allocation-utils.ts'

const DEFAULT_SALARY_ALLOCATION = {
  accountant: 25,
  nutritionist: 25,
  aslap: 25,
  head: 25
}

function total(allocation) {
  return Object.values(allocation).reduce((sum, value) => sum + value, 0)
}

test('editing a salary role proportionally adjusts the remaining roles to 100%', () => {
  const current = {
    accountant: 20,
    nutritionist: 20,
    aslap: 30,
    head: 30
  }
  const updated = adjustSalaryAllocation(current, 'accountant', 25)

  assert.equal(updated.accountant, 25)
  assert.equal(total(updated), 100)
  assert.equal(validateSalaryAllocation(updated), null)
  assert.ok(Object.values(updated).every((value) => value >= 0))
  assert.ok(Math.abs(updated.nutritionist - 18.75) <= 0.01)
  assert.ok(Math.abs(updated.aslap - 28.125) <= 0.01)
  assert.ok(Math.abs(updated.head - 28.125) <= 0.01)
})

test('setting one role to 100% makes the other roles zero', () => {
  const updated = adjustSalaryAllocation(DEFAULT_SALARY_ALLOCATION, 'head', 100)

  assert.deepEqual(updated, {
    accountant: 0,
    nutritionist: 0,
    aslap: 0,
    head: 100
  })
  assert.equal(validateSalaryAllocation(updated), null)
})

test('zero remaining weights are distributed evenly', () => {
  const current = {
    accountant: 100,
    nutritionist: 0,
    aslap: 0,
    head: 0
  }
  const updated = adjustSalaryAllocation(current, 'accountant', 40)

  assert.deepEqual(updated, {
    accountant: 40,
    nutritionist: 20,
    aslap: 20,
    head: 20
  })
  assert.equal(total(updated), 100)
})
