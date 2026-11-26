import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccess, canManageDashboardTransaction } from '../src/features/auth/role-policy.ts'

test('Guest and legacy Viewer can only view bank transactions', () => {
  const deniedPermissions = [
    'dashboard.view',
    'dashboard.transaction.create',
    'dashboard.ops-disbursement-real.manage',
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
  assert.equal(canAccess('operator', 'dashboard.ops-disbursement-real.manage'), true)
  assert.equal(canAccess('admin', 'dashboard.ops-disbursement-real.manage'), true)
  assert.equal(canAccess('koperasi', 'dashboard.ops-disbursement-real.manage'), false)
  assert.equal(canAccess('koperasi', 'dashboard.view'), false)
  assert.equal(canAccess('koperasi', 'real-import.view'), true)
  assert.equal(canAccess('koperasi', 'bank.view'), false)
})

test('Operator keeps existing Bank Transaction CRUD permission unchanged', () => {
  assert.equal(canAccess('operator', 'bank.transaction.create'), true)
  assert.equal(canAccess('operator', 'bank.export'), true)
})

test('Operator Dashboard CRUD is limited to OPS - Pencairan Real', () => {
  assert.equal(canManageDashboardTransaction('admin', 'income'), true)
  assert.equal(canManageDashboardTransaction('operator', 'ops_disbursement_real'), true)
  for (const flow of ['income', 'expense', 'ops_real', 'gas', 'ops_disbursement', 'operational_disbursement']) {
    assert.equal(canManageDashboardTransaction('operator', flow), false, `Operator cannot manage ${flow}`)
  }
  assert.equal(canManageDashboardTransaction('guest', 'ops_disbursement_real'), false)
  assert.equal(canManageDashboardTransaction('koperasi', 'ops_disbursement_real'), false)
})

test('Guest cannot create, export, or mutate bank transactions', () => {
  assert.equal(canAccess('guest', 'bank.transaction.create'), false)
  assert.equal(canAccess('guest', 'bank.export'), false)
})
