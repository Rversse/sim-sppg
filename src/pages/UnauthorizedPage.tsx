import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '@/features/auth/use-auth'
import { supabase } from '@/lib/supabase'

const roleHome: Record<string, { path: string; label: string }> = {
  admin: { path: '/dashboard', label: 'Dashboard' },
  operator: { path: '/dashboard', label: 'Dashboard' },
  viewer: { path: '/bank', label: 'Transaksi Bank' },
  guest: { path: '/bank', label: 'Transaksi Bank' },
  koperasi: { path: '/real-import', label: 'Belanja Harian Real' }
}

export function UnauthorizedPage() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (isLoading) {
    return (
      <main className="unauthorized-page" aria-live="polite">
        <div className="unauthorized-card">
          <p>Memeriksa sesi...</p>
        </div>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const destination = roleHome[user.role] ?? { path: '/login', label: 'Login' }

  async function handleLogout() {
    if (isSigningOut) return
    setIsSigningOut(true)
    setErrorMessage('')

    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Logout gagal:', error)
      setErrorMessage('Gagal mengakhiri sesi. Silakan coba lagi.')
      setIsSigningOut(false)
      return
    }

    navigate('/login', { replace: true })
  }

  return (
    <main className="unauthorized-page">
      <div className="unauthorized-card">
        <h1>Akses ditolak</h1>
        <p>Akun {user.role} tidak memiliki izin untuk membuka halaman ini.</p>
        <p>Sesi Anda masih aktif. Kembali ke halaman yang diizinkan atau keluar dari akun.</p>
        {errorMessage && <p role="alert">{errorMessage}</p>}
      </div>

      <div className="unauthorized-actions">
        <button
          type="button"
          className="unauthorized-link"
          onClick={() => navigate(destination.path, { replace: true })}
        >
          Kembali ke {destination.label}
        </button>
        <button
          type="button"
          className="unauthorized-link"
          onClick={() => void handleLogout()}
          disabled={isSigningOut}
        >
          {isSigningOut ? 'Mengakhiri sesi...' : 'Keluar dan kembali ke Login'}
        </button>
      </div>
    </main>
  )
}
