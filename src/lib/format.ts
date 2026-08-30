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

/** Сегодня (локальная дата) в формате date-input — для max у дат, которые нельзя ставить в будущем. */
export function todayDateInput(): string {
  return isoToDateInput(new Date().toISOString())
}

export const formatMoney = (value: number) => moneyFormatter.format(value)

export const formatNumber = (value: number) => numberFormatter.format(value)

/** Сколько полных часов аренда просрочена (0, если не просрочена) */
export function hoursOverdue(plannedEndAt: string): number {
  const diff = Date.now() - new Date(plannedEndAt).getTime()
  return diff > 0 ? Math.floor(diff / 3_600_000) : 0
}

/** Человекочитаемое время до момента в будущем: «2 дн. 5 ч.» / «7 ч.» / «12 мин.» */
export function formatRemaining(until: string): string {
  const diff = new Date(until).getTime() - Date.now()
  if (diff <= 0) return '—'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return minutes > 0 ? `${minutes} мин.` : 'менее минуты'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч.`
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest === 0 ? `${days} дн.` : `${days} дн. ${rest} ч.`
}

/** Человекочитаемая длительность просрочки: «2 дн. 5 ч.» / «7 ч.» / «12 мин.» */
export function formatOverdue(plannedEndAt: string): string {
  const diff = Date.now() - new Date(plannedEndAt).getTime()
  if (diff <= 0) return '—'
  const hours = Math.floor(diff / 3_600_000)
  if (hours === 0) {
    const minutes = Math.floor(diff / 60_000)
    return minutes > 0 ? `${minutes} мин.` : 'менее минуты'
  }
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  if (days === 0) return `${rest} ч.`
  if (rest === 0) return `${days} дн.`
  return `${days} дн. ${rest} ч.`
}

/** Русские формы для единиц срока: [1, 2-4, 5+] */
const DURATION_FORMS = {
  hour: ['час', 'часа', 'часов'],
  day: ['день', 'дня', 'дней'],
  week: ['неделя', 'недели', 'недель'],
  month: ['месяц', 'месяца', 'месяцев'],
} as const

function plural(n: number, forms: readonly [string, string, string]): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  const mod10 = n % 10
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}

const DURATION_UNIT_SECONDS = { hour: 3600, day: 86400, week: 604800, month: 2592000 } as const
type DurationUnit = keyof typeof DURATION_UNIT_SECONDS

/**
 * Длительность периода аренды в целых единицах: «3 дня», «2 недели».
 * Единица — наибольшая, на которую срок делится без остатка; null, если дат нет/срок <= 0.
 */
export function splitDuration(
  startAt: string | null | undefined,
  plannedEndAt: string | null | undefined,
): { value: number; unit: DurationUnit } | null {
  if (!startAt || !plannedEndAt) return null
  const seconds = Math.round(
    (new Date(plannedEndAt).getTime() - new Date(startAt).getTime()) / 1000,
  )
  if (seconds <= 0) return null
  for (const unit of ['month', 'week', 'day', 'hour'] as const) {
    const unitSeconds = DURATION_UNIT_SECONDS[unit]
    if (seconds % unitSeconds === 0) {
      return { value: seconds / unitSeconds, unit }
    }
  }
  return { value: Math.round((seconds / 3600) * 10) / 10, unit: 'hour' }
}

/** «3 дня» / «2 недели» по датам периода аренды */
export function formatDuration(
  startAt: string | null | undefined,
  plannedEndAt: string | null | undefined,
): string {
  const duration = splitDuration(startAt, plannedEndAt)
  if (!duration) return '—'
  return `${duration.value} ${plural(duration.value, DURATION_FORMS[duration.unit])}`
}

/** «5 дней» / «1 неделя» по значению и единице срока */
export function formatDurationValue(value: number, unit: DurationUnit): string {
  return `${value} ${plural(value, DURATION_FORMS[unit])}`
}

/** Короткий лейбл единицы срока: «день» (для «₽/день») */
export function durationUnitLabel(unit: DurationUnit): string {
  return DURATION_FORMS[unit][0]
}
