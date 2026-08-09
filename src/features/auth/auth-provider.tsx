import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { AuthContext } from './auth-context'
import type { CurrentUser, UserRole } from './auth-types'

async function loadCurrentUser(session: Session): Promise<CurrentUser | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (error || !profile) {
    await supabase.auth.signOut()
    return null
  }

  const role = profile.role

  if (role !== 'admin' && role !== 'operator' && role !== 'viewer') {
    await supabase.auth.signOut()
    return null
  }

  return {
    ...session.user,
    role: role as UserRole
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function initializeAuth() {
      const {
        data: { session: initialSession },
        error
      } = await supabase.auth.getSession()

      if (!isMounted) {
        return
      }

      if (error) {
        console.error('Failed to get session:', error)
        setSession(null)
        setUser(null)
        setIsLoading(false)
        return
      }

      setSession(initialSession)
    }

    void initializeAuth()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) {
        return
      }

      if (event === 'SIGNED_OUT' || !nextSession) {
        setSession(null)
        setUser(null)
        setIsLoading(false)
        return
      }

      setSession(nextSession)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function resolveUser() {
      if (!session) {
        if (isMounted) {
          setUser(null)
          setIsLoading(false)
        }

        return
      }

      setIsLoading(true)

      const currentUser = await loadCurrentUser(session)

      console.log('SIM SPPG Auth:', {
        userId: session.user.id,
        email: session.user.email,
        role: currentUser?.role
      })

      if (!isMounted) {
        return
      }

      setUser(currentUser)
      setIsLoading(false)
    }

    void resolveUser()

    return () => {
      isMounted = false
    }
  }, [session])

  return (
    <AuthContext.Provider value={{ session, user, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}
