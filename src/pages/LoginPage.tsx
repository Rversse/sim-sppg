import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/use-auth'
import { loginWithUsername } from '@/features/auth/auth-service'

type LoginUsername = 'admin' | 'operator' | 'guest'

const PIN_LENGTH = 8

const accounts: Array<{
  username: LoginUsername
  label: string
}> = [
  {
    username: 'admin',
    label: 'Admin'
  },
  {
    username: 'operator',
    label: 'Operator'
  },
  {
    username: 'guest',
    label: 'Guest'
  }
]

export function LoginPage() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()

  const [selectedUsername, setSelectedUsername] =
    useState<LoginUsername>('admin')
  const [pin, setPin] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Memuat sesi...</p>
      </main>
    )
  }

  if (user) {
    const destination = user.role === 'viewer' ? '/bank' : '/dashboard'

    return <Navigate to={destination} replace />
  }

  function getDestination(role: string) {
    return role === 'viewer' ? '/bank' : '/dashboard'
  }

  async function handleLogin() {
    if (isLoggingIn) {
      return
    }

    setErrorMessage('')

    if (selectedUsername !== 'guest' && pin.length !== PIN_LENGTH) {
      setErrorMessage('PIN harus terdiri dari 8 digit')
      return
    }

    setIsLoggingIn(true)

    try {
      const session = await loginWithUsername(
        selectedUsername,
        selectedUsername === 'guest' ? undefined : pin
      )

      const role =
        session.user.user_metadata?.role === 'viewer'
          ? 'viewer'
          : selectedUsername === 'guest'
            ? 'viewer'
            : selectedUsername

      navigate(getDestination(role), { replace: true })
    } catch (error) {
      console.error('Login failed:', error)

      setErrorMessage(
        selectedUsername === 'guest'
          ? 'Login Guest gagal'
          : 'Username atau PIN salah'
      )

      setPin('')
    } finally {
      setIsLoggingIn(false)
    }
  }

  function handleAccountChange(username: LoginUsername) {
    if (isLoggingIn) {
      return
    }

    setSelectedUsername(username)
    setPin('')
    setErrorMessage('')

    if (username === 'guest') {
      void loginGuest()
    }
  }

  async function loginGuest() {
    setIsLoggingIn(true)

    try {
      await loginWithUsername('guest')
      navigate('/bank', { replace: true })
    } catch (error) {
      console.error('Guest login failed:', error)
      setErrorMessage('Login Guest gagal')
    } finally {
      setIsLoggingIn(false)
    }
  }

  function handlePinChange(value: string) {
    setErrorMessage('')

    const sanitizedValue = value.replace(/\D/g, '').slice(0, PIN_LENGTH)

    setPin(sanitizedValue)

    if (sanitizedValue.length === PIN_LENGTH) {
      void handleLoginWithPin(sanitizedValue)
    }
  }

  async function handleLoginWithPin(value: string) {
    if (isLoggingIn) {
      return
    }

    setIsLoggingIn(true)

    try {
      await loginWithUsername(selectedUsername, value)
      navigate('/dashboard', { replace: true })
    } catch (error) {
      console.error('Login failed:', error)

      setErrorMessage('Username atau PIN salah')
      setPin('')
    } finally {
      setIsLoggingIn(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <section className="w-full max-w-md rounded-xl border bg-background p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">SIM SPPG</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pilih akun untuk masuk
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {accounts.map((account) => (
            <Button
              key={account.username}
              type="button"
              variant={
                selectedUsername === account.username ? 'default' : 'outline'
              }
              disabled={isLoggingIn}
              onClick={() => handleAccountChange(account.username)}
            >
              {account.label}
            </Button>
          ))}
        </div>

        {selectedUsername !== 'guest' && (
          <div className="mt-6">
            <label htmlFor="pin" className="mb-2 block text-sm font-medium">
              PIN
            </label>

            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={PIN_LENGTH}
              value={pin}
              disabled={isLoggingIn}
              onChange={(event) => handlePinChange(event.target.value)}
              className="h-12 w-full rounded-md border bg-background px-4 text-center text-xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {errorMessage && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {selectedUsername !== 'guest' && (
          <Button
            type="button"
            className="mt-6 w-full"
            disabled={isLoggingIn || pin.length !== PIN_LENGTH}
            onClick={() => void handleLogin()}
          >
            {isLoggingIn ? 'Memproses...' : 'Masuk'}
          </Button>
        )}
      </section>
    </main>
  )
}
