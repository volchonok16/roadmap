const SESSION_KEY = 'tfsSessionId'

/** Адрес API: из сборки, с подстановкой для pallink.fun, если в бандле остался localhost. */
function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') ?? ''
  if (typeof window === 'undefined') return fromEnv

  const { hostname, protocol } = window.location
  const isProdHost = hostname === 'pallink.fun' || hostname === 'www.pallink.fun'
  const envPointsToLocal =
    !fromEnv || fromEnv.includes('localhost') || fromEnv.includes('127.0.0.1')

  if (isProdHost && envPointsToLocal) {
    return 'https://api.pallink.fun'
  }
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && !fromEnv) {
    return `${protocol}//${hostname}:8000`
  }
  return fromEnv
}

const apiBase = resolveApiBase()

export function getSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

export function setSessionId(sessionId: string) {
  localStorage.setItem(SESSION_KEY, sessionId)
}

export function clearSessionId() {
  localStorage.removeItem(SESSION_KEY)
}

export function applySessionFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const sessionId = params.get('session')
  if (!sessionId) {
    return false
  }
  setSessionId(sessionId)
  params.delete('session')
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`
  window.history.replaceState({}, '', next)
  return true
}

export async function readApiError(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const data = JSON.parse(text) as { detail?: unknown }
    if (typeof data.detail === 'string') {
      return data.detail
    }
  } catch {
    /* not json */
  }
  return text || response.statusText
}

function formatFetchError(path: string, cause: unknown): Error {
  const target = apiBase ? `${apiBase}${path}` : path
  const hint =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'pallink.fun' || window.location.hostname === 'www.pallink.fun')
      ? ' На сервере: docker compose -f docker-compose.yml -f docker-compose.prod.yml ps и curl http://127.0.0.1:8000/api/health'
      : ' Локально: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d'
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new Error(`Не удалось подключиться к API (${target}).${hint} (${detail})`)
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const sessionId = getSessionId()
  if (sessionId) {
    headers.set('X-Session-Id', sessionId)
  }
  try {
    return await fetch(`${apiBase}${path}`, { ...init, headers })
  } catch (cause) {
    throw formatFetchError(path, cause)
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return response.json()
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return response.json()
}

export { apiBase }
