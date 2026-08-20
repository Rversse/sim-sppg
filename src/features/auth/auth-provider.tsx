import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { AuthContext } from './auth-context'
import type { CurrentUser, UserRole } from './auth-types'

const AUTH_REQUEST_TIMEOUT_MS = 10_000
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000

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
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

function getSessionStartedAt(session: Session): number {
  if (session.user.last_sign_in_at) {
    const parsed = Date.parse(session.user.last_sign_in_at)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
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

    return { ...session.user, role: role as UserRole }
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
  const sessionStartedAtRef = useRef<number | null>(null)
  const sessionUserIdRef = useRef<string | null>(null)
  const currentUserRef = useRef<CurrentUser | null>(null)

  useEffect(() => {
    let isMounted = true

    async function applySession(nextSession: Session | null) {
      const requestId = ++authRequestIdRef.current

      if (!nextSession) {
        if (!isMounted || requestId !== authRequestIdRef.current) return
        sessionStartedAtRef.current = null
        sessionUserIdRef.current = null
        currentUserRef.current = null
        setSession(null)
        setUser(null)
        setIsLoading(false)
        return
      }

      if (sessionUserIdRef.current !== nextSession.user.id) {
        sessionUserIdRef.current = nextSession.user.id
        sessionStartedAtRef.current = getSessionStartedAt(nextSession)
      }

      setIsLoading(true)
      const currentUser = await loadCurrentUser(nextSession)

      if (!isMounted || requestId !== authRequestIdRef.current) return

      currentUserRef.current = currentUser
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

        if (!isMounted) return
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
        if (!isMounted) return
        console.error('Failed to initialize authentication:', error)
        authInitializedRef.current = true
        sessionStartedAtRef.current = null
        sessionUserIdRef.current = null
        currentUserRef.current = null
        setSession(null)
        setUser(null)
        setIsLoading(false)
      }
    }

    void initializeAuth()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted || !authInitializedRef.current) return

      if (event === 'SIGNED_OUT' || !nextSession) {
        ++authRequestIdRef.current
        sessionStartedAtRef.current = null
        sessionUserIdRef.current = null
        currentUserRef.current = null
        setSession(null)
        setUser(null)
        setIsLoading(false)
        return
      }

      const currentUserId = sessionUserIdRef.current
      const nextUserId = nextSession.user.id

      // Token refreshes (and other auth events for the same user) must not
      // toggle the global loading state or re-fetch the profile. Doing so
      // unmounts the current route tree via ProtectedRoute and makes every
      // page appear to refresh when the browser tab regains focus.
      if (currentUserId === nextUserId && currentUserRef.current) {
        sessionUserIdRef.current = nextUserId
        setSession(nextSession)
        return
      }

      void applySession(nextSession)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session || sessionStartedAtRef.current === null) return

    const remainingMs =
      SESSION_MAX_AGE_MS - Math.max(0, Date.now() - sessionStartedAtRef.current)

    if (remainingMs <= 0) {
      void supabase.auth.signOut()
      return
    }

    const timeoutId = window.setTimeout(() => {
      void supabase.auth.signOut()
    }, remainingMs)

    return () => window.clearTimeout(timeoutId)
  }, [session])

  return (
    <AuthContext.Provider value={{ session, user, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}
