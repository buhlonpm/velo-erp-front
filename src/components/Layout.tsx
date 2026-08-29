import { NavLink, Outlet } from 'react-router-dom'
import {
  Bike,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, PERMISSIONS } from '../auth/permissions'
import type { Permission } from '../auth/permissions'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Право, необходимое для отображения пункта (админ видит всё) */
  permission?: Permission
}

const navItems: NavItem[] = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard, end: true },
  { to: '/park', label: 'Парк', icon: Bike },
  { to: '/rentals', label: 'Аренды', icon: ClipboardList },
  { to: '/customers', label: 'Клиенты', icon: Users },
  { to: '/finance', label: 'Финансы', icon: Wallet, permission: PERMISSIONS.FINANCE_VIEW },
]

const adminNavItem: NavItem = { to: '/settings', label: 'Настройки', icon: Settings }

export function Layout() {
  const { user, logout } = useAuth()

  const items = [
    ...navItems.filter((item) => !item.permission || hasPermission(user, item.permission)),
    ...(user?.role === 'ADMIN' ? [adminNavItem] : []),
  ]
  const initial = user?.fullName?.trim().charAt(0).toUpperCase() ?? '?'

  return (
    <div className="flex min-h-screen">
      {/* Сайдбар: на узких экранах сворачивается в иконки */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col border-r border-white/5 bg-panel lg:w-64">
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-4">
          <span className="rounded-lg bg-emerald-400/10 p-2 text-emerald-400">
            <Bike size={20} />
          </span>
          <span className="hidden text-lg font-semibold text-zinc-100 lg:block">
            ВелоПрокат
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-emerald-400/10 text-emerald-400'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/5 p-4 text-xs text-zinc-600">
          <span className="hidden lg:block">Мини-CRM проката e-bike</span>
        </div>
      </aside>

      {/* Контент */}
      <div className="ml-16 flex min-h-screen flex-1 flex-col lg:ml-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/5 bg-surface/80 px-6 backdrop-blur">
          <div className="relative max-w-md flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="text"
              placeholder="Поиск…"
              className="input pl-9"
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-zinc-400 sm:block">{user?.fullName}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-semibold text-emerald-400">
              {initial}
            </span>
            <button
              type="button"
              onClick={logout}
              title="Выйти"
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
