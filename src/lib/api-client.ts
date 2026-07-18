// ============================================================
// Central API client for the dashboard. All views use this.
// Handles 401 globally by reloading to the login page.
// ============================================================

export class ApiError extends Error {
  status: number
  body?: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

// Track the last 401 redirect time so we don't fire multiple reloads
// simultaneously when several API calls fail at once.
let lastAuthRedirect = 0

function handleUnauthorized() {
  const now = Date.now()
  // Throttle: only redirect once per 3 seconds
  if (now - lastAuthRedirect < 3000) return
  lastAuthRedirect = now
  // Clear any stale local state, then reload. The root page.tsx checks
  // /api/auth/me on mount and will render the LoginView if unauthenticated.
  if (typeof window !== 'undefined') {
    // Use replace so the user can't "back" into an authenticated page
    window.location.replace('/')
  }
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    credentials: 'same-origin',
    cache: 'no-store',
  })

  // Global 401 handler: session expired or invalid → redirect to login.
  // Skip auth endpoints — they handle 401 themselves (e.g. /api/auth/me
  // returns 401 to signal "not logged in", which the root page catches
  // to show the LoginView. We must NOT reload-loop on those.)
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    handleUnauthorized()
    throw new ApiError('Session expired', 401)
  }

  const text = await res.text()
  let json: unknown = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = text
    }
  }
  if (!res.ok) {
    const msg =
      (json && typeof json === 'object' && 'error' in json
        ? String((json as Record<string, unknown>).error)
        : res.statusText) || 'Request failed'
    throw new ApiError(msg, res.status, json)
  }
  return json as T
}

export const apiGet = <T = unknown>(path: string) => api<T>(path, { method: 'GET' })
export const apiPost = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
export const apiPut = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })
export const apiPatch = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
export const apiDelete = <T = unknown>(path: string) =>
  api<T>(path, { method: 'DELETE' })
