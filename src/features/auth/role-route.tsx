import { Navigate, Outlet, useLocation } from 'react-router-dom'

import type { Permission } from './role-policy'
import { canAccess } from './role-policy'
import { useAuth } from './use-auth'

type RoleRouteProps = {
  permission: Permission
}

export function RoleRoute({ permission }: RoleRouteProps) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

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

  const allowed = canAccess(user.role, permission)

  console.log('SIM SPPG RoleRoute:', {
    pathname: location.pathname,
    role: user.role,
    permission,
    allowed
  })

  if (!allowed) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}
