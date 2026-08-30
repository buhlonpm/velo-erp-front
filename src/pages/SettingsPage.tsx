import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, Ban, Bike, Check, Pencil, Plus, RotateCcw, Satellite, Smartphone, Trash2, X } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { AccountOption, BikeModel, Category, CategoryKind, GpsTracker, SimCard, Tariff, TariffUnit, WriteOffReason } from '../types'
import { Modal } from '../components/Modal'
import { PhoneInput } from '../components/PhoneInput'
import { EmptyState } from '../components/EmptyState'
import { dateInputToIso, formatDate, formatMoney, formatNumber, isoToDateInput, todayDateInput } from '../lib/format'
import { categoryKindLabels, tariffUnitLabels, writeOffReasonLabels } from '../lib/labels'
import { UsersPage } from './UsersPage'

type SettingsTab = 'users' | 'categories' | 'models' | 'gps-trackers' | 'sim-cards'

const tabs: [SettingsTab, string][] = [
  ['users', 'Пользователи'],
  ['categories', 'Статьи финансов'],
  ['models', 'Модели велосипедов'],
  ['gps-trackers', 'GPS-трекеры'],
  ['sim-cards', 'SIM-карты'],
]

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('users')

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-100">Настройки</h1>

      <div className="flex gap-1 border-b border-white/5">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === value
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersPage />}
      {tab === 'categories' && <CategoriesSettings />}
      {tab === 'models' && <BikeModelsSettings />}
      {tab === 'gps-trackers' && <GpsTrackersSettings />}
      {tab === 'sim-cards' && <SimCardsSettings />}
    </div>
  )
}

