import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

type LoginUsername = 'admin' | 'operator' | 'guest'

type LoginResponse = {
  access_token: string
  refresh_token: string
}

export async function loginWithUsername(
  username: LoginUsername,
  pin?: string
): Promise<Session> {
  const body: {
    username: LoginUsername
    pin?: string
  } = {
    username
  }

  if (username !== 'guest') {
    body.pin = pin
  }

  const { data, error } = await supabase.functions.invoke<LoginResponse>(
    'login-with-username',
    {
      body
    }
  )

  if (error || !data?.access_token || !data.refresh_token) {
    throw new Error('Username atau PIN salah')
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    })

  if (sessionError || !sessionData.session) {
    throw new Error('Gagal membuat sesi login')
  }

  return sessionData.session
}
