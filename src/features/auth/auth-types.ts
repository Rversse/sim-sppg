import type { User } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'operator' | 'viewer' | 'koperasi'

export type CurrentUser = User & {
  role: UserRole
}
