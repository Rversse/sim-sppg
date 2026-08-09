import type { UserRole } from './auth-types'

export type Permission =
  | 'dashboard.view'
  | 'dashboard.transaction.create'
  | 'kitchen.manage'
  | 'supplier.manage'
  | 'bank.view'
  | 'bank.transaction.create'
  | 'reports.view'

const permissions: Record<Permission, readonly UserRole[]> = {
  'dashboard.view': ['admin', 'operator'],
  'dashboard.transaction.create': ['admin'],
  'kitchen.manage': ['admin'],
  'supplier.manage': ['admin'],
  'bank.view': ['admin', 'operator', 'viewer'],
  'bank.transaction.create': ['admin', 'operator'],
  'reports.view': ['admin', 'operator', 'viewer']
}

export function canAccess(
  role: UserRole | null | undefined,
  permission: Permission
): boolean {
  if (!role) {
    return false
  }

  return permissions[permission].includes(role)
}
