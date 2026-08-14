import { Navigate, Outlet } from 'react-router-dom'

import type { Permission } from './role-policy'
import { canAccess } from './role-policy'
import { useAuth } from './use-auth'

type RoleRouteProps = {
  permission: Permission
}

export function RoleRoute({ permission }: RoleRouteProps) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Memuat sesi...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (canAccess(user.role, permission)) {
    return <Outlet />
  }

  // Viewer/guest only has access to Transaksi Bank.
  // If they arrive at a protected route directly (for example /dashboard),
  // send them to Bank instead of showing a dead-end Unauthorized page.
  if (user.role === 'viewer' && permission !== 'bank.view') {
    return <Navigate to="/bank" replace />
  }

  return <Navigate to="/unauthorized" replace />
}
