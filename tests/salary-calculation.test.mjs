import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSalaryAllocation } from '../src/features/salary-calculation/salary-allocation-utils.ts'

test('manual percentage values are preserved without auto-balancing', () => {
  const allocation = {
    accountant: 19.94,
    nutritionist: 20.39,
    aslap: 29.69,
    head: 29.98
  }

  assert.deepEqual(allocation, {
    accountant: 19.94,
    nutritionist: 20.39,
    aslap: 29.69,
    head: 29.98
  })
  assert.equal(validateSalaryAllocation(allocation), null)
})

test('percentage total below 100% can be saved', () => {
  assert.equal(validateSalaryAllocation({
    accountant: 20,
    nutritionist: 20,
    aslap: 20,
    head: 20
  }), null)
})

test('percentage total above 100% cannot be saved', () => {
  assert.equal(validateSalaryAllocation({
    accountant: 30,
    nutritionist: 30,
    aslap: 25,
    head: 20
  }), 'Total persentase pembagian tidak boleh melebihi 100%.')
})

test('negative percentages are rejected', () => {
  assert.equal(validateSalaryAllocation({
    accountant: -1,
    nutritionist: 31,
    aslap: 30,
    head: 30
  }), 'Setiap persentase harus berada di antara 0 dan 100.')
})
