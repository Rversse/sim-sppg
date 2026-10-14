import type { UserRole } from './auth-types'

export type Permission =
  | 'dashboard.view'
  | 'dashboard.transaction.create'
  | 'kitchen.view'
  | 'kitchen.manage'
  | 'disbursement-accounts.view'
  | 'vehicle.view'
  | 'vehicle.manage'
  | 'supplier.view'
  | 'supplier.manage'
  | 'bank.view'
  | 'bank.transaction.create'
  | 'bank.export'
  | 'reports.view'
  | 'maker-import.view'

const permissions: Record<Permission, readonly UserRole[]> = {
  'dashboard.view': ['admin', 'operator'],
  'dashboard.transaction.create': ['admin'],
  'kitchen.view': ['admin', 'operator'],
  'kitchen.manage': ['admin'],
  'disbursement-accounts.view': ['admin'],
  'vehicle.view': ['admin', 'operator'],
  'vehicle.manage': ['admin', 'operator'],
  'supplier.view': ['admin', 'operator'],
  'supplier.manage': ['admin'],
  'bank.view': ['admin', 'operator', 'viewer'],
  'bank.transaction.create': ['admin', 'operator'],
  'bank.export': ['admin', 'operator'],
  'reports.view': ['admin'],
  'maker-import.view': ['admin']
}

export function canAccess(
  role: UserRole | null | undefined,
  permission: Permission
): boolean {
  return Boolean(role && permissions[permission].includes(role))
}
