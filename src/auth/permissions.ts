import type { AuthUser } from '../api/client'

/**
 * Реестр гранулярных прав. Должен совпадать с AppPermissions на бэкенде.
 * Новое право добавляется здесь одной строкой + лейбл ниже.
 */
export const PERMISSIONS = {
  FINANCE_VIEW: 'finance:view',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const permissionLabels: Record<Permission, string> = {
  [PERMISSIONS.FINANCE_VIEW]: 'Доступ к финансам (счета, остатки, операции)',
}

/** ADMIN видит всё; MANAGER — только выданные права. */
export function hasPermission(user: AuthUser | null, permission: Permission): boolean {
  if (!user) return false
  // permissions может отсутствовать у сессий, сохранённых до появления прав
  return user.role === 'ADMIN' || (user.permissions ?? []).includes(permission)
}
