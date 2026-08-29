import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import type { Permission } from '../auth/permissions'

/** Пускает только авторизованных, иначе — на логин. */
export function ProtectedRoute() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

/** Пускает только админов, остальных — на дашборд. */
export function AdminRoute() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />
  return <Outlet />
}

/** Пускает только обладателей конкретного права (админы — всегда). */
export function PermissionRoute({ permission }: { permission: Permission }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!hasPermission(user, permission)) return <Navigate to="/" replace />
  return <Outlet />
}
