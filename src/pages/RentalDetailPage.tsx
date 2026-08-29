import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Undo2, X } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { Rental, RentalItem } from '../types'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { formatDateTime, formatMoney, formatOverdue } from '../lib/format'
import {
  assetTypeLabels,
  rentalKindLabels,
  rentalStatusLabels,
  rentalStatusTones,
  tariffUnitLabels,
} from '../lib/labels'

export function RentalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [rental, setRental] = useState<Rental | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const showError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback)

  const loadRental = useCallback(async () => {
    try {
      setRental(await api<Rental>(`/rentals/${id}`))
      setError('')
    } catch (err) {
      showError(err, 'Не удалось загрузить аренду')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadRental()
  }, [loadRental])

  const returnItem = async (itemId: string) => {
    try {
      await api(`/rentals/${id}/items/${itemId}/return`, { method: 'POST' })
      await loadRental()
    } catch (err) {
      showError(err, 'Не удалось вернуть позицию')
    }
  }

  const cancelRental = async () => {
    if (!rental) return
    if (!window.confirm(`Отменить аренду клиента ${rental.customerName}?`)) return
    try {
      await api(`/rentals/${rental.id}/cancel`, { method: 'POST' })
      await loadRental()
    } catch (err) {
      showError(err, 'Не удалось отменить аренду')
    }
  }

  const backLink = (
    <button
      type="button"
      onClick={() => navigate('/rentals')}
      className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
    >
      <ArrowLeft size={16} />
      К арендам
    </button>
  )

  if (loading) {
    return <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
  }

  if (!rental) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error || 'Аренда не найдена'}
        </p>
      </div>
    )
  }

  const isActive = rental.status === 'active' || rental.status === 'overdue'
  // Группировка комплекта: верхнеуровневые позиции + их дочерние АКБ
  const topLevelItems = rental.items.filter((item) => !item.parentItemId)
  const childrenOf = (parentId: string): RentalItem[] =>
    rental.items.filter((item) => item.parentItemId === parentId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        {backLink}
        <h1 className="text-xl font-semibold text-zinc-100">Аренда · {rental.customerName}</h1>
        <StatusBadge
          label={rentalStatusLabels[rental.status]}
          tone={rentalStatusTones[rental.status]}
        />
        <span
          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
            rental.kind === 'rent_to_own'
              ? 'bg-amber-400/10 text-amber-400 ring-amber-400/20'
              : 'bg-zinc-400/10 text-zinc-400 ring-zinc-400/20'
          }`}
        >
          {rentalKindLabels[rental.kind]}
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {rental.status === 'overdue' && (
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-medium text-red-400">
          Аренда просрочена
          {rental.plannedEndAt ? ` на ${formatOverdue(rental.plannedEndAt)}` : ''} — свяжитесь с
          клиентом
        </p>
      )}

      {/* Информация */}
      <section className="panel p-5">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Клиент</dt>
            <dd className="text-zinc-300">{rental.customerName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Начало</dt>
            <dd className="text-zinc-300">{formatDateTime(rental.startAt)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">План. окончание</dt>
            <dd className="text-zinc-300">
              {rental.plannedEndAt ? formatDateTime(rental.plannedEndAt) : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Залог</dt>
            <dd className="text-zinc-300">{formatMoney(rental.deposit)}</dd>
          </div>
          {rental.buyoutPrice != null && (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Цена выкупа</dt>
              <dd className="text-zinc-300">{formatMoney(rental.buyoutPrice)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Сумма</dt>
            <dd className="text-zinc-300">{formatMoney(rental.amount)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Оплачено</dt>
            <dd className="text-zinc-300">{formatMoney(rental.paidAmount)}</dd>
          </div>
          {rental.comment && (
            <div className="flex justify-between gap-4 sm:col-span-2">
              <dt className="text-zinc-500">Комментарий</dt>
              <dd className="text-right text-zinc-300">{rental.comment}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Позиции */}
      <section className="panel overflow-hidden">
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="font-semibold text-zinc-100">Позиции</h2>
        </div>
        {topLevelItems.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Позиций нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">Актив</th>
                  <th className="th">Тип</th>
                  <th className="th text-right">Тариф</th>
                  <th className="th">Возврат</th>
                  {isActive && <th className="th" />}
                </tr>
              </thead>
              <tbody>
                {topLevelItems.map((item, index) => (
                  <ItemRows
                    key={item.id}
                    item={item}
                    childrenItems={childrenOf(item.id)}
                    zebra={index % 2 === 1}
                    isActive={isActive}
                    onReturn={returnItem}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isActive && (
        <button
          type="button"
          onClick={cancelRental}
          className="inline-flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-400/20"
        >
          <X size={16} />
          Отменить аренду
        </button>
      )}
    </div>
  )
}

function ItemRows({
  item,
  childrenItems,
  zebra,
  isActive,
  onReturn,
}: {
  item: RentalItem
  childrenItems: RentalItem[]
  zebra: boolean
  isActive: boolean
  onReturn: (itemId: string) => void
}) {
  const rowClass = `transition hover:bg-white/5 ${zebra ? 'bg-white/[0.02]' : ''}`
  return (
    <>
      <ItemRow
        item={item}
        rowClass={rowClass}
        isActive={isActive}
        onReturn={onReturn}
        isParent={childrenItems.length > 0}
      />
      {childrenItems.map((child) => (
        <ItemRow
          key={child.id}
          item={child}
          rowClass={rowClass}
          isActive={isActive}
          onReturn={onReturn}
          isChild
        />
      ))}
    </>
  )
}

function ItemRow({
  item,
  rowClass,
  isActive,
  onReturn,
  isChild = false,
  isParent = false,
}: {
  item: RentalItem
  rowClass: string
  isActive: boolean
  onReturn: (itemId: string) => void
  isChild?: boolean
  isParent?: boolean
}) {
  return (
    <tr className={rowClass}>
      <td className="td">
        <span className={isChild ? 'pl-6 text-zinc-400' : 'font-medium text-zinc-200'}>
          {isChild && '└ '}
          {item.assetName}{' '}
          <span className="font-mono text-xs text-zinc-500">{item.inventoryNumber}</span>
        </span>
      </td>
      <td className="td text-zinc-500">{assetTypeLabels[item.assetType]}</td>
      <td className="td text-right">
        {formatMoney(item.rate)}/{tariffUnitLabels[item.tariffUnit]}
      </td>
      <td className="td text-zinc-500">
        {item.returnedAt ? `Возвращён ${formatDateTime(item.returnedAt)}` : '—'}
      </td>
      {isActive && (
        <td className="td text-right">
          {!item.returnedAt && (
            <button
              type="button"
              onClick={() => onReturn(item.id)}
              title={isParent ? 'Вернёт весь комплект (включая АКБ)' : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-400/20"
            >
              <Undo2 size={14} />
              Вернуть
            </button>
          )}
        </td>
      )}
    </tr>
  )
}
