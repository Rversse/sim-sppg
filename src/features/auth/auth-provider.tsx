import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { AuthContext } from './auth-context'
import type { CurrentUser, UserRole } from './auth-types'

const AUTH_REQUEST_TIMEOUT_MS = 10_000

async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(message))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

async function loadCurrentUser(session: Session): Promise<CurrentUser | null> {
  try {
    const { data: profile, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single(),
      AUTH_REQUEST_TIMEOUT_MS,
      'Loading the current profile timed out.'
    )

    if (error || !profile) {
      console.error('Failed to load current user profile:', error)
      void supabase.auth.signOut()
      return null
    }

    const role = profile.role

    if (role !== 'admin' && role !== 'operator' && role !== 'viewer') {
      console.error('Invalid user role returned by profiles:', role)
      void supabase.auth.signOut()
      return null
    }

    return {
      ...session.user,
      role: role as UserRole
    }
  } catch (error) {
    console.error('Failed to load current user profile:', error)
    void supabase.auth.signOut()
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const authInitializedRef = useRef(false)
  const authRequestIdRef = useRef(0)

  useEffect(() => {
    let isMounted = true

    async function applySession(nextSession: Session | null) {
      const requestId = ++authRequestIdRef.current

      if (!nextSession) {
        if (!isMounted || requestId !== authRequestIdRef.current) {
          return
        }

        setSession(null)
        setUser(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      const currentUser = await loadCurrentUser(nextSession)

      if (!isMounted || requestId !== authRequestIdRef.current) {
        return
      }

      setSession(nextSession)
      setUser(currentUser)
      setIsLoading(false)
    }

    async function initializeAuth() {
      try {
        const {
          data: { session: initialSession },
          error
        } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_REQUEST_TIMEOUT_MS,
          'Supabase session initialization timed out.'
        )

        if (!isMounted) {
          return
        }

        authInitializedRef.current = true

        if (error) {
          console.error('Failed to get session:', error)
          setSession(null)
          setUser(null)
          setIsLoading(false)
          return
        }

        await applySession(initialSession)
      } catch (error) {
        if (!isMounted) {
          return
        }

        console.error('Failed to initialize authentication:', error)

        authInitializedRef.current = true
        setSession(null)
        setUser(null)
        setIsLoading(false)
      }
    }

    void initializeAuth()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) {
        return
      }

      if (!authInitializedRef.current) {
        return
      }

      if (event === 'SIGNED_OUT' || !nextSession) {
        ++authRequestIdRef.current

        setSession(null)
        setUser(null)
        setIsLoading(false)
        return
      }

      void applySession(nextSession)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        isLoading
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
