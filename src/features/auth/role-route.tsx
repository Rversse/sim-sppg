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

  const allowed = canAccess(user.role, permission)

  if (!allowed) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}
