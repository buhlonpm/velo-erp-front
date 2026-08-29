import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bike,
  CheckCircle2,
  ClipboardList,
  Wallet,
  Wrench,
} from 'lucide-react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, PERMISSIONS } from '../auth/permissions'
import type { Asset, Rental, Transaction } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { StatCard } from '../components/StatCard'
import { EmptyState } from '../components/EmptyState'
import { formatDateTime, formatMoney, formatOverdue } from '../lib/format'
import { rentalStatusLabels, rentalStatusTones } from '../lib/labels'

/** Краткое описание состава аренды: «EV-001 + 2» */
function compositionLabel(rental: Rental): string {
  const first = rental.items[0]
  if (!first) return '—'
  const rest = rental.items.length - 1
  return `${first.assetName} (${first.inventoryNumber})${rest > 0 ? ` + ${rest}` : ''}`
}

export function DashboardPage() {
  const { user } = useAuth()
  const canViewFinance = hasPermission(user, PERMISSIONS.FINANCE_VIEW)

  const [assets, setAssets] = useState<Asset[]>([])
  const [rentals, setRentals] = useState<Rental[]>([])
  const [monthRevenue, setMonthRevenue] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const requests: [Promise<Asset[]>, Promise<Rental[]>, Promise<Transaction[]> | null] = [
      api<Asset[]>('/assets'),
      api<Rental[]>('/rentals'),
      canViewFinance ? api<Transaction[]>('/finance/transactions') : null,
    ]
    Promise.all(requests)
      .then(([assetList, rentalList, transactions]) => {
        setAssets(assetList)
        setRentals(rentalList)
        if (transactions) {
          // Выручка за текущий месяц: приходы, фильтр по дате локально
          const now = new Date()
          const revenue = transactions
            .filter((t) => {
              if (t.kind !== 'income') return false
              const date = new Date(t.date)
              return (
                date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
              )
            })
            .reduce((sum, t) => sum + t.amount, 0)
          setMonthRevenue(revenue)
        }
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить дашборд'),
      )
      .finally(() => setLoading(false))
  }, [canViewFinance])

  const available = assets.filter((asset) => asset.status === 'available').length
  const rented = assets.filter((asset) => asset.status === 'rented').length
  const inMaintenance = assets.filter((asset) => asset.status === 'maintenance').length

  const overdueRentals = rentals.filter((rental) => rental.status === 'overdue')
  const latestRentals = [...rentals]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5)

  if (loading) {
    return <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-100">Дашборд</h1>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard title="Всего активов" value={String(assets.length)} icon={Bike} />
        <StatCard title="Свободно" value={String(available)} icon={CheckCircle2} accent />
        <StatCard title="В аренде" value={String(rented)} icon={ClipboardList} />
        <StatCard title="На обслуживании" value={String(inMaintenance)} icon={Wrench} />
        {monthRevenue != null && (
          <StatCard title="Выручка за месяц" value={formatMoney(monthRevenue)} icon={Wallet} accent />
        )}
      </div>

      {/* Просроченные аренды */}
      <section className="panel">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="font-semibold text-zinc-100">Просроченные аренды</h2>
          {overdueRentals.length > 0 && (
            <span className="rounded-full bg-red-400/10 px-2.5 py-0.5 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-400/20">
              {overdueRentals.length}
            </span>
          )}
        </div>
        {overdueRentals.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Просроченных аренд нет"
            description="Все клиенты возвращают технику вовремя"
          />
        ) : (
          <ul className="divide-y divide-white/5">
            {overdueRentals.map((rental) => (
              <li
                key={rental.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
              >
                {rental.plannedEndAt && (
                  <span className="rounded-full bg-red-400/10 px-2.5 py-0.5 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-400/20">
                    +{formatOverdue(rental.plannedEndAt)}
                  </span>
                )}
                <div className="min-w-0">
                  <span className="font-medium text-zinc-200">{rental.customerName}</span>
                  <span className="ml-2 text-sm text-zinc-500">{compositionLabel(rental)}</span>
                </div>
                <span className="ml-auto text-sm text-zinc-500">
                  План: {rental.plannedEndAt ? formatDateTime(rental.plannedEndAt) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
        {latestRentals.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Аренд пока нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">Клиент</th>
                  <th className="th">Состав</th>
                  <th className="th">Начало</th>
                  <th className="th text-right">Сумма</th>
                  <th className="th">Статус</th>
                </tr>
              </thead>
              <tbody>
                {latestRentals.map((rental, index) => (
                  <tr
                    key={rental.id}
                    className={`transition hover:bg-white/5 ${
                      index % 2 === 1 ? 'bg-white/[0.02]' : ''
                    }`}
                  >
                    <td className="td font-medium text-zinc-200">{rental.customerName}</td>
                    <td className="td">{compositionLabel(rental)}</td>
                    <td className="td text-zinc-500">{formatDateTime(rental.startAt)}</td>
                    <td className="td text-right">{formatMoney(rental.amount)}</td>
                    <td className="td">
                      <StatusBadge
                        label={rentalStatusLabels[rental.status]}
                        tone={rentalStatusTones[rental.status]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
