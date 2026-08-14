import { Navigate } from 'react-router-dom'

import { useAuth } from '@/features/auth/use-auth'

export function DefaultRoute() {
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

  if (user.role === 'viewer') {
    return <Navigate to="/bank" replace />
  }

  return <Navigate to="/dashboard" replace />
}
