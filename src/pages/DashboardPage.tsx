import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BatteryCharging,
  Bike,
  Clock,
  Plus,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { AssetType, Dashboard, DashboardRental, DashboardTypeStats } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { formatDateTime, formatMoney, formatOverdue, formatRemaining } from '../lib/format'
import { rentalStatusLabels, rentalStatusTones } from '../lib/labels'

const typeLabels: Record<AssetType, string> = {
  bike: 'Велосипеды',
  battery: 'Аккумуляторы',
  charger: 'Зарядники',
}

const typeIcons: Record<AssetType, LucideIcon> = {
  bike: Bike,
  battery: BatteryCharging,
  charger: Zap,
}

/** Строки матрицы парка: статус → подпись и цвет точки */
const statusRows: { key: keyof Omit<DashboardTypeStats, 'type' | 'total' | 'mounted'>; label: string; dot: string }[] = [
  { key: 'available', label: 'Свободно', dot: 'bg-emerald-400' },
  { key: 'rented', label: 'В аренде', dot: 'bg-sky-400' },
  { key: 'reserved', label: 'В резерве', dot: 'bg-amber-400' },
  { key: 'maintenance', label: 'На обслуживании', dot: 'bg-orange-400' },
]

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // весь дашборд — одним запросом
    api<Dashboard>('/dashboard')
      .then(setDashboard)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить дашборд'),
      )
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
  }

  const totalAssets = dashboard?.assets.reduce((sum, stats) => sum + stats.total, 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Дашборд</h1>
        <Link to="/rentals/new" className="btn-primary">
          <Plus size={16} />
          Создать аренду
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {dashboard && (
        <>
          {/* Парк: матрица «статус × тип» одним блоком */}
          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <h2 className="font-semibold text-zinc-100">Парк</h2>
              <span className="text-sm text-zinc-500">всего {totalAssets}</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th" />
                  {dashboard.assets.map((stats) => {
                    const Icon = typeIcons[stats.type]
                    return (
                      <th key={stats.type} className="th text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon size={14} className="text-zinc-500" />
                          {typeLabels[stats.type]}
                          <span className="font-normal text-zinc-600">{stats.total}</span>
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {statusRows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-white/5 transition last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="td">
                      <span className="inline-flex items-center gap-2 text-zinc-400">
                        <span className={`size-2 rounded-full ${row.dot}`} />
                        {row.label}
                      </span>
                    </td>
                    {dashboard.assets.map((stats) => (
                      <td key={stats.type} className="td text-center">
                        <span
                          className={
                            stats[row.key] > 0
                              ? 'text-base font-semibold text-zinc-100'
                              : 'text-sm text-zinc-700'
                          }
                        >
                          {stats[row.key]}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Просроченные аренды — только когда есть; у rent_to_own просрочка считается от ближайшего платежа */}
          {dashboard.overdue.length > 0 && (
            <RentalSection
              title="Просроченные аренды"
              count={dashboard.overdue.length}
              tone="red"
              rentals={dashboard.overdue}
              badge={(rental) => {
                const anchor = rental.nextPaymentDue ?? rental.plannedEndAt
                return anchor ? `+${formatOverdue(anchor)}` : '—'
              }}
            />
          )}

          {/* Подходящие к концу (осталось < 20% срока) — только когда есть; у rent_to_own — «к оплате» по графику */}
          {dashboard.endingSoon.length > 0 && (
            <RentalSection
              title="Подходят к концу"
              count={dashboard.endingSoon.length}
              tone="amber"
              rentals={dashboard.endingSoon}
              badge={(rental) => {
                const anchor = rental.nextPaymentDue ?? rental.plannedEndAt
                return anchor ? `осталось ${formatRemaining(anchor)}` : '—'
              }}
            />
          )}

          {/* Последние аренды */}
          <section className="panel">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <h2 className="font-semibold text-zinc-100">Последние аренды</h2>
              <Link
                to="/rentals"
                className="text-sm text-emerald-400 transition hover:text-emerald-300"
              >
                Все аренды →
              </Link>
            </div>
            {dashboard.latest.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">Аренд пока нет</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {dashboard.latest.map((rental) => (
                  <li key={rental.id}>
                    <Link
                      to={`/rentals/${rental.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-white/[0.03]"
                    >
                      <StatusBadge
                        label={rentalStatusLabels[rental.status]}
                        tone={rentalStatusTones[rental.status]}
                      />
                      <div className="min-w-0">
                        <span className="font-medium text-zinc-200">{rental.customerName}</span>
                        <span className="ml-2 text-sm text-zinc-500">{rental.composition}</span>
                      </div>
                      <span className="ml-auto text-right">
                        <span className="block text-sm font-medium text-zinc-200">
                          {formatMoney(rental.amount)}
                        </span>
                        <span className="block text-xs text-zinc-600">
                          {formatDateTime(rental.startAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** Список аренд дашборда (просроченные / подходящие к концу) */
function RentalSection({
  title,
  count,
  tone,
  rentals,
  badge,
}: {
  title: string
  count: number
  tone: 'red' | 'amber'
  rentals: DashboardRental[]
  badge: (rental: DashboardRental) => string
}) {
  const badgeClass =
    tone === 'red'
      ? 'bg-red-400/10 text-red-400 ring-red-400/20'
      : 'bg-amber-400/10 text-amber-400 ring-amber-400/20'
  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <h2 className="font-semibold text-zinc-100">{title}</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass}`}
        >
          {count}
        </span>
      </div>
      <ul className="divide-y divide-white/5">
        {rentals.map((rental) => (
          <li key={rental.id}>
            <Link
              to={`/rentals/${rental.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-white/[0.03]"
            >
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass}`}
              >
                <Clock size={12} />
                {badge(rental)}
              </span>
              <div className="min-w-0">
                <span className="font-medium text-zinc-200">{rental.customerName}</span>
                <span className="ml-2 text-sm text-zinc-500">{rental.composition}</span>
              </div>
              <span className="ml-auto text-sm text-zinc-500">
                {rental.nextPaymentDue
                  ? `Платёж: ${formatDateTime(rental.nextPaymentDue)}`
                  : `План: ${rental.plannedEndAt ? formatDateTime(rental.plannedEndAt) : '—'}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
