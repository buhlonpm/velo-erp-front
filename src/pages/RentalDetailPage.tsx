import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Banknote, Check, CheckCircle2, ClipboardList, History, KeyRound, Lock, Pencil, Trash2, Undo2, X } from 'lucide-react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, PERMISSIONS } from '../auth/permissions'
import type { AccountOption, Customer, Rental, RentalEvent, RentalExtension, RentalItem, TariffUnit, Transaction } from '../types'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { StatusBadge } from '../components/StatusBadge'
import { durationUnitLabel, formatDateTime, formatDuration, formatDurationValue, formatMoney, formatOverdue, splitDuration } from '../lib/format'
import {
  assetTypeLabels,
  rentalEventTypeLabels,
  rentalKindLabels,
  rentalStatusLabels,
  rentalStatusTones,
  tariffUnitLabels,
} from '../lib/labels'

/** Значение для input datetime-local из Date (в локальной TZ) */
function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function RentalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canViewFinance = hasPermission(user, PERMISSIONS.FINANCE_VIEW)
  const [rental, setRental] = useState<Rental | null>(null)
  const [events, setEvents] = useState<RentalEvent[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [customerPhone, setCustomerPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Модалки: приём оплаты, история оплат (платежи и возвраты), выдача (черновик),
  // завершение (активная), досрочный возврат с рефандом, продление
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [earlyReturnOpen, setEarlyReturnOpen] = useState(false)
  const [extendOpen, setExtendOpen] = useState(false)
  const [editExtension, setEditExtension] = useState<RentalExtension | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const showError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback)

  const loadRental = useCallback(async () => {
    try {
      const [rentalData, eventList] = await Promise.all([
        api<Rental>(`/rentals/${id}`),
        api<RentalEvent[]>(`/rentals/${id}/events`),
      ])
      setRental(rentalData)
      setEvents(eventList)
      setError('')
    } catch (err) {
      showError(err, 'Не удалось загрузить аренду')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadRental()
    api<AccountOption[]>('/finance/accounts/options')
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }, [loadRental])

  // Телефон клиента для инфоблока (в Rental его нет — догружаем карточку клиента)
  useEffect(() => {
    if (!rental) return
    api<Customer>(`/customers/${rental.customerId}`)
      .then((customer) => setCustomerPhone(customer.phone))
      .catch(() => setCustomerPhone(''))
  }, [rental])

  const cancelRental = async () => {
    if (!rental) return
    if (!window.confirm(`Отменить черновик аренды клиента ${rental.customerName}? Активы освободятся из резерва.`))
      return
    try {
      await api(`/rentals/${rental.id}/cancel`, { method: 'POST' })
      await loadRental()
    } catch (err) {
      showError(err, 'Не удалось отменить аренду')
    }
  }

  const deleteExtension = async (extension: RentalExtension) => {
    if (!rental) return
    if (!window.confirm('Удалить продление? Срок аренды пересчитается.')) return
    try {
      await api(`/rentals/${rental.id}/extensions/${extension.id}`, { method: 'DELETE' })
      await loadRental()
    } catch (err) {
      showError(err, 'Не удалось удалить продление')
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

  const isDraft = rental.status === 'draft'
  const isActive = rental.status === 'active' || rental.status === 'overdue'
  const isCompleted = rental.status === 'completed' || rental.status === 'completed_early'
  // Удаление без следа — только ADMIN и только финальные статусы (бэк тоже проверяет, 403/409)
  const canDelete =
    user?.role === 'ADMIN' &&
    (isCompleted || rental.status === 'cancelled')
  const canExtend = isActive && rental.kind === 'rent' && rental.plannedEndAt != null
  const remaining = Math.max(0, rental.amount - rental.paidAmount)
  // Группировка комплекта: верхнеуровневые позиции + их дочерние АКБ/зарядники
  const topLevelItems = rental.items.filter((item) => !item.parentItemId)
  const childrenOf = (parentId: string): RentalItem[] =>
    rental.items.filter((item) => item.parentItemId === parentId)
  // Срок и тариф из заявки (rent): длительность периода и сумма цен позиций за единицу срока
  const duration = splitDuration(rental.startAt, rental.plannedEndAt)
  const rateSum = topLevelItems.reduce((sum, item) => sum + item.rate, 0)
  // Продления аренды (?? [] — на случай старого бэка без поля в ответе)
  const extensions = rental.extensions ?? []

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
          {rental.plannedEndAt ? ` на ${formatOverdue(rental.plannedEndAt)}` : ''} — продлите её
          или свяжитесь с клиентом
        </p>
      )}

      {/* Оплата — сводка всегда; приём платежей — пока аренда не закрыта и есть остаток */}
      <section className="panel border-emerald-400/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-8">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Начислено</p>
              <p className="mt-0.5 text-xl font-semibold text-zinc-100">
                {formatMoney(rental.amount)}
                {isCompleted && (
                  <span className="ml-2 align-middle text-xs font-normal normal-case text-zinc-500">
                    зафиксирована
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Оплачено</p>
              <p className="mt-0.5 text-xl font-semibold text-emerald-400">
                {formatMoney(rental.paidAmount)}
              </p>
            </div>
            {rental.refundedAmount > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Возвращено</p>
                <p className="mt-0.5 text-xl font-semibold text-red-400">
                  {formatMoney(rental.refundedAmount)}
                </p>
              </div>
            )}
            {(isDraft || isActive) && (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Остаток</p>
                <p
                  className={`mt-0.5 text-xl font-semibold ${
                    remaining > 0 ? 'text-amber-400' : 'text-zinc-500'
                  }`}
                >
                  {formatMoney(remaining)}
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canViewFinance && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-400"
              >
                <History size={16} />
                История оплат
              </button>
            )}
            {(isDraft || isActive) &&
              (remaining > 0 ? (
                <button
                  type="button"
                  onClick={() => setPaymentOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-400/20"
                >
                  <Banknote size={16} />
                  Принять оплату
                </button>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-400">
                  <CheckCircle2 size={16} />
                  Оплачено полностью
                </span>
              ))}
          </div>
        </div>
      </section>

      {/* Информация */}
      <section className="panel p-5">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Клиент</dt>
              <dd className="text-right text-zinc-300">
                {rental.customerName}
                {customerPhone && (
                  <span className="block text-xs text-zinc-500">{customerPhone}</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{isDraft ? 'Начало периода (план)' : 'Начало периода'}</dt>
              <dd className="text-zinc-300">{formatDateTime(rental.startAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Конец периода</dt>
              <dd className="text-zinc-300">
                {rental.plannedEndAt ? formatDateTime(rental.plannedEndAt) : '—'}
              </dd>
            </div>
          </div>
          <div className="space-y-2">
            {rental.kind === 'rent' && duration && (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Срок</dt>
                  <dd className="text-zinc-300">
                    {formatDuration(rental.startAt, rental.plannedEndAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Тариф</dt>
                  <dd className="text-zinc-300">
                    {formatMoney(rateSum)}/{durationUnitLabel(duration.unit)}
                  </dd>
                </div>
              </>
            )}
            {rental.buyoutPrice != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Цена выкупа</dt>
                <dd className="text-zinc-300">{formatMoney(rental.buyoutPrice)}</dd>
              </div>
            )}
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
                </tr>
              </thead>
              <tbody>
                {topLevelItems.map((item, index) => (
                  <ItemRows
                    key={item.id}
                    item={item}
                    childrenItems={childrenOf(item.id)}
                    zebra={index % 2 === 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Действия по статусу */}
      {(isDraft || isActive) && (
        <div className="flex flex-wrap items-center gap-3">
          {isDraft && (
            <>
              <button
                type="button"
                onClick={() => setIssueOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-400/20"
              >
                <KeyRound size={16} />
                Выдать аренду
              </button>
              <button
                type="button"
                onClick={cancelRental}
                className="inline-flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-400/20"
              >
                <X size={16} />
                Отменить аренду
              </button>
            </>
          )}
          {isActive && (
            <>
              {/* Завершение — только после полной оплаты (бэк тоже проверяет, 409) */}
              <button
                type="button"
                onClick={() => setCompleteOpen(true)}
                disabled={remaining > 0}
                title={remaining > 0 ? `Не оплачено полностью — остаток ${formatMoney(remaining)}` : undefined}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 size={16} />
                Завершить аренду
              </button>
              {canExtend && (
                <button
                  type="button"
                  onClick={() => setExtendOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-400 transition hover:bg-sky-400/20"
                >
                  Продлить аренду
                </button>
              )}
              {remaining > 0 ? (
                <span className="text-xs text-zinc-600" title={`Остаток ${formatMoney(remaining)}`}>
                  Завершение и возврат — после полной оплаты
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setEarlyReturnOpen(true)}
                  className="text-xs text-zinc-500 underline transition hover:text-zinc-300"
                >
                  Вернуть досрочно
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Продления — история сдвигов конца периода, новые сверху; у active-аренды правка/удаление */}
      {extensions.length > 0 && (
        <section className="panel p-5">
          <h2 className="mb-3 font-semibold text-zinc-100">
            Продления <span className="text-sm font-normal text-zinc-500">· {extensions.length}</span>
          </h2>
          <ul>
            {[...extensions].reverse().map((extension) => (
              <li
                key={extension.id}
                className="flex items-center justify-between gap-4 border-b border-white/5 py-2 text-sm last:border-0"
              >
                <div>
                  <span className="text-zinc-300">
                    +{formatDurationValue(extension.duration, extension.durationUnit)}
                  </span>
                  {extension.createdByName && (
                    <span className="text-zinc-600"> · {extension.createdByName}</span>
                  )}
                  <span className="block text-xs text-zinc-600">
                    с {formatDateTime(extension.fromEndAt)} → по {formatDateTime(extension.toEndAt)}
                  </span>
                </div>
                {isActive && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditExtension(extension)}
                      title="Изменить продление"
                      className="rounded-lg p-2 text-zinc-500 transition hover:bg-sky-400/10 hover:text-sky-400"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteExtension(extension)}
                      title="Удалить продление"
                      className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* История аренды: создание, оплаты, выдача, продления, возвраты денег, завершение */}
      <section className="panel p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-zinc-100">
          <History size={16} className="text-zinc-500" />
          История
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">Событий пока нет</p>
        ) : (
          <ul>
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-start justify-between gap-4 border-b border-white/5 py-2 text-sm last:border-0"
              >
                <div>
                  <span className="text-zinc-300">{rentalEventTypeLabels[event.type]}</span>
                  {event.comment && <span className="text-zinc-500"> — {event.comment}</span>}
                  {event.amount != null && event.amount > 0 && (
                    <span className="text-zinc-400"> · {formatMoney(event.amount)}</span>
                  )}
                  {event.type === 'extension' && event.fromEndAt && event.toEndAt && (
                    <span className="block text-xs text-zinc-600">
                      Конец периода: {formatDateTime(event.fromEndAt)} →{' '}
                      {formatDateTime(event.toEndAt)}
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-xs text-zinc-500">{formatDateTime(event.date)}</span>
                  {event.createdByName && (
                    <span className="block text-xs text-zinc-600">{event.createdByName}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Удаление аренды без следа (ADMIN, только финальные статусы) */}
      {canDelete && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="text-xs text-red-400/60 underline transition hover:text-red-400"
          >
            Удалить аренду
          </button>
        </div>
      )}

      {/* Приём оплаты: сумма (по умолчанию остаток), дата, счёт */}
      {paymentOpen && (
        <PaymentModal
          remaining={remaining}
          accounts={accounts}
          onClose={() => setPaymentOpen(false)}
          onSubmit={async (amount, date, accountId) => {
            await api(`/rentals/${id}/payments`, {
              method: 'POST',
              body: JSON.stringify({
                amount: Number(amount),
                accountId,
                ...(date ? { date: new Date(date).toISOString() } : {}),
              }),
            })
            setPaymentOpen(false)
            await loadRental()
          }}
        />
      )}

      {/* История оплат: платежи и возвраты; правка даты/суммы и удаление (нужно право finance:view) */}
      {historyOpen && (
        <PaymentHistoryModal
          rentalId={rental.id}
          accounts={accounts}
          locked={isCompleted}
          onClose={() => setHistoryOpen(false)}
          onChanged={loadRental}
        />
      )}

      {/* Выдача черновика: дата фактической выдачи (период считается от неё) */}
      {issueOpen && (
        <IssueModal
          remaining={remaining}
          initialDate={toLocalInputValue(new Date(rental.startAt))}
          onClose={() => setIssueOpen(false)}
          onSubmit={async (date) => {
            await api(`/rentals/${id}/issue`, {
              method: 'POST',
              body: JSON.stringify(date ? { date: new Date(date).toISOString() } : {}),
            })
            setIssueOpen(false)
            await loadRental()
          }}
        />
      )}

      {/* Завершение аренды (обычный путь): дата приёма, без денежных полей */}
      {completeOpen && (
        <CompleteModal
          rental={rental}
          onClose={() => setCompleteOpen(false)}
          onSubmit={async (date) => {
            await api(`/rentals/${id}/complete`, {
              method: 'POST',
              body: JSON.stringify({ date: new Date(date).toISOString() }),
            })
            setCompleteOpen(false)
            await loadRental()
          }}
        />
      )}

      {/* Досрочный возврат: все позиции возвращаются; опционально — возврат денег клиенту */}
      {earlyReturnOpen && (
        <EarlyReturnModal
          rental={rental}
          accounts={accounts}
          onClose={() => setEarlyReturnOpen(false)}
          onSubmit={async (refundAmount, refundAccountId, date) => {
            const body = {
              date: new Date(date).toISOString(),
              ...(Number(refundAmount) > 0
                ? { refundAmount: Number(refundAmount), refundAccountId }
                : {}),
            }
            await api(`/rentals/${id}/early-return`, {
              method: 'POST',
              body: JSON.stringify(body),
            })
            setEarlyReturnOpen(false)
            await loadRental()
          }}
        />
      )}

      {/* Продление: только срок; оплата принимается отдельно через блок оплаты */}
      {extendOpen && rental && (
        <ExtendModal
          onClose={() => setExtendOpen(false)}
          onSubmit={async (duration, durationUnit) => {
            await api(`/rentals/${id}/extend`, {
              method: 'POST',
              body: JSON.stringify({
                duration: Number(duration),
                durationUnit,
              }),
            })
            setExtendOpen(false)
            await loadRental()
          }}
        />
      )}

      {/* Правка продления: срок пересчитается на бэке */}
      {editExtension && (
        <ExtendModal
          title="Изменить продление"
          submitLabel="Сохранить"
          initialDuration={String(editExtension.duration)}
          initialUnit={editExtension.durationUnit}
          onClose={() => setEditExtension(null)}
          onSubmit={async (duration, durationUnit) => {
            await api(`/rentals/${id}/extensions/${editExtension.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                duration: Number(duration),
                durationUnit,
              }),
            })
            setEditExtension(null)
            await loadRental()
          }}
        />
      )}

      {/* Удаление аренды: каскадно удаляются позиции, события, продления и операции по ней */}
      {deleteOpen && (
        <DeleteRentalModal
          customerName={rental.customerName}
          onClose={() => setDeleteOpen(false)}
          onSubmit={async () => {
            await api(`/rentals/${rental.id}`, { method: 'DELETE' })
            setDeleteOpen(false)
            navigate('/rentals')
          }}
        />
      )}
    </div>
  )
}

/**
 * История оплат аренды: и приходы (оплаты клиента), и расходы (возвраты денег). Дату и сумму
 * можно поправить, операцию — удалить (если была ошибка). Баланс счёта пересчитывать не нужно —
 * он вычисляемый. У завершённой аренды операции заморожены (бэк вернёт 409) — вместо кнопок замок.
 */
function PaymentHistoryModal({
  rentalId,
  accounts,
  locked,
  onClose,
  onChanged,
}: {
  rentalId: string
  accounts: AccountOption[]
  /** Аренда завершена — правка и удаление операций запрещены */
  locked: boolean
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [payments, setPayments] = useState<Transaction[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const accountName = (accountId: string) =>
    accounts.find((account) => account.id === accountId)?.name ?? '—'

  const load = useCallback(async () => {
    try {
      setPayments(await api<Transaction[]>(`/finance/transactions?rentalId=${rentalId}`))
      setError('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить историю оплат')
    }
  }, [rentalId])

  useEffect(() => {
    void load()
  }, [load])

  const savePayment = async (payment: Transaction, amount: string, date: string) => {
    setBusyId(payment.id)
    setError('')
    try {
      await api(`/finance/transactions/${payment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount: Number(amount),
          ...(date ? { date: new Date(date).toISOString() } : {}),
        }),
      })
      await load()
      await onChanged()
      onClose()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Не удалось сохранить ${payment.kind === 'expense' ? 'возврат' : 'оплату'}`
      )
    } finally {
      setBusyId(null)
    }
  }

  const deletePayment = async (payment: Transaction) => {
    const noun = payment.kind === 'expense' ? 'возврат' : 'оплату'
    if (!window.confirm(`Удалить ${noun} ${formatMoney(payment.amount)}?`)) return
    setBusyId(payment.id)
    setError('')
    try {
      await api(`/finance/transactions/${payment.id}`, { method: 'DELETE' })
      await load()
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Не удалось удалить ${noun}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal open title="История оплат" onClose={onClose}>
      <div className="space-y-3">
        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        {payments === null ? (
          <p className="text-sm text-zinc-500">Загрузка…</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-zinc-500">Оплат пока нет</p>
        ) : (
          payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              accountName={accountName(payment.accountId)}
              busy={busyId === payment.id}
              locked={locked}
              onSave={savePayment}
              onDelete={deletePayment}
            />
          ))
        )}
      </div>
    </Modal>
  )
}

/** Строка оплаты/возврата с инлайн-редактированием суммы и даты; locked — только просмотр */
function PaymentRow({
  payment,
  accountName,
  busy,
  locked,
  onSave,
  onDelete,
}: {
  payment: Transaction
  accountName: string
  busy: boolean
  locked: boolean
  onSave: (payment: Transaction, amount: string, date: string) => Promise<void>
  onDelete: (payment: Transaction) => Promise<void>
}) {
  const isExpense = payment.kind === 'expense'
  const [amount, setAmount] = useState(String(payment.amount))
  const [date, setDate] = useState(() => toLocalInputValue(new Date(payment.date)))
  const dirty = amount !== String(payment.amount) || date !== toLocalInputValue(new Date(payment.date))

  const refundBadge = isExpense && (
    <span className="shrink-0 rounded-full bg-red-400/10 px-2 py-0.5 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-400/20">
      Возврат
    </span>
  )
  const caption = (
    <p className="mt-1.5 pl-1 text-xs text-zinc-500">
      {isExpense ? 'Возврат клиенту' : 'Оплата'} · {accountName}
      {payment.comment ? ` · ${payment.comment}` : ''}
    </p>
  )

  // У завершённой аренды операции заморожены (бэк отклоняет PATCH/DELETE с 409) — только просмотр
  if (locked) {
    return (
      <div className="rounded-lg border border-white/10 p-3">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${isExpense ? 'text-red-400' : 'text-emerald-400'}`}>
            {isExpense ? '−' : '+'}
            {formatMoney(payment.amount)}
          </span>
          {refundBadge}
          <span className="text-sm text-zinc-500">{formatDateTime(payment.date)}</span>
          <span
            className="ml-auto inline-flex p-2 text-zinc-600"
            title="Аренда завершена — операции заморожены"
          >
            <Lock size={14} />
          </span>
        </div>
        {caption}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/10 p-3">
      <div className="flex items-center gap-2">
        {refundBadge}
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className={`input w-28 shrink-0 ${isExpense ? 'text-red-400' : ''}`}
          title="Сумма, ₽"
        />
        <input
          type="datetime-local"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="input"
          title={isExpense ? 'Дата возврата' : 'Дата оплаты'}
        />
        {dirty ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave(payment, amount, date)}
            title="Сохранить"
            className="shrink-0 rounded-lg p-2 text-emerald-400 transition hover:bg-emerald-400/10"
          >
            <Check size={16} />
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDelete(payment)}
            title={isExpense ? 'Удалить возврат' : 'Удалить оплату'}
            className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {caption}
    </div>
  )
}

/** Модалка приёма оплаты: сумма (по умолчанию — остаток), дата и счёт платежа. */
function PaymentModal({
  remaining,
  accounts,
  onClose,
  onSubmit,
}: {
  remaining: number
  accounts: AccountOption[]
  onClose: () => void
  onSubmit: (amount: string, date: string, accountId: string) => Promise<void>
}) {
  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : '')
  const [date, setDate] = useState(() => toLocalInputValue(new Date()))
  const [accountId, setAccountId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!amount.trim() || Number(amount) <= 0) {
      setError('Укажите сумму оплаты')
      return
    }
    if (!accountId) {
      setError('Укажите счёт приёма оплаты')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(amount, date, accountId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось принять оплату')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open title="Принять оплату" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Сумма, ₽ *</label>
          <input
            type="number"
            min={1}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="input"
          />
          {remaining > 0 && (
            <p className="mt-1.5 text-xs text-zinc-500">
              Остаток к оплате: {formatMoney(remaining)}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Дата оплаты</label>
          <input
            type="datetime-local"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">На счёт *</label>
          <select
            required
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="input"
          >
            <option value="" disabled>
              Выберите счёт…
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          <Banknote size={16} />
          Принять оплату
        </button>
      </form>
    </Modal>
  )
}

/** Модалка обычного завершения аренды: простое подтверждение без денежных полей. */
/** Секунды в единице тарифа позиции (месяц = 30 суток, как на бэке). */
const UNIT_SECONDS: Record<string, number> = {
  hour: 3600,
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
}

/** Обычное завершение: приём строго в календарный день окончания периода (локальный пояс браузера). */
function CompleteModal({
  rental,
  onClose,
  onSubmit,
}: {
  rental: Rental
  onClose: () => void
  onSubmit: (date: string) => Promise<void>
}) {
  // По умолчанию — дата окончания периода из заявки
  const [date, setDate] = useState(
    rental.plannedEndAt
      ? toLocalInputValue(new Date(rental.plannedEndAt))
      : toLocalInputValue(new Date())
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const end = rental.plannedEndAt ? new Date(rental.plannedEndAt) : null
  const picked = date ? new Date(date) : null
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  // 'later' — приём в день позже конца периода (нужна доплата через продление), 'earlier' — раньше
  const dayShift: 'same' | 'earlier' | 'later' | null =
    end == null || picked == null
      ? null
      : sameDay(picked, end)
        ? 'same'
        : picked < end
          ? 'earlier'
          : 'later'

  // Доплата за пересрочку: пересчёт по формуле бэка — ceil по единицам тарифа от startAt
  const startMs = new Date(rental.startAt).getTime()
  const unitsAt = (item: RentalItem, atMs: number) => {
    const unitMs = (UNIT_SECONDS[item.tariffUnit] ?? 86400) * 1000
    return Math.max(1, Math.ceil((atMs - startMs) / unitMs))
  }
  const extraDue =
    dayShift === 'later' && end != null && picked != null
      ? rental.items.reduce(
          (sum, item) => sum + item.rate * (unitsAt(item, picked.getTime()) - unitsAt(item, end.getTime())),
          0
        )
      : 0
  // Подсказка, на сколько продлить: покрыть разрыв единицами тарифа первой позиции
  const firstItem = rental.items.find((item) => !item.parentItemId)
  const extendHint =
    dayShift === 'later' && end != null && picked != null && firstItem
      ? (() => {
          const unitSec = UNIT_SECONDS[firstItem.tariffUnit] ?? 86400
          const units = Math.max(1, Math.ceil((picked.getTime() - end.getTime()) / 1000 / unitSec))
          return formatDurationValue(units, firstItem.tariffUnit)
        })()
      : null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!date) {
      setError('Укажите дату приёма')
      return
    }
    if (dayShift !== 'same' && dayShift !== null) {
      return // в другой день завершать нельзя — кнопка задизейблена
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(date)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось завершить аренду')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open title="Завершить аренду" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <p className="text-sm text-zinc-400">
          Все позиции вернутся на склад, аренда завершится.
        </p>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Дата приёма *</label>
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="input"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Приём — в тот же календарный день, что и конец периода
            {rental.plannedEndAt ? ` (${formatDateTime(rental.plannedEndAt)})` : ''}
          </p>
        </div>
        {dayShift === 'later' && (
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-400">
            Возврат в другой день — доплата {formatMoney(extraDue)}. Завершить нельзя:
            {extendHint ? ` продлите аренду на ${extendHint},` : ' продлите аренду,'} примите
            доплату — после этого аренду можно завершить.
          </p>
        )}
        {dayShift === 'earlier' && (
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-400">
            Дата приёма раньше дня окончания периода. Если клиент вернул технику раньше и просит
            деньги — оформите через «Вернуть досрочно».
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || dayShift === 'later' || dayShift === 'earlier'}
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckCircle2 size={16} />
          Завершить аренду
        </button>
      </form>
    </Modal>
  )
}

/** Модалка выдачи черновика: дата выдачи (по умолчанию — начало из заявки); можно с непогашенным остатком. */
function IssueModal({
  remaining,
  initialDate,
  onClose,
  onSubmit,
}: {
  remaining: number
  /** Дата начала аренды из заявки (datetime-local) */
  initialDate: string
  onClose: () => void
  onSubmit: (date: string) => Promise<void>
}) {
  const [date, setDate] = useState(initialDate)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(date)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось выдать аренду')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open title="Выдать аренду" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Дата выдачи</label>
          <input
            type="datetime-local"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="input"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Период аренды будет считаться от этой даты
          </p>
        </div>
        {remaining > 0 && (
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-400">
            Остаток к оплате: {formatMoney(remaining)} — можно выдать сейчас и принять оплату позже
          </p>
        )}
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          <KeyRound size={16} />
          Выдать
        </button>
      </form>
    </Modal>
  )
}

/**
 * Модалка досрочного возврата: все позиции разом; дата приёма и опционально возврат денег клиенту.
 * Дата валидируется «на лету» по локальным календарным дням (как на бэке), начисленное за
 * фактический срок и переплата пересчитываются при каждом изменении даты.
 */
function EarlyReturnModal({
  rental,
  accounts,
  onClose,
  onSubmit,
}: {
  rental: Rental
  accounts: AccountOption[]
  onClose: () => void
  onSubmit: (refundAmount: string, refundAccountId: string, date: string) => Promise<void>
}) {
  const [date, setDate] = useState(toLocalInputValue(new Date()))
  const [refundAmount, setRefundAmount] = useState('')
  // Пользователь правил сумму возврата вручную — при смене даты её больше не перезаполняем
  const [refundTouched, setRefundTouched] = useState(false)
  const [refundAccountId, setRefundAccountId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const start = new Date(rental.startAt)
  const end = rental.plannedEndAt ? new Date(rental.plannedEndAt) : null
  const picked = date ? new Date(date) : null
  const pickedValid = picked != null && !Number.isNaN(picked.getTime())
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  // Начисленное за фактический срок startAt → дата приёма: ceil по единицам тарифа, минимум 1
  // (формула как на бэке); комплектные позиции (parentItemId) — всегда 0, пропускаем
  const accrued = useMemo(() => {
    if (!date) return null
    const at = new Date(date)
    if (Number.isNaN(at.getTime())) return null
    const startMs = new Date(rental.startAt).getTime()
    return rental.items
      .filter((item) => !item.parentItemId)
      .reduce((sum, item) => {
        const unitMs = (UNIT_SECONDS[item.tariffUnit] ?? 86400) * 1000
        return sum + item.rate * Math.max(1, Math.ceil((at.getTime() - startMs) / unitMs))
      }, 0)
  }, [date, rental])

  // Переплата = потолок возврата (бэк тоже проверяет, 409)
  const overpaid = accrued != null ? Math.max(0, rental.paidAmount - accrued) : 0

  // Дата строго в календарный день ДО дня окончания и не раньше дня начала (локальные дни браузера)
  const dateError =
    picked == null || !pickedValid
      ? null
      : end != null && (sameDay(picked, end) || picked > end)
        ? 'Это не досрочный возврат: возврат в день окончания или позже оформляется обычным завершением'
        : !sameDay(picked, start) && picked < start
          ? 'Дата приёма раньше дня начала аренды'
          : null

  const showRefund = accrued != null && dateError == null && overpaid > 0
  const refundValue = Number(refundAmount)
  const refundError =
    showRefund && refundAmount.trim() !== '' && refundValue > overpaid
      ? `Сумма возврата не может быть больше переплаты (${formatMoney(overpaid)})`
      : null

  // Предзаполнение суммы возврата переплатой — пока пользователь не правил поле вручную
  useEffect(() => {
    if (!refundTouched) setRefundAmount(overpaid > 0 ? String(overpaid) : '')
  }, [overpaid, refundTouched])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!date) {
      setError('Укажите дату приёма')
      return
    }
    if (dateError || refundError) return // кнопка задизейблена
    const refund = showRefund ? refundAmount : ''
    if (Number(refund) > 0 && !refundAccountId) {
      setError('Укажите счёт, с которого вернуть деньги')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(refund, refundAccountId, date)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось оформить возврат')
    } finally {
      setSubmitting(false)
    }
  }

  const validationError = error || dateError || refundError

  return (
    <Modal open title="Вернуть досрочно" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {validationError && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {validationError}
          </p>
        )}
        <p className="text-sm text-zinc-400">
          Все позиции аренды (включая комплект) будут возвращены. Вернули раньше конца периода —
          аренда закроется как «завершена досрочно».
        </p>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Дата приёма *</label>
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="input"
          />
        </div>
        {pickedValid && picked != null && dateError == null && accrued != null && (
          <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">
            Начислено за период по {formatDateTime(picked.toISOString())}: {formatMoney(accrued)} ·
            Оплачено: {formatMoney(rental.paidAmount)} ·{' '}
            {overpaid > 0 ? `К возврату: ${formatMoney(overpaid)}` : 'Переплаты нет — возвращать нечего'}
          </p>
        )}
        {showRefund && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Вернуть клиенту, ₽</label>
            <input
              type="number"
              min={0}
              value={refundAmount}
              onChange={(event) => {
                setRefundTouched(true)
                setRefundAmount(event.target.value)
              }}
              className="input"
              placeholder="0 — без возврата денег"
            />
          </div>
        )}
        {showRefund && refundValue > 0 && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Со счёта *</label>
            <select
              required
              value={refundAccountId}
              onChange={(event) => setRefundAccountId(event.target.value)}
              className="input"
            >
              <option value="" disabled>
                Выберите счёт…
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="submit"
          disabled={submitting || dateError != null || refundError != null}
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 size={16} />
          Вернуть досрочно
        </button>
      </form>
    </Modal>
  )
}

/**
 * Модалка продления: новый конец = старый конец периода + duration × unit.
 * Денежных полей нет — оплата принимается отдельно через блок оплаты.
 * Используется и для правки существующего продления (title/submitLabel/initial*).
 */
function ExtendModal({
  title = 'Продлить аренду',
  submitLabel = 'Продлить',
  initialDuration = '',
  initialUnit = 'day',
  onClose,
  onSubmit,
}: {
  title?: string
  submitLabel?: string
  initialDuration?: string
  initialUnit?: TariffUnit
  onClose: () => void
  onSubmit: (duration: string, durationUnit: TariffUnit) => Promise<void>
}) {
  const [duration, setDuration] = useState(initialDuration)
  const [durationUnit, setDurationUnit] = useState<TariffUnit>(initialUnit)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!duration.trim() || Number(duration) <= 0) {
      setError('Укажите срок продления')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(duration, durationUnit)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить продление')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Продлить на *</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              required
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              className="input w-24 shrink-0"
              placeholder="3"
            />
            <select
              value={durationUnit}
              onChange={(event) => setDurationUnit(event.target.value as TariffUnit)}
              className="input"
            >
              {(Object.keys(tariffUnitLabels) as TariffUnit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {tariffUnitLabels[unit]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitLabel}
        </button>
      </form>
    </Modal>
  )
}

/**
 * Подтверждение удаления аренды без следа (ADMIN, финальные статусы): каскадно удаляются
 * позиции, события, продления и все финансовые операции по аренде. После удаления — на список.
 */
function DeleteRentalModal({
  customerName,
  onClose,
  onSubmit,
}: {
  customerName: string
  onClose: () => void
  onSubmit: () => Promise<void>
}) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onSubmit()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить аренду')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open title="Удалить аренду" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <p className="text-sm text-zinc-400">
          Удалить аренду клиента {customerName} навсегда? Удалятся также все операции по ней
          (оплаты и возвраты) — деньги исчезнут из балансов счетов. Действие необратимо.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={16} />
            Удалить
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ItemRows({
  item,
  childrenItems,
  zebra,
}: {
  item: RentalItem
  childrenItems: RentalItem[]
  zebra: boolean
}) {
  const rowClass = `transition hover:bg-white/5 ${zebra ? 'bg-white/[0.02]' : ''}`
  return (
    <>
      <ItemRow item={item} rowClass={rowClass} />
      {childrenItems.map((child) => (
        <ItemRow key={child.id} item={child} rowClass={rowClass} isChild />
      ))}
    </>
  )
}

function ItemRow({
  item,
  rowClass,
  isChild = false,
}: {
  item: RentalItem
  rowClass: string
  isChild?: boolean
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
    </tr>
  )
}
