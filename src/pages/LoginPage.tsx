import { useEffect, useRef, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'
import { loginWithUsername } from '@/features/auth/auth-service'

type LoginUsername = 'admin' | 'operator' | 'guest'
const PIN_LENGTH = 8

const accounts: Array<{ username: LoginUsername; label: string }> = [
  { username: 'admin', label: 'Admin' },
  { username: 'operator', label: 'Operator' },
  { username: 'guest', label: 'Guest' }
]

export function LoginPage() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()
  const { error: toastError } = useToast()
  const [selectedUsername, setSelectedUsername] =
    useState<LoginUsername | null>(null)
  const [pin, setPin] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const pinInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectedUsername && selectedUsername !== 'guest') {
      pinInputRef.current?.focus()
    }
  }, [selectedUsername])

  if (isLoading) {
    return (
      <main className="login-page">
        <section className="login-loading" aria-live="polite">
          <span className="login-loading-mark" aria-hidden="true">
            <Building2 size={22} strokeWidth={2} />
          </span>
          <p>Memuat sesi...</p>
        </section>
      </main>
    )
  }

  if (user) {
    return (
      <Navigate to={user.role === 'viewer' ? '/bank' : '/dashboard'} replace />
    )
  }

  async function login(username: LoginUsername, value?: string) {
    if (isLoggingIn) return
    if (username !== 'guest' && value?.length !== PIN_LENGTH) return

    setErrorMessage('')
    setIsLoggingIn(true)

    try {
      await loginWithUsername(
        username,
        username === 'guest' ? undefined : value
      )
      navigate(username === 'guest' ? '/bank' : '/dashboard', { replace: true })
    } catch (error) {
      console.error('Login failed:', error)
      const message =
        username === 'guest' ? 'Login Guest gagal' : 'Username atau PIN salah'
      setErrorMessage(message)
      toastError('Login gagal', message)
      setPin('')
    } finally {
      setIsLoggingIn(false)
    }
  }

  function handleAccountChange(username: LoginUsername) {
    if (isLoggingIn) return
    setSelectedUsername(username)
    setPin('')
    setErrorMessage('')

    if (username === 'guest') {
      void login('guest')
    }
  }

  function handlePinChange(value: string) {
    if (!selectedUsername || selectedUsername === 'guest') return

    const sanitized = value.replace(/\D/g, '').slice(0, PIN_LENGTH)
    setErrorMessage('')
    setPin(sanitized)

    if (sanitized.length === PIN_LENGTH) {
      void login(selectedUsername, sanitized)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-header">
          <div className="login-brand-mark" aria-hidden="true">
            <Building2 size={26} strokeWidth={1.9} />
          </div>
          <h1>SISTEM INFORMASI SPPG</h1>
          <p>Pilih akun untuk masuk</p>
        </div>

        <div className="login-account-grid" aria-label="Pilihan akun">
          {accounts.map((account) => (
            <Button
              key={account.username}
              type="button"
              variant={
                selectedUsername === account.username ? 'default' : 'outline'
              }
              disabled={isLoggingIn}
              onClick={() => handleAccountChange(account.username)}
              className="login-account-button"
            >
              {account.label}
            </Button>
          ))}
        </div>

        {selectedUsername && selectedUsername !== 'guest' && (
          <div className="login-pin-field">
            <label htmlFor="pin">PIN</label>
            <input
              ref={pinInputRef}
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={PIN_LENGTH}
              value={pin}
              disabled={isLoggingIn}
              onChange={(event) => handlePinChange(event.target.value)}
              className="login-pin-input"
              aria-describedby="pin-hint"
            />
            <p id="pin-hint" className="login-pin-hint">
              Masukkan 8 digit PIN
            </p>
          </div>
        )}

        {errorMessage && (
          <p role="alert" className="login-error">
            {errorMessage}
          </p>
        )}

        {selectedUsername === 'guest' && isLoggingIn && (
          <p className="login-status" aria-live="polite">
            Menyiapkan sesi Guest...
          </p>
        )}
      </section>
    </main>
  )
}
