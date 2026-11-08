import { Navigate } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'

import { useAuth } from '@/features/auth/use-auth'

export function DefaultRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="default-route-loading" role="status" aria-label="Memuat sesi" aria-busy="true">
        <Skeleton className="default-route-skeleton" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.role === 'viewer') {
    return <Navigate to="/bank" replace />
  }

  return <Navigate to="/dashboard" replace />
}
