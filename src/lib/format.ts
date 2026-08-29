const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('ru-RU')

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatDateTime = (iso: string) => {
  const date = parseDate(iso)
  return date ? dateTimeFormatter.format(date) : '—'
}

export const formatDate = (iso: string) => {
  const date = parseDate(iso)
  return date ? dateFormatter.format(date) : '—'
}

/** ISO (UTC) из значения input type="date" («YYYY-MM-DD»): трактуем как локальную полночь, а не полночь UTC */
export function dateInputToIso(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1).toISOString()
}

/** Значение для input type="date" из ISO-строки: локальная дата (обратно к dateInputToIso) */
export function isoToDateInput(iso: string | null | undefined): string {
  const date = parseDate(iso)
  if (!date) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const formatMoney = (value: number) => moneyFormatter.format(value)

export const formatNumber = (value: number) => numberFormatter.format(value)

/** Сколько полных часов аренда просрочена (0, если не просрочена) */
export function hoursOverdue(plannedEndAt: string): number {
  const diff = Date.now() - new Date(plannedEndAt).getTime()
  return diff > 0 ? Math.floor(diff / 3_600_000) : 0
}

/** Человекочитаемая длительность просрочки: «2 дн. 5 ч.» / «7 ч.» */
export function formatOverdue(plannedEndAt: string): string {
  const hours = hoursOverdue(plannedEndAt)
  if (hours <= 0) return '—'
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  if (days === 0) return `${rest} ч.`
  if (rest === 0) return `${days} дн.`
  return `${days} дн. ${rest} ч.`
}
