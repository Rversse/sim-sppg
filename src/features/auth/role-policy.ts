import type { UserRole } from './auth-types'

export type Permission =
  | 'dashboard.view'
  | 'dashboard.transaction.create'
  | 'kitchen.view'
  | 'kitchen.manage'
  | 'vehicle.view'
  | 'vehicle.manage'
  | 'supplier.view'
  | 'supplier.manage'
  | 'bank.view'
  | 'bank.transaction.create'
  | 'disbursement.view'
  | 'reports.view'
  | 'disbursement-maker.view'

const permissions: Record<Permission, readonly UserRole[]> = {
  // Dashboard
  'dashboard.view': ['admin', 'operator'],
  'dashboard.transaction.create': ['admin'],
  'disbursement-maker.view': ['admin'],

  // Master Data
  'kitchen.view': ['admin', 'operator'],
  'kitchen.manage': ['admin'],

  'vehicle.view': ['admin', 'operator'],
  'vehicle.manage': ['admin'],

  'supplier.view': ['admin', 'operator'],
  'supplier.manage': ['admin'],

  // Transaksi Bank
  'bank.view': ['admin', 'operator', 'viewer'],
  'bank.transaction.create': ['admin', 'operator'],

  // Pencairan
  'disbursement.view': ['admin'],

  // Laporan
  'reports.view': ['admin']
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
