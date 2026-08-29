import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Plus } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { Rental } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { formatDateTime, formatMoney } from '../lib/format'
import { rentalKindLabels, rentalStatusLabels, rentalStatusTones } from '../lib/labels'

type StatusFilter = 'all' | 'draft' | 'active' | 'overdue' | 'completed' | 'completed_early'

const statusFilters: [StatusFilter, string][] = [
  ['all', 'Все'],
  ['draft', 'Черновики'],
  ['active', 'Активные'],
  ['overdue', 'Просроченные'],
  ['completed', 'Завершённые'],
  ['completed_early', 'Завершены досрочно'],
]

/** Краткое описание состава аренды: «EV-001 + 2» (дочерние позиции не считаем) */
function compositionLabel(rental: Rental): string {
  const topLevel = rental.items.filter((item) => !item.parentItemId)
  const first = topLevel[0]
  if (!first) return '—'
  const rest = topLevel.length - 1
  return `${first.assetName} (${first.inventoryNumber})${rest > 0 ? ` + ${rest}` : ''}`
}

export function RentalsPage() {
  const navigate = useNavigate()
  const [rentals, setRentals] = useState<Rental[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const loadRentals = useCallback(async () => {
    setLoading(true)
    try {
      const query = statusFilter === 'all' ? '' : `?status=${statusFilter}`
      setRentals(await api<Rental[]>(`/rentals${query}`))
      setError('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить аренды')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadRentals()
  }, [loadRentals])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Аренды</h1>
        <button type="button" className="btn-primary" onClick={() => navigate('/rentals/new')}>
          <Plus size={16} />
          Новая аренда
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex w-fit gap-1 rounded-lg border border-white/10 p-1">
        {statusFilters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              statusFilter === value
                ? 'bg-emerald-400/10 text-emerald-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="panel overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
        ) : rentals.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Аренд не найдено"
            description="Измените фильтр или создайте аренду кнопкой «Новая аренда»"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">Клиент</th>
                  <th className="th">Состав</th>
                  <th className="th">Начало</th>
                  <th className="th">План. окончание</th>
                  <th className="th text-right">Сумма</th>
                  <th className="th text-right">Оплачено</th>
                  <th className="th">Статус</th>
                  <th className="th">Тип</th>
                </tr>
              </thead>
              <tbody>
                {rentals.map((rental, index) => (
                  <tr
                    key={rental.id}
                    onClick={() => navigate(`/rentals/${rental.id}`)}
                    className={`cursor-pointer transition hover:bg-white/5 ${
                      index % 2 === 1 ? 'bg-white/[0.02]' : ''
                    }`}
                  >
                    <td className="td font-medium text-zinc-200">{rental.customerName}</td>
                    <td className="td">{compositionLabel(rental)}</td>
                    <td className="td text-zinc-500">{formatDateTime(rental.startAt)}</td>
                    <td className="td text-zinc-500">
                      {rental.plannedEndAt ? formatDateTime(rental.plannedEndAt) : '—'}
                    </td>
                    <td className="td text-right">{formatMoney(rental.amount)}</td>
                    <td className="td text-right text-zinc-500">{formatMoney(rental.paidAmount)}</td>
                    <td className="td">
                      <StatusBadge
                        label={rentalStatusLabels[rental.status]}
                        tone={rentalStatusTones[rental.status]}
                      />
                    </td>
                    <td className="td">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          rental.kind === 'rent_to_own'
                            ? 'bg-amber-400/10 text-amber-400 ring-amber-400/20'
                            : 'bg-zinc-400/10 text-zinc-400 ring-zinc-400/20'
                        }`}
                      >
                        {rentalKindLabels[rental.kind]}
                      </span>
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
