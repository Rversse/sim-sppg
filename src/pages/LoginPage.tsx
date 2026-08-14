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
      <main className="login-page">
        <p>Memuat sesi...</p>
      </main>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
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
      await loginWithUsername(
        selectedUsername,
        selectedUsername === 'guest' ? undefined : pin
      )

      navigate('/dashboard', { replace: true })
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
      navigate('/dashboard', { replace: true })
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
    <main className="login-page">
      <section className="login-card">
        <div className="login-header">
          <h1>SIM SPPG</h1>

          <p>Pilih akun untuk masuk</p>
        </div>

        <div className="login-account-grid">
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
          <div className="login-pin-field">
            <label htmlFor="pin">PIN</label>

            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={PIN_LENGTH}
              value={pin}
              disabled={isLoggingIn}
              onChange={(event) => handlePinChange(event.target.value)}
              className="login-pin-input"
            />
          </div>
        )}

        {errorMessage && (
          <p role="alert" className="login-error">
            {errorMessage}
          </p>
        )}

        {selectedUsername !== 'guest' && (
          <Button
            type="button"
            className="login-submit"
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