function SimCardsSettings() {
  const [simCards, setSimCards] = useState<SimCard[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ open: boolean; simCard?: SimCard }>({ open: false })
  const [writeOffSimCard, setWriteOffSimCard] = useState<SimCard | null>(null)

  const showError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback)

  const loadSimCards = useCallback(async () => {
    try {
      const [simCardList, accountList] = await Promise.all([
        api<SimCard[]>('/sim-cards'),
        api<AccountOption[]>('/finance/accounts/options'),
      ])
      setSimCards(simCardList)
      setAccounts(accountList)
      setError('')
    } catch (err) {
      showError(err, 'Не удалось загрузить SIM-карты')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSimCards()
  }, [loadSimCards])

  const saveSimCard = async (form: SimCardForm) => {
    try {
      if (form.id) {
        await api(`/sim-cards/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            phoneNumber: form.phoneNumber,
            operator: form.operator,
            ...(form.note ? { note: form.note } : {}),
            // Покупка — только у отдельно купленной симки (у комплектной поля пустые);
            // бэк синхронизирует системную операцию покупки
            ...(form.purchasedAt ? { purchasedAt: dateInputToIso(form.purchasedAt) } : {}),
            ...(form.purchasePrice.trim() ? { purchasePrice: Number(form.purchasePrice) } : {}),
          }),
        })
      } else if (form.bundled) {
        // «В комплекте с трекером»: цена 0, операции нет, дата покупки — от трекера
        await api('/sim-cards', {
          method: 'POST',
          body: JSON.stringify({
            phoneNumber: form.phoneNumber,
            operator: form.operator,
            ...(form.note ? { note: form.note } : {}),
            purchasePrice: 0,
            bundledTrackerId: form.bundledTrackerId,
          }),
        })
      } else {
        // Отдельная покупка: дата, цена > 0 и счёт обязательны (бэк иначе вернёт 409)
        const price = Number(form.purchasePrice)
        await api('/sim-cards', {
          method: 'POST',
          body: JSON.stringify({
            phoneNumber: form.phoneNumber,
            operator: form.operator,
            ...(form.note ? { note: form.note } : {}),
            purchasedAt: dateInputToIso(form.purchasedAt),
            purchasePrice: price,
            purchaseAccountId: form.purchaseAccountId,
          }),
        })
      }
      await loadSimCards()
      setModal({ open: false })
    } catch (err) {
      // 409: такой номер уже есть / не указан счёт при цене > 0
      showError(err, 'Не удалось сохранить SIM-карту')
    }
  }

  const restoreSimCard = async (simCard: SimCard) => {
    if (!window.confirm(`Вернуть SIM-карту ${simCard.phoneNumber} из списания?`)) return
    try {
      await api(`/sim-cards/${simCard.id}/restore`, { method: 'POST' })
      await loadSimCards()
    } catch (err) {
      showError(err, 'Не удалось вернуть SIM-карту из списания')
    }
  }

  const deleteSimCard = async (simCard: SimCard) => {
    if (!window.confirm(`Удалить SIM-карту ${simCard.phoneNumber}?`)) return
    try {
      await api(`/sim-cards/${simCard.id}`, { method: 'DELETE' })
      await loadSimCards()
    } catch (err) {
      showError(err, 'Не удалось удалить SIM-карту')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">Справочник SIM-карт для GPS-трекеров</p>
        <button type="button" onClick={() => setModal({ open: true })} className="btn-primary">
          <Plus size={16} />
          Добавить SIM-карту
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <section className="panel overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
        ) : simCards.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title="SIM-карт нет"
            description="Добавьте первую SIM-карту"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">Номер</th>
                  <th className="th">Оператор</th>
                  <th className="th">Статус</th>
                  <th className="th">Заметка</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {simCards.map((simCard, index) => (
                  <tr
                    key={simCard.id}
                    className={`transition hover:bg-white/5 ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
                  >
                    <td className="td font-medium text-zinc-200">{simCard.phoneNumber}</td>
                    <td className="td">{simCard.operator}</td>
                    <td className="td">
                      {simCard.status === 'written_off' ? (
                        <div>
                          <span className="inline-flex rounded-full bg-red-400/10 px-2.5 py-0.5 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-400/20">
                            Списана
                            {simCard.writeOffReason &&
                              `: ${writeOffReasonLabels[simCard.writeOffReason]}`}
                          </span>
                          {simCard.writeOffComment && (
                            <p className="mt-1 text-xs text-zinc-600">{simCard.writeOffComment}</p>
                          )}
                        </div>
                      ) : simCard.trackerId ? (
                        <span className="text-zinc-300">
                          В трекере
                          {simCard.bundledTrackerName ? `: ${simCard.bundledTrackerName}` : ''}
                        </span>
                      ) : (
                        <span className="text-zinc-500">Свободна</span>
                      )}
                    </td>
                    <td className="td max-w-72">
                      <span className="block truncate text-zinc-500" title={simCard.note}>
                        {simCard.note || '—'}
                      </span>
                    </td>
                    <td className="td text-right">
                      <span className="inline-flex gap-1">
                        {simCard.status === 'active' && (
                          <>
                            <button
                              type="button"
                              title="Редактировать"
                              onClick={() => setModal({ open: true, simCard })}
                              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              title="Списать"
                              onClick={() => setWriteOffSimCard(simCard)}
                              className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                            >
                              <Ban size={16} />
                            </button>
                          </>
                        )}
                        {simCard.status === 'written_off' && (
                          <button
                            type="button"
                            title="Вернуть из списания"
                            onClick={() => restoreSimCard(simCard)}
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-emerald-400/10 hover:text-emerald-400"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                        {/* Удалять можно только свободную активную симку (в трекере → 409) */}
                        {simCard.status === 'active' && simCard.trackerId == null && (
                          <button
                            type="button"
                            title="Удалить"
                            onClick={() => deleteSimCard(simCard)}
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SimCardModal
        key={modal.simCard?.id ?? 'new'}
        open={modal.open}
        initial={modal.simCard}
        accounts={accounts}
        onClose={() => setModal({ open: false })}
        onSave={saveSimCard}
      />

      <SimWriteOffModal
        key={writeOffSimCard?.id ?? 'none'}
        simCard={writeOffSimCard}
        onClose={() => setWriteOffSimCard(null)}
        onSaved={() => {
          setWriteOffSimCard(null)
          void loadSimCards()
        }}
      />
    </div>
  )
}

interface SimCardForm {
  id?: string
  phoneNumber: string
  operator: string
  note: string
  purchasedAt: string
  purchasePrice: string
  purchaseAccountId: string
  /** «В комплекте с трекером» — только при создании */
  bundled: boolean
  bundledTrackerId: string
}

function SimCardModal({
  open,
  initial,
  accounts,
  onClose,
  onSave,
}: {
  open: boolean
  initial?: SimCard
  accounts: AccountOption[]
  onClose: () => void
  onSave: (form: SimCardForm) => void
}) {
  const [phoneNumber, setPhoneNumber] = useState(initial?.phoneNumber ?? '')
  const [operator, setOperator] = useState(initial?.operator ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [purchasedAt, setPurchasedAt] = useState(isoToDateInput(initial?.purchasedAt))
  const [purchasePrice, setPurchasePrice] = useState(
    initial?.purchasePrice != null ? String(initial.purchasePrice) : '',
  )
  const [purchaseAccountId, setPurchaseAccountId] = useState('')
  // «В комплекте с трекером» — только при создании
  const [bundled, setBundled] = useState(false)
  const [bundledTrackerId, setBundledTrackerId] = useState('')
  const [trackers, setTrackers] = useState<GpsTracker[]>([])

  // У комплектной симки дата/цена наследуются от трекера — поля только для просмотра
  const bundledInitial = initial?.bundledTrackerId != null
  // Предупреждение о пересчёте операции — только когда значения реально отличаются
  const purchaseChanged =
    !!initial &&
    !bundledInitial &&
    (purchasedAt !== isoToDateInput(initial.purchasedAt) ||
      purchasePrice.trim() !== String(initial.purchasePrice ?? ''))

  useEffect(() => {
    if (!open || initial) return
    // Комплектную симку можно добавить только в активный трекер без симки
    api<GpsTracker[]>('/gps-trackers')
      .then((list) => setTrackers(list.filter((t) => t.status === 'active' && t.simCardId == null)))
      .catch(() => setTrackers([]))
  }, [open, initial])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!phoneNumber.trim() || !operator.trim()) return
    if (!initial) {
      if (bundled) {
        if (!bundledTrackerId) return
      } else {
        // Отдельная покупка: дата, цена > 0 и счёт обязательны
        const price = Number(purchasePrice)
        if (!purchasedAt || !purchasePrice.trim() || Number.isNaN(price) || price <= 0) return
        if (!purchaseAccountId) return
      }
    } else if (!bundledInitial) {
      // Правка покупки у отдельно купленной симки: дата и цена > 0 обязательны
      const price = Number(purchasePrice)
      if (!purchasedAt || !purchasePrice.trim() || Number.isNaN(price) || price <= 0) return
    }
    onSave({
      id: initial?.id,
      phoneNumber: phoneNumber.trim(),
      operator: operator.trim(),
      note: note.trim(),
      // У комплектной симки покупку не шлём — она наследуется от трекера
      purchasedAt: bundledInitial ? '' : purchasedAt,
      purchasePrice: bundledInitial ? '' : purchasePrice,
      purchaseAccountId,
      bundled,
      bundledTrackerId,
    })
    setPhoneNumber('')
    setOperator('')
    setNote('')
    setPurchasedAt('')
    setPurchasePrice('')
    setPurchaseAccountId('')
    setBundled(false)
    setBundledTrackerId('')
  }

  return (
    <Modal open={open} title={initial ? `Редактировать: ${initial.phoneNumber}` : 'Новая SIM-карта'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Номер</label>
          <PhoneInput
            required
            value={phoneNumber}
            onChange={setPhoneNumber}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Оператор</label>
          <input
            required
            value={operator}
            onChange={(event) => setOperator(event.target.value)}
            className="input"
            placeholder="МегаФон"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Заметка</label>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="input"
            placeholder="Необязательно"
          />
        </div>
        {/* Способ покупки — только при создании; при редактировании не меняем */}
        {!initial && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Способ покупки</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBundled(false)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  !bundled
                    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
                    : 'border-white/10 text-zinc-400 hover:border-white/20'
                }`}
              >
                Куплена отдельно
              </button>
              <button
                type="button"
                onClick={() => setBundled(true)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  bundled
                    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
                    : 'border-white/10 text-zinc-400 hover:border-white/20'
                }`}
              >
                В комплекте с трекером
              </button>
            </div>
          </div>
        )}

        {!initial && bundled && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">GPS-трекер *</label>
            <select
              required
              value={bundledTrackerId}
              onChange={(event) => setBundledTrackerId(event.target.value)}
              className="input"
            >
              <option value="" disabled>
                Выберите трекер…
              </option>
              {trackers.map((tracker) => (
                <option key={tracker.id} value={tracker.id}>
                  {tracker.model}
                  {tracker.imei ? ` (IMEI ${tracker.imei})` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-600">
              Цена 0 ₽, дата покупки — как у трекера; симка сразу будет вставлена в него
            </p>
          </div>
        )}

        {!initial && !bundled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm text-zinc-400">Дата покупки *</label>
                <input
                  required
                  type="date"
                  max={todayDateInput()}
                  value={purchasedAt}
                  onChange={(event) => setPurchasedAt(event.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-zinc-400">Цена покупки, ₽ *</label>
                <input
                  required
                  type="number"
                  min={1}
                  value={purchasePrice}
                  onChange={(event) => setPurchasePrice(event.target.value)}
                  className="input"
                  placeholder="500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Счёт списания *</label>
              <select
                required
                value={purchaseAccountId}
                onChange={(event) => setPurchaseAccountId(event.target.value)}
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
          </>
        )}

        {/* Покупка при редактировании: у комплектной — только просмотр (наследуется от трекера) */}
        {initial && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm text-zinc-400">Дата покупки *</label>
                <input
                  required
                  disabled={bundledInitial}
                  type="date"
                  max={todayDateInput()}
                  value={purchasedAt}
                  onChange={(event) => setPurchasedAt(event.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-zinc-400">Цена покупки, ₽ *</label>
                <input
                  required
                  disabled={bundledInitial}
                  type="number"
                  min={1}
                  value={purchasePrice}
                  onChange={(event) => setPurchasePrice(event.target.value)}
                  className="input"
                />
              </div>
            </div>
            {bundledInitial && (
              <p className="text-xs text-zinc-500">
                В комплекте с трекером
                {initial.bundledTrackerName ? ` «${initial.bundledTrackerName}»` : ''} — дата и цена
                наследуются от трекера
              </p>
            )}
            {purchaseChanged && (
              <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-400">
                При изменении даты или суммы покупки связанная финансовая операция будет пересчитана
              </p>
            )}
          </>
        )}
        <button type="submit" className="btn-primary w-full">
          {initial ? 'Сохранить' : 'Добавить'}
        </button>
      </form>
    </Modal>
  )
}

/** Списание SIM-карты (POST /sim-cards/{id}/write-off) — причины без «Продан» */
function SimWriteOffModal({
  simCard,
  onClose,
  onSaved,
}: {
  simCard: SimCard | null
  onClose: () => void
  onSaved: () => void
}) {
  const [reason, setReason] = useState<WriteOffReason>('broken')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!simCard) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await api(`/sim-cards/${simCard.id}/write-off`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      })
      onSaved()
    } catch (err) {
      // 409: симка в трекере / уже списана — текст сервера
      setError(err instanceof ApiError ? err.message : 'Не удалось списать SIM-карту')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open title={`Списать SIM-карту: ${simCard.phoneNumber}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Причина</label>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as WriteOffReason)}
            className="input"
          >
            {(['broken', 'stolen', 'lost', 'other'] as WriteOffReason[]).map((value) => (
              <option key={value} value={value}>
                {writeOffReasonLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Комментарий</label>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="input"
            placeholder="Необязательно"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          Списать
        </button>
      </form>
    </Modal>
  )
}

function GpsTrackersSettings() {
  const [trackers, setTrackers] = useState<GpsTracker[]>([])
  const [simCards, setSimCards] = useState<SimCard[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ open: boolean; tracker?: GpsTracker }>({ open: false })
  const [writeOffTracker, setWriteOffTracker] = useState<GpsTracker | null>(null)

  const showError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback)

  const loadTrackers = useCallback(async () => {
    try {
      const [trackerList, simCardList, accountList] = await Promise.all([
        api<GpsTracker[]>('/gps-trackers'),
        // Для формы — только свободные симки
        api<SimCard[]>('/sim-cards?available=true'),
        api<AccountOption[]>('/finance/accounts/options'),
      ])
      setTrackers(trackerList)
      setSimCards(simCardList)
      setAccounts(accountList)
      setError('')
    } catch (err) {
      showError(err, 'Не удалось загрузить GPS-трекеры')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTrackers()
  }, [loadTrackers])

  const deleteTracker = async (tracker: GpsTracker) => {
    if (!window.confirm(`Удалить трекер «${tracker.model}»?`)) return
    try {
      await api(`/gps-trackers/${tracker.id}`, { method: 'DELETE' })
      await loadTrackers()
    } catch (err) {
      // 409: трекер установлен на велосипеде — показываем текст сервера
      showError(err, 'Не удалось удалить трекер')
    }
  }

  const restoreTracker = async (tracker: GpsTracker) => {
    if (!window.confirm('Вернуть трекер из списания? Он снова станет доступен для установки.'))
      return
    try {
      await api(`/gps-trackers/${tracker.id}/restore`, { method: 'POST' })
      await loadTrackers()
    } catch (err) {
      // 409: трекер не списан
      showError(err, 'Не удалось вернуть трекер из списания')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">Справочник GPS-трекеров для велосипедов</p>
        <button type="button" onClick={() => setModal({ open: true })} className="btn-primary">
          <Plus size={16} />
          Добавить трекер
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <section className="panel overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
        ) : trackers.length === 0 ? (
          <EmptyState
            icon={Satellite}
            title="Трекеров нет"
            description="Добавьте первый GPS-трекер"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">Модель</th>
                  <th className="th">IMEI</th>
                  <th className="th">SIM-карта</th>
                  <th className="th">Статус</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {trackers.map((tracker, index) => (
                  <tr
                    key={tracker.id}
                    className={`transition hover:bg-white/5 ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
                  >
                    <td className="td font-medium text-zinc-200">{tracker.model}</td>
                    <td className="td font-mono text-xs text-zinc-500">{tracker.imei || '—'}</td>
                    <td className="td text-zinc-500">
                      {tracker.simPhoneNumber
                        ? `${tracker.simPhoneNumber} · ${tracker.simOperator ?? ''}`
                        : '—'}
                    </td>
                    <td className="td">
                      {tracker.status === 'sold' ? (
                        <span className="inline-flex rounded-full bg-sky-400/10 px-2.5 py-0.5 text-xs font-medium text-sky-400 ring-1 ring-inset ring-sky-400/20">
                          Продан
                        </span>
                      ) : tracker.status === 'written_off' ? (
                        <div>
                          <span className="inline-flex rounded-full bg-red-400/10 px-2.5 py-0.5 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-400/20">
                            Списан
                            {tracker.writeOffReason &&
                              `: ${writeOffReasonLabels[tracker.writeOffReason]}`}
                          </span>
                          {tracker.writeOffComment && (
                            <p className="mt-1 text-xs text-zinc-600">{tracker.writeOffComment}</p>
                          )}
                        </div>
                      ) : tracker.installedBikeId ? (
                        <span className="text-zinc-300">
                          {tracker.installedBikeName ?? 'Установлен'}
                        </span>
                      ) : (
                        <span className="text-zinc-500">На складе</span>
                      )}
                    </td>
                    <td className="td text-right">
                      <span className="inline-flex gap-1">
                        {/* Редактировать можно только активный трекер */}
                        {tracker.status === 'active' && (
                          <button
                            type="button"
                            title="Редактировать"
                            onClick={() => setModal({ open: true, tracker })}
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {/* Списать можно только активный трекер */}
                        {tracker.status === 'active' && (
                          <button
                            type="button"
                            title="Списать"
                            onClick={() => setWriteOffTracker(tracker)}
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                          >
                            <Ban size={16} />
                          </button>
                        )}
                        {/* Списанный трекер можно вернуть в строй */}
                        {tracker.status === 'written_off' && (
                          <button
                            type="button"
                            title="Вернуть из списания"
                            onClick={() => restoreTracker(tracker)}
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-emerald-400/10 hover:text-emerald-400"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                        {/* Удалять можно только активный неустановленный трекер */}
                        {tracker.status === 'active' && !tracker.installedBikeId && (
                          <button
                            type="button"
                            title="Удалить"
                            onClick={() => deleteTracker(tracker)}
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <GpsTrackerModal
        key={modal.tracker?.id ?? 'new'}
        open={modal.open}
        initial={modal.tracker}
        simCards={simCards}
        accounts={accounts}
        onClose={() => setModal({ open: false })}
        onSaved={() => {
          setModal({ open: false })
          void loadTrackers()
        }}
      />

      <TrackerWriteOffModal
        key={writeOffTracker?.id ?? 'none'}
        tracker={writeOffTracker}
        accounts={accounts}
        onClose={() => setWriteOffTracker(null)}
        onSaved={() => {
          setWriteOffTracker(null)
          void loadTrackers()
        }}
      />
    </div>
  )
}

function GpsTrackerModal({
  open,
  initial,
  simCards,
  accounts,
  onClose,
  onSaved,
}: {
  open: boolean
  initial?: GpsTracker
  simCards: SimCard[]
  accounts: AccountOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const editing = initial
  const [model, setModel] = useState(editing?.model ?? '')
  const [imei, setImei] = useState(editing?.imei ?? '')
  const [simCardId, setSimCardId] = useState(editing?.simCardId ?? '')
  const [purchasedAt, setPurchasedAt] = useState(isoToDateInput(editing?.purchasedAt))
  const [purchasePrice, setPurchasePrice] = useState(
    editing?.purchasePrice != null ? String(editing.purchasePrice) : '',
  )
  const [purchaseAccountId, setPurchaseAccountId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Предупреждение о пересчёте операции — только когда значения реально отличаются
  const purchaseChanged =
    !!editing &&
    (purchasedAt !== isoToDateInput(editing.purchasedAt) ||
      purchasePrice.trim() !== String(editing.purchasePrice ?? ''))

  // Текущая симка трекера не входит в available=true — добавляем с пометкой
  const currentSimCard =
    editing?.simCardId && !simCards.some((s) => s.id === editing.simCardId)
      ? {
          id: editing.simCardId,
          label: `${editing.simPhoneNumber ?? ''} · ${editing.simOperator ?? ''} (текущая)`,
        }
      : null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!model.trim()) return
    setSubmitting(true)
    setError('')
    try {
      if (editing) {
        // Дата/цена покупки правятся и при редактировании — бэк синхронизирует системную операцию
        const price = Number(purchasePrice)
        if (!purchasedAt || !purchasePrice.trim() || Number.isNaN(price) || price <= 0) {
          setSubmitting(false)
          return
        }
        await api(`/gps-trackers/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            model: model.trim(),
            ...(imei.trim() ? { imei: imei.trim() } : {}),
            ...(simCardId
              ? { simCardId }
              : editing.simCardId
                ? { clearSimCard: true }
                : {}),
            purchasedAt: dateInputToIso(purchasedAt),
            purchasePrice: price,
          }),
        })
      } else {
        const price = Number(purchasePrice)
        if (!purchasedAt || !purchasePrice.trim() || Number.isNaN(price) || price <= 0 || !purchaseAccountId) {
          setSubmitting(false)
          return
        }
        await api('/gps-trackers', {
          method: 'POST',
          body: JSON.stringify({
            model: model.trim(),
            ...(imei.trim() ? { imei: imei.trim() } : {}),
            purchasedAt: dateInputToIso(purchasedAt),
            purchasePrice: price,
            purchaseAccountId,
          }),
        })
      }
      onSaved()
    } catch (err) {
      // 409: симка занята другим трекером и т.п. — текст сервера
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить трекер')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? `Редактировать: ${editing.model}` : 'Новый GPS-трекер'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Модель</label>
          <input
            required
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="input"
            placeholder="Teltonika FMB920"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">IMEI (необязательно)</label>
          <input
            value={imei}
            onChange={(event) => setImei(event.target.value)}
            className="input"
            placeholder="350000000000000"
          />
        </div>
        {/* SIM-карта — только при редактировании; при создании симка ставится отдельно (в т.ч. комплектная) */}
        {editing && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">SIM-карта</label>
            <select
              value={simCardId}
              onChange={(event) => setSimCardId(event.target.value)}
              className="input"
            >
              <option value="">Без симки</option>
              {currentSimCard && <option value={currentSimCard.id}>{currentSimCard.label}</option>}
              {simCards.map((simCard) => (
                <option key={simCard.id} value={simCard.id}>
                  {simCard.phoneNumber} · {simCard.operator}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Покупка: дата и цена правятся и при редактировании, счёт — только при создании */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Дата покупки *</label>
            <input
              required
              type="date"
              max={todayDateInput()}
              value={purchasedAt}
              onChange={(event) => setPurchasedAt(event.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Цена покупки, ₽ *</label>
            <input
              required
              type="number"
              min={1}
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              className="input"
              placeholder="3000"
            />
          </div>
        </div>
        {!editing && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Счёт списания *</label>
            <select
              required
              value={purchaseAccountId}
              onChange={(event) => setPurchaseAccountId(event.target.value)}
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
        {purchaseChanged && (
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-400">
            При изменении даты или суммы покупки связанная финансовая операция будет пересчитана
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {editing ? 'Сохранить' : 'Добавить'}
        </button>
      </form>
    </Modal>
  )
}

/** Списание GPS-трекера (POST /gps-trackers/{id}/write-off) */
function TrackerWriteOffModal({
  tracker,
  accounts,
  onClose,
  onSaved,
}: {
  tracker: GpsTracker | null
  accounts: AccountOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [reason, setReason] = useState<WriteOffReason>('broken')
  const [salePrice, setSalePrice] = useState('')
  const [saleAccountId, setSaleAccountId] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!tracker) return null
  const isSold = reason === 'sold'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isSold) {
      const price = Number(salePrice)
      if (!salePrice.trim() || Number.isNaN(price) || price <= 0 || !saleAccountId) return
    }
    setSubmitting(true)
    setError('')
    try {
      await api(`/gps-trackers/${tracker.id}/write-off`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          ...(isSold ? { salePrice: Number(salePrice), saleAccountId } : {}),
        }),
      })
      onSaved()
    } catch (err) {
      // 409: трекер уже выбыл / нет цены продажи — текст сервера
      setError(err instanceof ApiError ? err.message : 'Не удалось списать трекер')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open title={`Списать трекер: ${tracker.model}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Причина</label>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as WriteOffReason)}
            className="input"
          >
            {(Object.keys(writeOffReasonLabels) as WriteOffReason[]).map((value) => (
              <option key={value} value={value}>
                {writeOffReasonLabels[value]}
              </option>
            ))}
          </select>
        </div>

        {isSold && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Цена продажи, ₽ *</label>
              <input
                required
                type="number"
                min={1}
                value={salePrice}
                onChange={(event) => setSalePrice(event.target.value)}
                className="input"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Зачислить на счёт *</label>
              <select
                required
                value={saleAccountId}
                onChange={(event) => setSaleAccountId(event.target.value)}
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
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Комментарий</label>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="input"
            placeholder="Необязательно"
          />
        </div>

        {/* Каскад: вставленная симка спишется вместе с трекером */}
        {tracker.simCardId && (
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-400">
            SIM-карта {tracker.simPhoneNumber ?? ''} будет списана вместе с трекером
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          Списать
        </button>
      </form>
    </Modal>
  )
}

function CategoriesSettings() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const showError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback)

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await api<Category[]>('/finance/categories'))
      setError('')
    } catch (err) {
      showError(err, 'Не удалось загрузить статьи')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  const addCategory = async (name: string, kind: CategoryKind) => {
    try {
      await api('/finance/categories', { method: 'POST', body: JSON.stringify({ name, kind }) })
      await loadCategories()
    } catch (err) {
      showError(err, 'Не удалось добавить статью')
    }
  }

  const deleteCategory = async (id: string) => {
    try {
      await api(`/finance/categories/${id}`, { method: 'DELETE' })
      await loadCategories()
    } catch (err) {
      // 409: по статье есть операции — показываем текст сервера
      showError(err, 'Не удалось удалить статью')
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(['income', 'expense'] as CategoryKind[]).map((kind) => (
          <CategoryPanel
            key={kind}
            kind={kind}
            categories={categories.filter((c) => c.kind === kind)}
            onAdd={addCategory}
            onDelete={deleteCategory}
          />
        ))}
      </div>
    </div>
  )
}

function CategoryPanel({
  kind,
  categories,
  onAdd,
  onDelete,
}: {
  kind: CategoryKind
  categories: Category[]
  onAdd: (name: string, kind: CategoryKind) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState('')
  const isIncome = kind === 'income'

  const handleAdd = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setName('')
    void onAdd(trimmed, kind)
  }

  return (
    <section className="panel p-5">
      <h2
        className={`flex items-center gap-2 text-sm font-semibold ${
          isIncome ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {isIncome ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
        {categoryKindLabels[kind]}
      </h2>

      <ul className="mt-4 divide-y divide-white/5">
        {categories.map((category) => (
          <li key={category.id} className="group flex items-center justify-between py-2.5">
            <span className="text-sm text-zinc-300">{category.name}</span>
            {/* По статье с операциями удаление невозможно (409) — скрываем кнопку */}
            {!category.inUse && (
              <button
                type="button"
                title="Удалить статью"
                onClick={() => onDelete(category.id)}
                className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
        {categories.length === 0 && <li className="py-2.5 text-sm text-zinc-600">Статей нет</li>}
      </ul>

      <form onSubmit={handleAdd} className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Новая статья…"
          className="input"
        />
        <button type="submit" className="btn-primary shrink-0">
          <Plus size={16} />
        </button>
      </form>
    </section>
  )
}

/** «1 тариф / 2 тарифа / 5 тарифов» */
function tariffsCountLabel(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} тариф`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} тарифа`
  return `${count} тарифов`
}

function BikeModelsSettings() {
  const [models, setModels] = useState<BikeModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const showError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback)

  const loadModels = useCallback(async () => {
    try {
      setModels(await api<BikeModel[]>('/bike-models'))
      setError('')
    } catch (err) {
      showError(err, 'Не удалось загрузить модели')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  const addModel = async (form: {
    brand: string
    model: string
    specs: string
    maxMileageKm: number | null
    residualPercent: number | null
  }) => {
    try {
      await api('/bike-models', { method: 'POST', body: JSON.stringify(form) })
      await loadModels()
      setModalOpen(false)
    } catch (err) {
      // 409: такая модель уже есть
      showError(err, 'Не удалось добавить модель')
    }
  }

  const deleteModel = async (model: BikeModel) => {
    if (!window.confirm(`Удалить модель «${model.brand} ${model.model}»?`)) return
    try {
      await api(`/bike-models/${model.id}`, { method: 'DELETE' })
      await loadModels()
    } catch (err) {
      showError(err, 'Не удалось удалить модель')
    }
  }

  const selected = models.find((m) => m.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Справочник моделей; клик по строке — тарифы модели
        </p>
        <button type="button" onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus size={16} />
          Добавить модель
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <section className="panel overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
        ) : models.length === 0 ? (
          <EmptyState
            icon={Bike}
            title="Моделей нет"
            description="Добавьте первую модель велосипеда"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">Бренд</th>
                  <th className="th">Модель</th>
                  <th className="th">Характеристики</th>
                  <th className="th">Тарифов</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {models.map((model, index) => (
                  <tr
                    key={model.id}
                    onClick={() => setSelectedId(model.id)}
                    className={`cursor-pointer transition hover:bg-white/5 ${
                      index % 2 === 1 ? 'bg-white/[0.02]' : ''
                    }`}
                  >
                    <td className="td font-medium text-zinc-200">{model.brand}</td>
                    <td className="td">{model.model}</td>
                    <td className="td max-w-72">
                      <span className="block truncate text-zinc-500" title={model.specs}>
                        {model.specs || '—'}
                      </span>
                    </td>
                    <td className="td text-zinc-500">
                      {tariffsCountLabel((model.tariffs ?? []).length)}
                    </td>
                    <td className="td text-right">
                      <button
                        type="button"
                        title="Удалить"
                        onClick={(event) => {
                          event.stopPropagation()
                          void deleteModel(model)
                        }}
                        className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BikeModelModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={addModel}
      />

      <BikeModelDetailsModal
        key={selectedId ?? 'none'}
        model={selected}
        onClose={() => setSelectedId(null)}
        onChanged={loadModels}
      />
    </div>
  )
}

function BikeModelModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean
  onClose: () => void
  onSave: (form: {
    brand: string
    model: string
    specs: string
    maxMileageKm: number | null
    residualPercent: number | null
  }) => void
}) {
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [specs, setSpecs] = useState('')
  const [maxMileageKm, setMaxMileageKm] = useState('')
  const [residualPercent, setResidualPercent] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!brand.trim() || !model.trim()) return
    onSave({
      brand: brand.trim(),
      model: model.trim(),
      specs: specs.trim(),
      maxMileageKm: maxMileageKm.trim() ? Number(maxMileageKm) : null,
      residualPercent: residualPercent.trim() ? Number(residualPercent) : null,
    })
    setBrand('')
    setModel('')
    setSpecs('')
    setMaxMileageKm('')
    setResidualPercent('')
  }

  return (
    <Modal open={open} title="Новая модель" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Бренд</label>
            <input
              required
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              className="input"
              placeholder="Eltreco"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Модель</label>
            <input
              required
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="input"
              placeholder="Patriot"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Характеристики</label>
          <input
            value={specs}
            onChange={(event) => setSpecs(event.target.value)}
            className="input"
            placeholder="500 Вт, 48В 17.5Ач"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Ресурс, км</label>
            <input
              type="number"
              min={1}
              value={maxMileageKm}
              onChange={(event) => setMaxMileageKm(event.target.value)}
              className="input"
              placeholder="10000"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Остаточная цена, %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={residualPercent}
              onChange={(event) => setResidualPercent(event.target.value)}
              className="input"
              placeholder="20"
            />
          </div>
        </div>
        <p className="text-xs text-zinc-600">
          Ресурс и остаточная цена — для расчёта износа в карточке велосипеда (необязательно)
        </p>
        <button type="submit" className="btn-primary w-full">
          Добавить
        </button>
      </form>
    </Modal>
  )
}

/** Деталь модели: информация + управление тарифами (POST/PATCH/DELETE /tariffs) */
function BikeModelDetailsModal({
  model,
  onClose,
  onChanged,
}: {
  model: BikeModel | null
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState<TariffUnit>('day')
  const [newPrice, setNewPrice] = useState('')
  const [editingInfo, setEditingInfo] = useState(false)
  const [infoBrand, setInfoBrand] = useState('')
  const [infoModel, setInfoModel] = useState('')
  const [infoSpecs, setInfoSpecs] = useState('')
  const [infoMaxMileage, setInfoMaxMileage] = useState('')
  const [infoResidual, setInfoResidual] = useState('')

  if (!model) return null
  const tariffs = model.tariffs ?? []

  const showError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback)

  const startInfoEdit = () => {
    setInfoBrand(model.brand)
    setInfoModel(model.model)
    setInfoSpecs(model.specs)
    setInfoMaxMileage(model.maxMileageKm != null ? String(model.maxMileageKm) : '')
    setInfoResidual(model.residualPercent != null ? String(model.residualPercent) : '')
    setEditingInfo(true)
    setError('')
  }

  const saveInfo = async (event: FormEvent) => {
    event.preventDefault()
    if (!infoBrand.trim() || !infoModel.trim()) return
    try {
      await api(`/bike-models/${model.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          brand: infoBrand.trim(),
          model: infoModel.trim(),
          specs: infoSpecs.trim(),
          maxMileageKm: infoMaxMileage.trim() ? Number(infoMaxMileage) : null,
          residualPercent: infoResidual.trim() ? Number(infoResidual) : null,
        }),
      })
      setEditingInfo(false)
      await onChanged()
    } catch (err) {
      // 409: модель с таким брендом и названием уже есть
      showError(err, 'Не удалось сохранить модель')
    }
  }

  const startEdit = (tariff: Tariff) => {
    setEditingId(tariff.id)
    setEditName(tariff.name)
    setEditPrice(String(tariff.price))
    setError('')
  }

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editingId || !editName.trim()) return
    try {
      await api(`/tariffs/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim(), price: Number(editPrice) || 0 }),
      })
      setEditingId(null)
      await onChanged()
    } catch (err) {
      showError(err, 'Не удалось сохранить тариф')
    }
  }

  const removeTariff = async (tariff: Tariff) => {
    if (!window.confirm(`Удалить тариф «${tariff.name}»?`)) return
    try {
      await api(`/tariffs/${tariff.id}`, { method: 'DELETE' })
      await onChanged()
    } catch (err) {
      showError(err, 'Не удалось удалить тариф')
    }
  }

  const addTariff = async (event: FormEvent) => {
    event.preventDefault()
    if (!newName.trim()) return
    try {
      await api('/tariffs', {
        method: 'POST',
        body: JSON.stringify({
          modelId: model.id,
          name: newName.trim(),
          unit: newUnit,
          price: Number(newPrice) || 0,
        }),
      })
      setNewName('')
      setNewUnit('day')
      setNewPrice('')
      setError('')
      await onChanged()
    } catch (err) {
      // 409: тариф с таким названием и единицей уже есть у модели
      showError(err, 'Не удалось добавить тариф')
    }
  }

  return (
    <Modal open title={`${model.brand} ${model.model}`} onClose={onClose}>
      <div className="space-y-4">
        {editingInfo ? (
          <form onSubmit={saveInfo} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                value={infoBrand}
                onChange={(event) => setInfoBrand(event.target.value)}
                className="input"
                placeholder="Бренд"
              />
              <input
                required
                value={infoModel}
                onChange={(event) => setInfoModel(event.target.value)}
                className="input"
                placeholder="Модель"
              />
            </div>
            <input
              value={infoSpecs}
              onChange={(event) => setInfoSpecs(event.target.value)}
              className="input"
              placeholder="Характеристики"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={1}
                value={infoMaxMileage}
                onChange={(event) => setInfoMaxMileage(event.target.value)}
                className="input"
                placeholder="Ресурс, км (10000)"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={infoResidual}
                onChange={(event) => setInfoResidual(event.target.value)}
                className="input"
                placeholder="Остаточная цена, % (20)"
              />
            </div>
            <div className="flex justify-end gap-1">
              <button
                type="submit"
                title="Сохранить"
                className="rounded-lg p-2 text-emerald-400 transition hover:bg-emerald-400/10"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                title="Отмена"
                onClick={() => setEditingInfo(false)}
                className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
              >
                <X size={16} />
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Информация
              </span>
              <button
                type="button"
                onClick={startInfoEdit}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-400"
              >
                <Pencil size={12} />
                Изменить
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-zinc-500">Характеристики</dt>
              <dd className="text-right text-zinc-300">{model.specs || '—'}</dd>
              <dt className="text-zinc-500">Ресурс, км</dt>
              <dd className="text-right text-zinc-300">
                {model.maxMileageKm != null ? formatNumber(model.maxMileageKm) : '—'}
              </dd>
              <dt className="text-zinc-500">Остаточная цена</dt>
              <dd className="text-right text-zinc-300">
                {model.residualPercent != null ? `${model.residualPercent}% цены покупки` : '—'}
              </dd>
              {model.createdAt && (
                <>
                  <dt className="text-zinc-500">Создана</dt>
                  <dd className="text-right text-zinc-300">{formatDate(model.createdAt)}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-400">Тарифы</h3>
          {tariffs.length === 0 ? (
            <p className="rounded-lg border border-white/10 px-3 py-2.5 text-sm text-zinc-600">
              Тарифов нет — добавьте первый ниже
            </p>
          ) : (
            <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
              {tariffs.map((tariff) => (
                <li key={tariff.id} className="px-3 py-2.5">
                  {editingId === tariff.id ? (
                    <form onSubmit={saveEdit} className="flex items-center gap-2">
                      <input
                        required
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="input"
                        placeholder="Название"
                      />
                      <input
                        required
                        type="number"
                        min={0}
                        value={editPrice}
                        onChange={(event) => setEditPrice(event.target.value)}
                        className="input w-24 shrink-0"
                        title={`Цена, ₽/${tariffUnitLabels[tariff.unit]}`}
                      />
                      <button
                        type="submit"
                        title="Сохранить"
                        className="shrink-0 rounded-lg p-2 text-emerald-400 transition hover:bg-emerald-400/10"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        title="Отмена"
                        onClick={() => setEditingId(null)}
                        className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
                      >
                        <X size={16} />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-200">{tariff.name}</p>
                        <p className="text-xs text-zinc-500">
                          {formatMoney(tariff.price)}/{tariffUnitLabels[tariff.unit]}
                        </p>
                      </div>
                      <button
                        type="button"
                        title="Редактировать"
                        onClick={() => startEdit(tariff)}
                        className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title="Удалить"
                        onClick={() => removeTariff(tariff)}
                        className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Добавление тарифа */}
          <form onSubmit={addTariff} className="mt-3 space-y-2">
            <input
              required
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="input"
              placeholder="Название тарифа, например «Дневной»"
            />
            <div className="flex gap-2">
              <select
                value={newUnit}
                onChange={(event) => setNewUnit(event.target.value as TariffUnit)}
                className="input"
              >
                {(Object.keys(tariffUnitLabels) as TariffUnit[]).map((value) => (
                  <option key={value} value={value}>
                    за {tariffUnitLabels[value]}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                min={0}
                value={newPrice}
                onChange={(event) => setNewPrice(event.target.value)}
                className="input"
                placeholder="Цена, ₽"
              />
              <button type="submit" className="btn-primary shrink-0">
                <Plus size={16} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  )
}
