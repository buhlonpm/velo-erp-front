import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  clearSession,
  loadSession,
  login as apiLogin,
  logout as apiLogout,
  setOnSessionExpired,
  setOnSessionUpdated,
} from '../api/client'
import type { AuthUser } from '../api/client'

interface AuthContextValue {
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadSession()?.user ?? null)

  useEffect(() => {
    setOnSessionExpired(() => setUser(null))
    setOnSessionUpdated((updatedUser) => setUser(updatedUser))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: async (email, password) => {
        const session = await apiLogin(email, password)
        setUser(session.user)
      },
      logout: () => {
        void apiLogout()
        setUser(null)
      },
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth вне AuthProvider')
  return context
}

export { clearSession }
