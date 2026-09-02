import { useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown, ChevronUp, History } from 'lucide-react'
import { formatDateTime, formatMoney } from '../lib/format'

/** Минимальный контракт события ленты (AssetEvent и RentalEvent ему удовлетворяют) */
export interface EventFeedItem {
  id: string
  type: string
  /** ISO-строка */
  date: string
  comment: string
  /** Сумма операции, ₽; null если событие без денег */
  amount: number | null
  createdByName: string | null
}

/** Сколько последних событий показываем до кнопки «Показать все» */
const VISIBLE_LIMIT = 5

/**
 * Лента событий (история аренды / история актива): компактные строки с иконкой по типу,
 * справа — дата записи и автор. Показывает последние 5, остальные — по кнопке «Показать все».
 * События приходят отсортированными новыми сверху.
 */
export function EventFeed<T extends EventFeedItem>({
  events,
  icons,
  labels,
  renderExtra,
}: {
  events: T[]
  /** Иконка по типу события; неизвестный тип — History */
  icons: Record<string, LucideIcon>
  labels: Record<string, string>
  /** Доп. строка под текстом события (напр. сдвиг конца периода у продления аренды) */
  renderExtra?: (event: T) => ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? events : events.slice(0, VISIBLE_LIMIT)

  if (events.length === 0) {
    return <p className="text-sm text-zinc-500">Событий пока нет</p>
  }

  return (
    <>
      <ul>
        {visible.map((event) => {
          const Icon = icons[event.type] ?? History
          return (
            <li
              key={event.id}
              className="flex items-center gap-3 border-b border-white/5 py-2 text-sm last:border-0"
            >
              <span className="rounded-lg bg-white/5 p-2 text-zinc-400">
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-zinc-300">{labels[event.type] ?? event.type}</span>
                {event.comment && <span className="text-zinc-500"> — {event.comment}</span>}
                {event.amount != null && event.amount > 0 && (
                  <span className="text-zinc-400"> · {formatMoney(event.amount)}</span>
                )}
                {renderExtra?.(event)}
              </div>
              <div className="shrink-0 text-right">
                <span className="block text-xs text-zinc-500">{formatDateTime(event.date)}</span>
                {event.createdByName && (
                  <span className="block text-xs text-zinc-600">{event.createdByName}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {events.length > VISIBLE_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-zinc-200"
        >
          {expanded ? (
            <>
              <ChevronUp size={14} />
              Свернуть
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              Показать все ({events.length})
            </>
          )}
        </button>
      )}
    </>
  )
}
