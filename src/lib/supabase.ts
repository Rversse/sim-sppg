import { createClient } from '@supabase/supabase-js'

import { resilientSupabaseFetch } from './supabase-fetch'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables.')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: resilientSupabaseFetch
  }
})
