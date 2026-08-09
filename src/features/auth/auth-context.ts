import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

import type { CurrentUser } from './auth-types'

export type AuthContextValue = {
  session: Session | null
  user: CurrentUser | null
  isLoading: boolean
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
)
