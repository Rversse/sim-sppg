import type { User } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'operator' | 'viewer'

export type CurrentUser = User & {
  role: UserRole
}
