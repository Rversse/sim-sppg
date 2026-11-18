import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccess } from '../src/features/auth/role-policy.ts'

test('Guest and legacy Viewer can only view bank transactions', () => {
  const deniedPermissions = [
    'dashboard.view',
    'dashboard.transaction.create',
    'kitchen.view',
    'kitchen.manage',
    'disbursement-accounts.view',
    'vehicle.view',
    'vehicle.manage',
    'supplier.view',
    'supplier.manage',
    'bank.transaction.create',
    'bank.export',
    'reports.view',
    'salary-calculation.view',
    'maker-import.view',
    'real-import.view'
  ]

  for (const role of ['guest', 'viewer']) {
    assert.equal(canAccess(role, 'bank.view'), true, `${role} can view bank`)
    for (const permission of deniedPermissions) {
      assert.equal(
        canAccess(role, permission),
        false,
        `${role} must not access ${permission}`
      )
    }
  }
})

test('Admin and Operator can access dashboard; Koperasi is limited to Real Import', () => {
  assert.equal(canAccess('admin', 'dashboard.view'), true)
  assert.equal(canAccess('operator', 'dashboard.view'), true)
  assert.equal(canAccess('koperasi', 'dashboard.view'), false)
  assert.equal(canAccess('koperasi', 'real-import.view'), true)
  assert.equal(canAccess('koperasi', 'bank.view'), false)
})

test('Guest cannot create, export, or mutate bank transactions', () => {
  assert.equal(canAccess('guest', 'bank.transaction.create'), false)
  assert.equal(canAccess('guest', 'bank.export'), false)
})
