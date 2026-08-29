// API-клиент: хранение сессии, запросы с access-токеном,
// прозрачный refresh при 401 и повтор запроса.

const STORAGE_KEY = 'velo.auth'

export type UserRole = 'ADMIN' | 'MANAGER'

export interface AuthUser {
  id: string
  fullName: string
  email: string
  role: UserRole
  permissions: string[]
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthSession) : null
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}

/** Вызывается, когда refresh не помог — сессия окончательно мертва. */
let onSessionExpired: (() => void) | null = null
export function setOnSessionExpired(callback: () => void) {
  onSessionExpired = callback
}

/** Вызывается, когда сессия обновилась (refresh) — фронту пора перечитать user/права. */
let onSessionUpdated: ((user: AuthUser) => void) | null = null
export function setOnSessionUpdated(callback: (user: AuthUser) => void) {
  onSessionUpdated = callback
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { message?: string }
    return new ApiError(response.status, body.message ?? `Ошибка ${response.status}`)
  } catch {
    return new ApiError(response.status, `Ошибка ${response.status}`)
  }
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw await parseError(response)
  const session = (await response.json()) as AuthSession
  saveSession(session)
  return session
}

export async function logout(): Promise<void> {
  const session = loadSession()
  if (session) {
    // гасим refresh-токен на сервере; ошибки игнорируем — локально всё равно чистим
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    }).catch(() => undefined)
  }
  clearSession()
}

async function tryRefresh(): Promise<boolean> {
  const session = loadSession()
  if (!session) return false
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  }).catch(() => null)
  if (!response || !response.ok) {
    clearSession()
    onSessionExpired?.()
    return false
  }
  const session2 = (await response.json()) as AuthSession
  saveSession(session2)
  onSessionUpdated?.(session2.user)
  return true
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = () => {
    const session = loadSession()
    return fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...options.headers,
      },
    })
  }

  let response = await doFetch()
  if (response.status === 401 && (await tryRefresh())) {
    response = await doFetch()
  }
  // 403: возможно, права только что изменили — тихо обновляем сессию и пробуем ещё раз
  if (response.status === 403 && (await tryRefresh())) {
    response = await doFetch()
  }
  if (response.status === 401) {
    clearSession()
    onSessionExpired?.()
  }
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
