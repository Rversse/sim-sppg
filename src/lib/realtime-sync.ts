import { supabase } from '@/lib/supabase'

export type RealtimeTable = {
  table: string
  schema?: string
}

export function subscribeToRealtimeTables(
  channelName: string,
  tables: RealtimeTable[],
  onRefresh: () => void
) {
  let hasConnected = false
  let disposed = false
  let refreshTimer: ReturnType<typeof window.setTimeout> | null = null

  const scheduleRefresh = () => {
    if (disposed || document.visibilityState !== 'visible' || refreshTimer !== null) return
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null
      if (!disposed) onRefresh()
    }, 150)
  }

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') scheduleRefresh()
  }

  const channel = tables.reduce(
    (current, item) => current.on(
      'postgres_changes',
      { event: '*', schema: item.schema ?? 'public', table: item.table },
      scheduleRefresh
    ),
    supabase.channel(channelName)
  ).subscribe((status) => {
    if (disposed) return
    if (status === 'SUBSCRIBED') {
      if (hasConnected) scheduleRefresh()
      hasConnected = true
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      console.warn(`[Realtime:${channelName}] ${status}`)
    }
  })

  window.addEventListener('focus', scheduleRefresh)
  document.addEventListener('visibilitychange', handleVisibility)

  return () => {
    disposed = true
    window.removeEventListener('focus', scheduleRefresh)
    document.removeEventListener('visibilitychange', handleVisibility)
    if (refreshTimer !== null) window.clearTimeout(refreshTimer)
    void supabase.removeChannel(channel)
  }
}
