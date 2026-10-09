const READ_REQUEST_TIMEOUT_MS = 4_000
const RETRY_DELAY_MS = 200
const RETRYABLE_HTTP_STATUSES = new Set([522, 524])
const SAFE_READ_RPC_NAMES = new Set([
  'get_dashboard_summary',
  'get_dashboard_daily_status'
])

const nativeFetch = globalThis.fetch.bind(globalThis)

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function getRequestMethod(
  input: RequestInfo | URL,
  init?: RequestInit
): string {
  return (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
}

function isSafeReadRequest(method: string, url: string): boolean {
  if (method === 'GET' || method === 'HEAD') return true
  if (method !== 'POST') return false

  try {
    const pathname = new URL(url).pathname
    const rpcName = pathname.match(/\/rest\/v1\/rpc\/([^/]+)$/)?.[1]
    return rpcName !== undefined && SAFE_READ_RPC_NAMES.has(rpcName)
  } catch {
    return false
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Add a bounded retry for idempotent reads when the API stalls or Cloudflare
 * reports an origin timeout. Mutations are passed through unchanged so a
 * failed write is never repeated automatically.
 */
export const resilientSupabaseFetch: typeof fetch = async (input, init) => {
  const url = getRequestUrl(input)
  const method = getRequestMethod(input, init)

  if (!isSafeReadRequest(method, url)) {
    return nativeFetch(input, init)
  }

  const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (callerSignal?.aborted) {
      throw new DOMException('The request was aborted.', 'AbortError')
    }

    const controller = new AbortController()
    const abortFromCaller = () => controller.abort(callerSignal?.reason)
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true })

    let didTimeout = false
    const timeoutId = setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, READ_REQUEST_TIMEOUT_MS)

    try {
      const response = await nativeFetch(input, {
        ...init,
        signal: controller.signal
      })

      if (attempt === 0 && RETRYABLE_HTTP_STATUSES.has(response.status)) {
        void response.body?.cancel().catch(() => undefined)
      } else {
        return response
      }
    } catch (error) {
      if (callerSignal?.aborted) throw error

      const retryableFetchError = didTimeout || error instanceof TypeError

      if (attempt === 0 && retryableFetchError) {
      } else if (retryableFetchError) {
        const exhaustedError = new Error(
          'Supabase read request failed after one retry.',
          { cause: error }
        )
        exhaustedError.name = 'AbortError'
        throw exhaustedError
      } else {
        throw error
      }
    } finally {
      clearTimeout(timeoutId)
      callerSignal?.removeEventListener('abort', abortFromCaller)
    }

    await delay(RETRY_DELAY_MS)
  }

  throw new Error('Supabase read request could not be completed.')
}
