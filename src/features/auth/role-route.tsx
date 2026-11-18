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

  if (!canAccess(user.role, permission)) {
    // Keep the authenticated session intact. The unauthorized page offers
    // a role-appropriate return path and an explicit logout action.
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}
