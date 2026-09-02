import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  BatteryCharging,
  Bike,
  Check,
  ChevronDown,
  Gauge,
  Info,
  Lock,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Satellite,
  ShoppingBag,
  Trash2,
  TrendingDown,
  Wallet,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, PERMISSIONS } from '../auth/permissions'
import type { AccountOption, Asset, AssetDetail, AssetEventType, BikeModel, Category, CategoryKind, ChargeCycleLogEntry, GpsTracker, MileageLogEntry, Transaction } from '../types'
import { EmptyState } from '../components/EmptyState'
import { ChargeCyclesModal } from '../components/ChargeCyclesModal'
import { MileageModal } from '../components/MileageModal'
import { Modal } from '../components/Modal'
import { StatusBadge } from '../components/StatusBadge'
import { WriteOffModal } from '../components/WriteOffModal'
import { Loading } from '../components/Loading'
import { dateInputToIso, formatDate, formatDateTime, formatMoney, formatNumber, isoToDateInput, todayDateInput } from '../lib/format'
import {
  assetEventTypeLabels,
  assetStatusLabels,
  assetStatusTones,
  categoryKindLabels,
  rentalStatusLabels,
  rentalStatusTones,
  writeOffReasonLabels,
} from '../lib/labels'

const eventIcons: Record<AssetEventType, LucideIcon> = {
  purchase: ShoppingBag,
  mileage: Gauge,
  charge_cycles: RefreshCw,
  mount: BatteryCharging,
  unmount: BatteryCharging,
  tracker_install: Satellite,
  tracker_remove: Satellite,
  write_off: Ban,
  income: ArrowUpRight,
  expense: ArrowDownLeft,
}

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canViewFinance = hasPermission(user, PERMISSIONS.FINANCE_VIEW)

  const [detail, setDetail] = useState<AssetDetail | null>(null)
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [models, setModels] = useState<BikeModel[]>([])
  const [trackers, setTrackers] = useState<GpsTracker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mileageOpen, setMileageOpen] = useState(false)
  const [chargeCyclesOpen, setChargeCyclesOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)
  // Операция в режиме правки (null — создание новой); правка/удаление — с правом finance:view
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [trackerModalOpen, setTrackerModalOpen] = useState(false)
  const [batteryModalOpen, setBatteryModalOpen] = useState(false)
  const [chargerModalOpen, setChargerModalOpen] = useState(false)
  const [writeOffOpen, setWriteOffOpen] = useState(false)
  // Блоки истории свёрнуты по умолчанию, чтобы карточка не занимала много места
  const [mileageExpanded, setMileageExpanded] = useState(false)
  const [transactionsExpanded, setTransactionsExpanded] = useState(false)
  const [rentalsExpanded, setRentalsExpanded] = useState(false)
  const [eventsExpanded, setEventsExpanded] = useState(false)
  const [cyclesExpanded, setCyclesExpanded] = useState(false)

  const loadDetail = useCallback(async () => {
    try {
      setDetail(await api<AssetDetail>(`/assets/${id}/detail`))
      setError('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить карточку актива')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  // Справочники для имён в таблице операций; могут быть недоступны по правам — не критично
  useEffect(() => {
    api<AccountOption[]>('/finance/accounts/options').then(setAccounts).catch(() => setAccounts([]))
    api<Category[]>('/finance/categories').then(setCategories).catch(() => setCategories([]))
    api<BikeModel[]>('/bike-models').then(setModels).catch(() => setModels([]))
    // Только свободные (active, не установленные) трекеры для модалки установки
    api<GpsTracker[]>('/gps-trackers?available=true').then(setTrackers).catch(() => setTrackers([]))
  }, [])

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const saveMileage = async (assetId: string, mileageKm: number, recordedAt: string | null) => {
    await api(`/assets/${assetId}/mileage`, {
      method: 'POST',
      body: JSON.stringify({ mileageKm, ...(recordedAt ? { recordedAt } : {}) }),
    })
    await loadDetail()
    setMileageOpen(false)
  }

  // Правка/удаление записей журнала пробега — как у оплат аренды; ошибки кидаем в строку
  const saveMileageEntry = async (entry: MileageLogEntry, mileageKm: string, recordedAt: string) => {
    await api(`/assets/${id}/mileage/${entry.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ mileageKm: Number(mileageKm), recordedAt: new Date(recordedAt).toISOString() }),
    })
    await loadDetail()
  }

  const deleteMileageEntry = async (entry: MileageLogEntry) => {
    await api(`/assets/${id}/mileage/${entry.id}`, { method: 'DELETE' })
    await loadDetail()
  }

  // Удаление операции актива (с правом finance:view); баланс счёта вычисляемый — сам пересчитается
  const deleteTransaction = async (transaction: Transaction) => {
    const noun = transaction.kind === 'income' ? 'приход' : 'расход'
    if (!window.confirm(`Удалить ${noun} ${formatMoney(transaction.amount)}?`)) return
    try {
      await api(`/finance/transactions/${transaction.id}`, { method: 'DELETE' })
      await loadDetail()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить операцию')
    }
  }

  const saveChargeCycles = async (assetId: string, cycles: number, recordedAt: string | null) => {
    await api(`/assets/${assetId}/charge-cycles`, {
      method: 'POST',
      body: JSON.stringify({ cycles, ...(recordedAt ? { recordedAt } : {}) }),
    })
    await loadDetail()
    setChargeCyclesOpen(false)
  }

  // Правка/удаление записей журнала циклов — механика как у пробега
  const saveChargeCycleEntry = async (entry: ChargeCycleLogEntry, cycles: string, recordedAt: string) => {
    await api(`/assets/${id}/charge-cycles/${entry.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ cycles: Number(cycles), recordedAt: new Date(recordedAt).toISOString() }),
    })
    await loadDetail()
  }

  const deleteChargeCycleEntry = async (entry: ChargeCycleLogEntry) => {
    await api(`/assets/${id}/charge-cycles/${entry.id}`, { method: 'DELETE' })
    await loadDetail()
  }

  const removeTracker = async () => {
    if (!window.confirm('Снять GPS-трекер с велосипеда?')) return
    try {
      await api(`/assets/${id}/tracker`, { method: 'DELETE' })
      await loadDetail()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось снять трекер')
    }
  }

  const unmountAccessory = async (item: Asset) => {
    const label = item.type === 'battery' ? 'АКБ' : 'зарядник'
    if (!window.confirm(`Демонтировать ${label} «${item.name}»?`)) return
    try {
      await api(`/assets/${item.id}/mount`, { method: 'DELETE' })
      await loadDetail()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Не удалось демонтировать ${label}`)
    }
  }

  const backLink = (
    <div>
      <button
        type="button"
        onClick={() => navigate('/park')}
        className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
      >
        <ArrowLeft size={16} />
        Назад к парку
      </button>
    </div>
  )

  if (loading) {
    return <Loading />
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error || 'Актив не найден'}
        </p>
      </div>
    )
  }

  const { asset, mountedBatteries, mountedChargers, mileageLog, chargeCycleLog, transactions, rentals, events, totals } = detail
  const isBike = asset.type === 'bike'
  // Подписи блока операций по типу актива
  const operationsTitle =
    asset.type === 'battery' ? 'Операции по АКБ' : asset.type === 'charger' ? 'Операции по заряднику' : 'Операции по велосипеду'
  const operationsEmptyHint =
    asset.type === 'battery' ? 'к этой АКБ' : asset.type === 'charger' ? 'к этому заряднику' : 'к этому велосипеду'
  // Вложено: покупка + расходы + смонтированные АКБ/зарядник (только у велосипеда есть комплект)
  const invested =
    totals.purchasePrice + totals.expensesTotal + totals.batteryTotal + totals.chargerTotal
  // Принесло: позиции аренд с этим активом + приходные операции
  const earned = totals.rentalAccruedTotal + totals.incomeTotal
  const payback = earned - invested
  // Износ по пробегу: только у велосипеда, если у модели задан ресурс
  const assetModel = models.find((m) => m.id === asset.modelId)
  const showWear =
    isBike &&
    assetModel?.maxMileageKm != null &&
    asset.mileageKm != null &&
    totals.purchasePrice > 0
  const wearRatio = showWear
    ? Math.min(1, (asset.mileageKm ?? 0) / (assetModel?.maxMileageKm ?? 1))
    : 0
  const residualRatio = (assetModel?.residualPercent ?? 0) / 100
  // Остаточная стоимость: от цены покупки до residual% при достижении ресурса
  const residualValue = Math.round(
    totals.purchasePrice * (residualRatio + (1 - residualRatio) * (1 - wearRatio)),
  )
  // Выбывший актив (продан/выкуплен/списан) — карточка read-only
  const writtenOff =
    asset.status === 'sold' || asset.status === 'decommissioned' || asset.status === 'bought_out'
  // Списание нельзя провести из аренды (409) и повторно
  const canWriteOff = !writtenOff && asset.status !== 'rented'

  return (
    <div className="space-y-6">
      {backLink}

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Заголовок */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-zinc-100">{asset.name}</h1>
        <span className="font-mono text-sm text-zinc-500">{asset.inventoryNumber}</span>
        <StatusBadge
          label={assetStatusLabels[asset.status]}
          tone={assetStatusTones[asset.status]}
        />
      </div>

      {/* Паспорт */}
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Паспорт</h2>
          <span className="inline-flex gap-2">
            {!writtenOff && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-400"
              >
                <Pencil size={14} />
                Редактировать
              </button>
            )}
            {canWriteOff && (
              <button
                type="button"
                onClick={() => setWriteOffOpen(true)}
                title="Списать"
                className="inline-flex items-center justify-center rounded-full border border-red-400/20 p-1.5 text-red-400 transition hover:bg-red-400/10"
              >
                <Ban size={14} />
              </button>
            )}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {isBike && (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Модель</dt>
              <dd className="text-zinc-300">{asset.modelName ?? '—'}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Инв. номер</dt>
            <dd className="font-mono text-zinc-300">{asset.inventoryNumber}</dd>
          </div>
          {(isBike || asset.type === 'battery') && (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{isBike ? 'VIN рамы' : 'Заводской номер'}</dt>
              <dd className="font-mono text-zinc-300">{asset.vin || '—'}</dd>
            </div>
          )}
          {asset.type === 'battery' && (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Вольтаж / ёмкость</dt>
                <dd className="text-zinc-300">
                  {asset.voltage != null ? `${asset.voltage} В` : '—'}
                  {' / '}
                  {asset.capacityAh != null ? `${asset.capacityAh} А·ч` : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Циклы перезарядки</dt>
                <dd className="text-zinc-300">
                  {asset.chargeCycles != null ? formatNumber(asset.chargeCycles) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Установлена</dt>
                <dd className="text-zinc-300">{asset.bikeName ?? 'На складе'}</dd>
              </div>
              {asset.bundledBikeName && (
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">В комплекте с</dt>
                  <dd className="text-zinc-300">{asset.bundledBikeName}</dd>
                </div>
              )}
            </>
          )}
          {asset.type === 'charger' && (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Мощность</dt>
                <dd className="text-zinc-300">
                  {asset.powerW != null ? `${asset.powerW} Вт` : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Установлен</dt>
                <dd className="text-zinc-300">{asset.bikeName ?? 'На складе'}</dd>
              </div>
              {asset.bundledBikeName && (
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">В комплекте с</dt>
                  <dd className="text-zinc-300">{asset.bundledBikeName}</dd>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Дата покупки</dt>
            <dd className="text-zinc-300">
              {asset.purchasedAt ? formatDate(asset.purchasedAt) : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Цена покупки</dt>
            <dd className="text-zinc-300">
              {asset.purchasePrice != null ? formatMoney(asset.purchasePrice) : '—'}
            </dd>
          </div>
          {asset.writeOffReason && (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Причина выбытия</dt>
                <dd className="text-zinc-300">
                  {writeOffReasonLabels[asset.writeOffReason] ?? asset.writeOffReason}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Дата выбытия</dt>
                <dd className="text-zinc-300">
                  {asset.writtenOffAt ? formatDate(asset.writtenOffAt) : '—'}
                </dd>
              </div>
            </>
          )}
        </dl>
        {asset.description && (
          <p className="mt-3 border-t border-white/5 pt-3 text-sm text-zinc-400">
            {asset.description}
          </p>
        )}

        {/* GPS-трекер — только у велосипедов */}
        {isBike && (
          <>
            <h3 className="mt-5 border-t border-white/5 pt-4 text-sm font-semibold text-zinc-100">
              GPS-трекер
            </h3>
            {asset.gpsTrackerId ? (
          <div className="mt-3">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Модель</dt>
                <dd className="text-zinc-300">{asset.gpsTrackerModel ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Номер SIM</dt>
                <dd className="text-zinc-300">{asset.gpsSimNumber || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Оператор</dt>
                <dd className="text-zinc-300">{asset.gpsOperator || '—'}</dd>
              </div>
            </dl>
            {!writtenOff && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={removeTracker}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
                >
                  Снять трекер
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <p className="text-sm text-zinc-600">Не установлен</p>
            {!writtenOff && (
              <button
                type="button"
                onClick={() => setTrackerModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-400"
              >
                <Satellite size={14} />
                Установить трекер
              </button>
            )}
          </div>
        )}
          </>
        )}
      </section>

      {/* Смонтировано — только у велосипедов; АКБ и зарядник строго по одному */}
      {isBike && (
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Смонтировано</h2>
          {!writtenOff && (
            <span className="inline-flex gap-2">
              {mountedBatteries.length === 0 && (
                <button
                  type="button"
                  onClick={() => setBatteryModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-400"
                >
                  <Plus size={14} />
                  Смонтировать АКБ
                </button>
              )}
              {mountedChargers.length === 0 && (
                <button
                  type="button"
                  onClick={() => setChargerModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-400"
                >
                  <Plus size={14} />
                  Смонтировать зарядник
                </button>
              )}
            </span>
          )}
        </div>
        {mountedBatteries.length === 0 && mountedChargers.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Ничего не смонтировано</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {[...mountedBatteries, ...mountedChargers].map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                {item.type === 'battery' ? (
                  <BatteryCharging size={16} className="shrink-0 text-zinc-500" />
                ) : (
                  <Zap size={16} className="shrink-0 text-zinc-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200">
                    {item.name}{' '}
                    <span className="font-mono text-xs text-zinc-500">
                      {item.inventoryNumber}
                    </span>
                  </p>
                </div>
                {!writtenOff && (
                  <button
                    type="button"
                    onClick={() => unmountAccessory(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-400/20"
                  >
                    Демонтировать
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {/* Итоги: у велосипеда — экономика комплекта, у АКБ/зарядника — только стоимость */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {isBike ? (
          <>
            <TotalCard
              title="Вложено"
              value={formatMoney(invested)}
              icon={Wallet}
              hint="Покупка велосипеда + расходы на него (ремонты и т.п.) + стоимость смонтированных сейчас АКБ и зарядника. Снапшот «на сейчас», не история."
              lines={[
                `Покупка: ${formatMoney(totals.purchasePrice)}`,
                `Расходы: ${formatMoney(totals.expensesTotal)}`,
                `АКБ: ${formatMoney(totals.batteryTotal)}`,
                `Зарядник: ${formatMoney(totals.chargerTotal)}`,
              ]}
            />
            <TotalCard
              title="Принёс"
              value={formatMoney(earned)}
              icon={Receipt}
              hint="Начисленная выручка от аренд с этим активом + приходные операции по нему."
            />
            <TotalCard
              title="Окупаемость"
              value={formatMoney(payback)}
              icon={payback >= 0 ? ArrowUpRight : ArrowDownLeft}
              tone={payback >= 0 ? 'emerald' : 'red'}
              hint="Принёс минус Вложено. Без остаточной — чисто по деньгам, которые прошли через кассу. С остаточной — плюс остаточная стоимость байка (за сколько его можно продать сейчас), реальный результат владения «на сейчас»."
              {...(showWear
                ? {
                    valueLabel: 'Без остаточной',
                    secondValue: formatMoney(payback + residualValue),
                    secondValueLabel: 'С остаточной',
                    secondTone: payback + residualValue >= 0 ? ('emerald' as const) : ('red' as const),
                  }
                : {})}
            />
            {showWear && (
              <TotalCard
                title="Износ"
                value={`${Math.round(wearRatio * 100)}%`}
                icon={TrendingDown}
                hint="Износ = пробег / ресурс модели (максимум 100%). Остаточная стоимость — за сколько примерно можно продать сам байк: цена покупки × (остаточный % + (100% − остаточный %) × (1 − износ))."
                lines={[
                  `Остаточная стоимость: ${formatMoney(residualValue)}`,
                  ...(assetModel?.residualPercent != null
                    ? [
                        `При ${formatNumber(assetModel.maxMileageKm ?? 0)} км → ~${formatMoney(
                          Math.round(totals.purchasePrice * residualRatio),
                        )}`,
                      ]
                    : []),
                ]}
              />
            )}
          </>
        ) : (
          <>
            <TotalCard
              title="Стоимость"
              value={formatMoney(totals.purchasePrice + totals.expensesTotal)}
              icon={Wallet}
              hint="Покупка + расходы на этот актив. Окупаемости у АКБ/зарядника нет: когда актив в комплекте, его выручка живёт у велосипеда."
              lines={[
                `Покупка: ${formatMoney(totals.purchasePrice)}`,
                `Расходы: ${formatMoney(totals.expensesTotal)}`,
              ]}
            />
            {earned > 0 && (
              <TotalCard
                title="Принесла от отдельных аренд"
                value={formatMoney(earned)}
                icon={Receipt}
                hint="Выручка только от аренд, где актив сдавался отдельной позицией со своим тарифом (не в комплекте с велосипедом)."
              />
            )}
          </>
        )}
        {asset.type === 'battery' && (
          <TotalCard
            title="Циклы перезарядки"
            value={asset.chargeCycles != null ? formatNumber(asset.chargeCycles) : '—'}
            icon={RefreshCw}
          />
        )}
      </section>

      {/* Пробег: у велосипеда и АКБ — текущее значение, добавление и история записей */}
      {asset.type !== 'charger' && (
      <section className="panel">
        <div className={`flex items-center justify-between px-5 py-4 ${mileageExpanded ? 'border-b border-white/5' : ''}`}>
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-white/5 p-2 text-zinc-400">
              <Gauge size={16} />
            </span>
            <div className="flex items-baseline gap-2">
              <h2 className="font-semibold text-zinc-100">Пробег</h2>
              <span className="text-sm text-zinc-400">
                {asset.mileageKm != null ? `${formatNumber(asset.mileageKm)} км` : 'не записан'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMileageExpanded((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
            >
              <ChevronDown
                size={14}
                className={`transition-transform ${mileageExpanded ? '' : '-rotate-90'}`}
              />
              История пробегов
              <span className="text-zinc-600">{mileageLog.length}</span>
            </button>
            {!writtenOff && (
              <button
                type="button"
                onClick={() => setMileageOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-medium text-emerald-400 transition hover:bg-emerald-400/10"
              >
                <Plus size={14} />
                Добавить пробег
              </button>
            )}
          </div>
        </div>
        {mileageExpanded && (
          mileageLog.length === 0 ? (
            <EmptyState icon={Gauge} title="Записей нет" description="Запишите первое значение пробега" />
          ) : (
            <div className="space-y-2 p-4">
              {mileageLog.map((entry) => (
                <MileageRow
                  key={entry.id}
                  entry={entry}
                  readOnly={writtenOff}
                  onSave={saveMileageEntry}
                  onDelete={deleteMileageEntry}
                />
              ))}
            </div>
          )
        )}
      </section>
      )}

      {/* Циклы перезарядки: только у АКБ — текущее значение, добавление и история записей */}
      {asset.type === 'battery' && (
      <section className="panel">
        <div className={`flex items-center justify-between px-5 py-4 ${cyclesExpanded ? 'border-b border-white/5' : ''}`}>
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-white/5 p-2 text-zinc-400">
              <RefreshCw size={16} />
            </span>
            <div className="flex items-baseline gap-2">
              <h2 className="font-semibold text-zinc-100">Циклы перезарядки</h2>
              <span className="text-sm text-zinc-400">
                {asset.chargeCycles != null ? formatNumber(asset.chargeCycles) : 'не записаны'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCyclesExpanded((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
            >
              <ChevronDown
                size={14}
                className={`transition-transform ${cyclesExpanded ? '' : '-rotate-90'}`}
              />
              История циклов
              <span className="text-zinc-600">{chargeCycleLog.length}</span>
            </button>
            {!writtenOff && (
              <button
                type="button"
                onClick={() => setChargeCyclesOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-medium text-emerald-400 transition hover:bg-emerald-400/10"
              >
                <Plus size={14} />
                Записать циклы
              </button>
            )}
          </div>
        </div>
        {cyclesExpanded && (
          chargeCycleLog.length === 0 ? (
            <EmptyState icon={RefreshCw} title="Записей нет" description="Запишите первое значение циклов" />
          ) : (
            <div className="space-y-2 p-4">
              {chargeCycleLog.map((entry) => (
                <ChargeCycleRow
                  key={entry.id}
                  entry={entry}
                  readOnly={writtenOff}
                  onSave={saveChargeCycleEntry}
                  onDelete={deleteChargeCycleEntry}
                />
              ))}
            </div>
          )
        )}
      </section>
      )}

      {/* Операции по активу */}
      <section className="panel">
        <div className={`flex items-center justify-between px-5 py-4 ${transactionsExpanded ? 'border-b border-white/5' : ''}`}>
          <button
            type="button"
            onClick={() => setTransactionsExpanded((value) => !value)}
            className="inline-flex items-center gap-2 font-semibold text-zinc-100 transition hover:text-white"
          >
            <ChevronDown
              size={16}
              className={`text-zinc-500 transition-transform ${transactionsExpanded ? '' : '-rotate-90'}`}
            />
            {operationsTitle}
            <span className="text-sm font-normal text-zinc-500">{transactions.length}</span>
          </button>
          {!writtenOff && (
            <button
              type="button"
              onClick={() => {
                setEditingTransaction(null)
                setTransactionOpen(true)
              }}
              className="btn-primary"
            >
              <Plus size={16} />
              Добавить операцию
            </button>
          )}
        </div>
        {transactionsExpanded && (
          transactions.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Операций нет"
            description={`Привяжите первую операцию ${operationsEmptyHint}`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">Дата</th>
                  <th className="th">Счёт</th>
                  <th className="th">Статья</th>
                  <th className="th">Комментарий</th>
                  <th className="th text-right">Сумма</th>
                  <th className="th text-right" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction, index) => {
                  const isIncome = transaction.kind === 'income'
                  return (
                    <tr
                      key={transaction.id}
                      className={`transition hover:bg-white/5 ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
                    >
                      <td className="td text-zinc-500">{formatDateTime(transaction.date)}</td>
                      <td className="td">{accountById.get(transaction.accountId)?.name ?? '—'}</td>
                      <td className="td">{categoryById.get(transaction.categoryId)?.name ?? '—'}</td>
                      <td className="td max-w-56">
                        <span className="block truncate text-zinc-500" title={transaction.comment}>
                          {transaction.comment}
                        </span>
                      </td>
                      <td className="td text-right">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            isIncome ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {isIncome ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                          {isIncome ? '+' : '−'}
                          {formatMoney(transaction.amount)}
                        </span>
                      </td>
                      <td className="td text-right">
                        {/* Системные операции (покупка/продажа) не правятся — меняется само действие;
                            остальные правятся отсюда (в разделе «Финансы» они read-only) */}
                        {transaction.system ? (
                          <span
                            className="inline-flex p-2 text-zinc-600"
                            title="Системная операция — создана автоматически (покупка/продажа техники), изменить нельзя"
                          >
                            <Lock size={14} />
                          </span>
                        ) : canViewFinance ? (
                          <span className="inline-flex gap-1">
                            <button
                              type="button"
                              title="Редактировать"
                              onClick={() => {
                                setEditingTransaction(transaction)
                                setTransactionOpen(true)
                              }}
                              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              title="Удалить"
                              onClick={() => void deleteTransaction(transaction)}
                              className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                            >
                              <Trash2 size={16} />
                            </button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )
        )}
      </section>

      {/* История аренд */}
      <section className="panel">
        <div className={`flex items-center justify-between px-5 py-4 ${rentalsExpanded ? 'border-b border-white/5' : ''}`}>
          <button
            type="button"
            onClick={() => setRentalsExpanded((value) => !value)}
            className="inline-flex items-center gap-2 font-semibold text-zinc-100 transition hover:text-white"
          >
            <ChevronDown
              size={16}
              className={`text-zinc-500 transition-transform ${rentalsExpanded ? '' : '-rotate-90'}`}
            />
            История аренд
            <span className="text-sm font-normal text-zinc-500">{rentals.length}</span>
          </button>
        </div>
        {rentalsExpanded && (
          rentals.length === 0 ? (
          <EmptyState icon={Bike} title="Аренд не было" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">Клиент</th>
                  <th className="th">Начало</th>
                  <th className="th">Окончание</th>
                  <th className="th text-right">Сумма аренды</th>
                  <th className="th text-right">Принёс актив</th>
                  <th className="th">Статус</th>
                </tr>
              </thead>
              <tbody>
                {rentals.map((entry, index) => (
                  <tr
                    key={entry.rental.id}
                    className={`transition hover:bg-white/5 ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
                  >
                    <td className="td font-medium text-zinc-200">{entry.rental.customerName}</td>
                    <td className="td text-zinc-500">{formatDateTime(entry.rental.startAt)}</td>
                    <td className="td text-zinc-500">
                      {entry.rental.plannedEndAt ? formatDateTime(entry.rental.plannedEndAt) : '—'}
                    </td>
                    <td className="td text-right">{formatMoney(entry.rental.amount)}</td>
                    <td className="td text-right text-emerald-400">
                      {formatMoney(entry.earnedAmount)}
                    </td>
                    <td className="td">
                      <StatusBadge
                        label={rentalStatusLabels[entry.rental.status]}
                        tone={rentalStatusTones[entry.rental.status]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        )}
      </section>

      {/* История: лента событий актива (в самом низу карточки) */}
      <section className="panel">
        <div className={`flex items-center justify-between px-5 py-4 ${eventsExpanded ? 'border-b border-white/5' : ''}`}>
          <button
            type="button"
            onClick={() => setEventsExpanded((value) => !value)}
            className="inline-flex items-center gap-2 font-semibold text-zinc-100 transition hover:text-white"
          >
            <ChevronDown
              size={16}
              className={`text-zinc-500 transition-transform ${eventsExpanded ? '' : '-rotate-90'}`}
            />
            История
            <span className="text-sm font-normal text-zinc-500">{events.length}</span>
          </button>
        </div>
        {eventsExpanded && (
          events.length === 0 ? (
          <EmptyState icon={Bike} title="Событий пока нет" />
        ) : (
          <ul className="divide-y divide-white/5">
            {events.map((event) => {
              const Icon = eventIcons[event.type] ?? Bike
              return (
                <li key={event.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="rounded-lg bg-white/5 p-2 text-zinc-400">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200">
                      {assetEventTypeLabels[event.type] ?? event.type}
                      {event.amount != null && (
                        <span className="ml-2 text-zinc-400">({formatMoney(event.amount)})</span>
                      )}
                    </p>
                    {event.comment && (
                      <p className="mt-0.5 truncate text-xs text-zinc-500" title={event.comment}>
                        {event.comment}
                      </p>
                    )}
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
          )
        )}
      </section>

      <MileageModal
        asset={mileageOpen ? asset : null}
        minRecordedAt={mileageLog[0]?.recordedAt ?? null}
        onClose={() => setMileageOpen(false)}
        onSave={saveMileage}
      />

      <ChargeCyclesModal
        asset={chargeCyclesOpen ? asset : null}
        minRecordedAt={chargeCycleLog[0]?.recordedAt ?? null}
        onClose={() => setChargeCyclesOpen(false)}
        onSave={saveChargeCycles}
      />

      <AssetTransactionModal
        key={editingTransaction?.id ?? 'new'}
        open={transactionOpen}
        assetId={asset.id}
        editing={editingTransaction}
        accounts={accounts}
        categories={categories}
        onClose={() => {
          setTransactionOpen(false)
          setEditingTransaction(null)
        }}
        onSaved={() => {
          setTransactionOpen(false)
          setEditingTransaction(null)
          void loadDetail()
        }}
      />

      <AssetEditModal
        key={asset.id}
        open={editOpen}
        asset={asset}
        models={models}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false)
          void loadDetail()
        }}
      />

      <TrackerInstallModal
        open={trackerModalOpen}
        assetId={asset.id}
        trackers={trackers}
        onClose={() => setTrackerModalOpen(false)}
        onSaved={() => {
          setTrackerModalOpen(false)
          void loadDetail()
        }}
      />

      <AccessoryMountModal
        open={batteryModalOpen}
        type="battery"
        bikeId={asset.id}
        onClose={() => setBatteryModalOpen(false)}
        onSaved={() => {
          setBatteryModalOpen(false)
          void loadDetail()
        }}
      />

      <AccessoryMountModal
        open={chargerModalOpen}
        type="charger"
        bikeId={asset.id}
        onClose={() => setChargerModalOpen(false)}
        onSaved={() => {
          setChargerModalOpen(false)
          void loadDetail()
        }}
      />

      <WriteOffModal
        key={`wo-${asset.id}`}
        asset={writeOffOpen ? asset : null}
        accounts={accounts}
        onClose={() => setWriteOffOpen(false)}
        onSaved={() => {
          setWriteOffOpen(false)
          void loadDetail()
        }}
      />
    </div>
  )
}

function TotalCard({
  title,
  value,
  icon: Icon,
  tone = 'zinc',
  lines,
  hint,
  valueLabel,
  secondValue,
  secondValueLabel,
  secondTone,
}: {
  title: string
  value: string
  icon: typeof Wallet
  tone?: 'zinc' | 'emerald' | 'red'
  /** Разбивка суммы маленькими строками под цифрой */
  lines?: string[]
  /** Подсказка «как считается», тултип по иконке рядом с заголовком */
  hint?: string
  /** Подпись под основной цифрой (при двух цифрах) */
  valueLabel?: string
  /** Вторая большая цифра рядом с основной */
  secondValue?: string
  secondValueLabel?: string
  secondTone?: 'zinc' | 'emerald' | 'red'
}) {
  const toneClasses = {
    zinc: 'bg-white/5 text-zinc-400',
    emerald: 'bg-emerald-400/10 text-emerald-400',
    red: 'bg-red-400/10 text-red-400',
  }[tone]
  const valueClasses = {
    zinc: 'text-zinc-100',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
  }[tone]

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm text-zinc-500">
          {title}
          {hint && (
            <span className="group relative cursor-help text-zinc-600 hover:text-zinc-400">
              <Info size={13} />
              <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 hidden w-64 -translate-x-1/2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-normal normal-case leading-relaxed text-zinc-300 shadow-xl group-hover:block">
                {hint}
              </span>
            </span>
          )}
        </span>
        <span className={`rounded-lg p-2 ${toneClasses}`}>
          <Icon size={18} />
        </span>
      </div>
      {secondValue != null ? (
        <div className="mt-3 flex gap-6">
          <div>
            <div className="text-xs text-zinc-500">{valueLabel}</div>
            <div className={`text-2xl font-semibold ${valueClasses}`}>{value}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">{secondValueLabel}</div>
            <div
              className={`text-2xl font-semibold ${
                { zinc: 'text-zinc-100', emerald: 'text-emerald-400', red: 'text-red-400' }[
                  secondTone ?? 'zinc'
                ]
              }`}
            >
              {secondValue}
            </div>
          </div>
        </div>
      ) : (
        <div className={`mt-3 text-2xl font-semibold ${valueClasses}`}>{value}</div>
      )}
      {lines && (
        <div className="mt-2 space-y-0.5">
          {lines.map((line) => (
            <p key={line} className="text-xs text-zinc-500">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** Операция, привязанная к активу (POST /finance/transactions с assetId); с editing — правка (PATCH) */
function AssetTransactionModal({
  open,
  assetId,
  editing,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean
  assetId: string
  editing: Transaction | null
  accounts: AccountOption[]
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}) {
  const [kind, setKind] = useState<CategoryKind>(editing?.kind ?? 'income')
  const [accountId, setAccountId] = useState(editing?.accountId ?? '')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [comment, setComment] = useState(editing?.comment ?? '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const kindCategories = categories.filter((c) => c.kind === kind)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const value = Number(amount)
    if (!accountId || !categoryId || !value || value <= 0) return
    setSubmitting(true)
    setError('')
    try {
      if (editing) {
        // Правка: тип операции и привязка к активу не меняются (как и у аренды)
        await api(`/finance/transactions/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            accountId,
            categoryId,
            amount: value,
            comment: comment.trim(),
          }),
        })
      } else {
        await api('/finance/transactions', {
          method: 'POST',
          body: JSON.stringify({
            accountId,
            categoryId,
            kind,
            amount: value,
            comment: comment.trim(),
            assetId,
          }),
        })
      }
      onSaved()
    } catch (err) {
      // 403: недостаточно прав (например, расход не для админа) — текст сервера
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить операцию')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={editing ? 'Редактировать операцию' : 'Операция по активу'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Тип операции задаётся при создании; при правке он фиксирован */}
        {!editing && (
        <div className="flex gap-1 rounded-lg border border-white/10 p-1">
          {(['income', 'expense'] as CategoryKind[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setKind(value)
                setCategoryId('')
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                kind === value
                  ? value === 'income'
                    ? 'bg-emerald-400/10 text-emerald-400'
                    : 'bg-red-400/10 text-red-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {categoryKindLabels[value]}
            </button>
          ))}
        </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Счёт</label>
          <select
            required
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="input"
          >
            <option value="">Выберите счёт…</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Статья</label>
          <select
            required
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="input"
          >
            <option value="">Выберите статью…</option>
            {kindCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Сумма, ₽</label>
          <input
            required
            type="number"
            min={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="input"
            placeholder="0"
          />
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
          {editing ? 'Сохранить' : 'Добавить'}
        </button>
      </form>
    </Modal>
  )
}

/** Редактирование паспорта актива (PATCH /assets/{id}) — все три типа */
function AssetEditModal({
  open,
  asset,
  models,
  onClose,
  onSaved,
}: {
  open: boolean
  asset: Asset
  models: BikeModel[]
  onClose: () => void
  onSaved: () => void
}) {
  const isBike = asset.type === 'bike'
  const isBattery = asset.type === 'battery'
  const isCharger = asset.type === 'charger'
  // Комплектный актив: покупка наследуется от велосипеда, поля скрываем и не шлём
  const bundled = asset.bundledBikeId != null
  const [inventoryNumber, setInventoryNumber] = useState(asset.inventoryNumber)
  const [name, setName] = useState(asset.name)
  const [modelId, setModelId] = useState(asset.modelId ?? '')
  const [description, setDescription] = useState(asset.description)
  const [purchasedAt, setPurchasedAt] = useState(isoToDateInput(asset.purchasedAt))
  const [purchasePrice, setPurchasePrice] = useState(
    asset.purchasePrice != null ? String(asset.purchasePrice) : '',
  )
  const [voltage, setVoltage] = useState(asset.voltage != null ? String(asset.voltage) : '')
  const [vin, setVin] = useState(asset.vin ?? '')
  const [capacityAh, setCapacityAh] = useState(asset.capacityAh != null ? String(asset.capacityAh) : '')
  const [powerW, setPowerW] = useState(asset.powerW != null ? String(asset.powerW) : '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!inventoryNumber.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await api(`/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          inventoryNumber: inventoryNumber.trim(),
          ...((isBike || isBattery) ? { vin: vin.trim() || null } : {}),
          ...(!isBike && name.trim() ? { name: name.trim() } : {}),
          ...(isBike && modelId ? { modelId } : {}),
          description: description.trim(),
          ...(!bundled && purchasedAt ? { purchasedAt: dateInputToIso(purchasedAt) } : {}),
          ...(!bundled && purchasePrice.trim() ? { purchasePrice: Number(purchasePrice) } : {}),
          ...(isBattery && voltage.trim() ? { voltage: Number(voltage) } : {}),
          ...(isBattery && capacityAh.trim() ? { capacityAh: Number(capacityAh) } : {}),
          ...(isCharger && powerW.trim() ? { powerW: Number(powerW) } : {}),
        }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить актив')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={`Редактировать: ${asset.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Инв. номер</label>
          <input
            required
            value={inventoryNumber}
            onChange={(event) => setInventoryNumber(event.target.value)}
            className="input"
          />
        </div>
        {(isBike || isBattery) && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">
              {isBike ? 'VIN рамы' : 'Заводской номер (VIN)'}
            </label>
            <input
              value={vin}
              onChange={(event) => setVin(event.target.value)}
              className="input"
              placeholder="Необязательно"
            />
          </div>
        )}
        {!isBike && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Название</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="input"
              placeholder="Необязательно"
            />
          </div>
        )}
        {isBike && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Модель</label>
            <select
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              className="input"
            >
              <option value="">Без модели</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.brand} {model.model}
                </option>
              ))}
            </select>
          </div>
        )}
        {isBattery && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Вольтаж, В</label>
              <input
                type="number"
                min={0}
                value={voltage}
                onChange={(event) => setVoltage(event.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Ёмкость, А·ч</label>
              <input
                type="number"
                min={0}
                value={capacityAh}
                onChange={(event) => setCapacityAh(event.target.value)}
                className="input"
              />
            </div>
          </div>
        )}
        {isCharger && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Мощность, Вт</label>
            <input
              type="number"
              min={0}
              value={powerW}
              onChange={(event) => setPowerW(event.target.value)}
              className="input"
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Описание</label>
          <textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="input resize-none"
          />
        </div>
        {bundled ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-500">
            В комплекте с {asset.bundledBikeName ?? 'велосипедом'} — дата и цена покупки
            наследуются от него и не редактируются
          </p>
        ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Дата покупки</label>
            <input
              type="date"
              max={todayDateInput()}
              value={purchasedAt}
              onChange={(event) => setPurchasedAt(event.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Цена покупки, ₽</label>
            <input
              type="number"
              min={0}
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              className="input"
              placeholder="0"
            />
          </div>
        </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          Сохранить
        </button>
      </form>
    </Modal>
  )
}

/** Установка GPS-трекера (POST /assets/{id}/tracker/{trackerId}) */
function TrackerInstallModal({
  open,
  assetId,
  trackers,
  onClose,
  onSaved,
}: {
  open: boolean
  assetId: string
  trackers: GpsTracker[]
  onClose: () => void
  onSaved: () => void
}) {
  const [trackerId, setTrackerId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!trackerId) return
    setSubmitting(true)
    setError('')
    try {
      await api(`/assets/${assetId}/tracker/${trackerId}`, { method: 'POST' })
      onSaved()
    } catch (err) {
      // 409: трекер уже установлен на другом велосипеде
      setError(err instanceof ApiError ? err.message : 'Не удалось установить трекер')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title="Установить GPS-трекер" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Трекер</label>
          <select
            required
            value={trackerId}
            onChange={(event) => setTrackerId(event.target.value)}
            className="input"
          >
            <option value="">Выберите трекер…</option>
            {trackers.map((tracker) => (
              <option key={tracker.id} value={tracker.id}>
                {tracker.model}
                {tracker.imei ? ` · ${tracker.imei}` : ''}
                {tracker.simPhoneNumber ? ` · ${tracker.simPhoneNumber}` : ''}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          Установить
        </button>
      </form>
    </Modal>
  )
}

/** Монтаж АКБ или зарядника на велосипед (POST /assets/{assetId}/mount/{bikeId}) */
function AccessoryMountModal({
  open,
  type,
  bikeId,
  onClose,
  onSaved,
}: {
  open: boolean
  type: 'battery' | 'charger'
  bikeId: string
  onClose: () => void
  onSaved: () => void
}) {
  const label = type === 'battery' ? 'АКБ' : 'зарядник'
  const [items, setItems] = useState<Asset[]>([])
  const [assetId, setAssetId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Свободные: доступны и нигде не смонтированы
  useEffect(() => {
    if (!open) return
    setError('')
    setAssetId('')
    api<Asset[]>(`/assets?type=${type}&status=available`)
      .then((list) => setItems(list.filter((item) => item.bikeId == null)))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить список'),
      )
  }, [open, type])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!assetId) return
    setSubmitting(true)
    setError('')
    try {
      await api(`/assets/${assetId}/mount/${bikeId}`, { method: 'POST' })
      onSaved()
    } catch (err) {
      // 409: занято, на велосипеде уже есть такой актив и т.п. — текст сервера
      setError(err instanceof ApiError ? err.message : `Не удалось смонтировать ${label}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={`Смонтировать ${label}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">
            {type === 'battery' ? 'Аккумулятор' : 'Зарядное устройство'}
          </label>
          <select
            required
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            className="input"
          >
            <option value="">Выберите…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.inventoryNumber})
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          Смонтировать
        </button>
      </form>
    </Modal>
  )
}


/** Значение для input datetime-local из Date (в локальной TZ) */
function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/**
 * Строка журнала пробега с инлайн-правкой — механика как у оплат аренды:
 * данные изменены → кнопка «сохранить» (галка), не изменены → «удалить» (корзина).
 */
function MileageRow({
  entry,
  readOnly,
  onSave,
  onDelete,
}: {
  entry: MileageLogEntry
  readOnly: boolean
  onSave: (entry: MileageLogEntry, mileageKm: string, recordedAt: string) => Promise<void>
  onDelete: (entry: MileageLogEntry) => Promise<void>
}) {
  const [mileageKm, setMileageKm] = useState(String(entry.mileageKm))
  const [recordedAt, setRecordedAt] = useState(() => toLocalInputValue(new Date(entry.recordedAt)))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty =
    mileageKm !== String(entry.mileageKm) ||
    recordedAt !== toLocalInputValue(new Date(entry.recordedAt))

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить запись')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-white/10 p-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={mileageKm}
          disabled={readOnly}
          onChange={(event) => setMileageKm(event.target.value)}
          className="input w-28 shrink-0"
          title="Пробег, км"
        />
        <span className="shrink-0 text-sm text-zinc-500">км</span>
        <input
          type="datetime-local"
          max={toLocalInputValue(new Date())}
          value={recordedAt}
          disabled={readOnly}
          onChange={(event) => setRecordedAt(event.target.value)}
          className="input"
          title="Дата записи"
        />
        {!readOnly &&
          (dirty ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => onSave(entry, mileageKm, recordedAt))}
              title="Сохранить"
              className="shrink-0 rounded-lg p-2 text-emerald-400 transition hover:bg-emerald-400/10"
            >
              <Check size={16} />
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => onDelete(entry))}
              title="Удалить запись"
              className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
            >
              <Trash2 size={16} />
            </button>
          ))}
      </div>
      {error && <p className="mt-1.5 pl-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}

/** Строка журнала циклов перезарядки с инлайн-правкой/удалением — механика как у пробега */
function ChargeCycleRow({
  entry,
  readOnly,
  onSave,
  onDelete,
}: {
  entry: ChargeCycleLogEntry
  readOnly: boolean
  onSave: (entry: ChargeCycleLogEntry, cycles: string, recordedAt: string) => Promise<void>
  onDelete: (entry: ChargeCycleLogEntry) => Promise<void>
}) {
  const [cycles, setCycles] = useState(String(entry.cycles))
  const [recordedAt, setRecordedAt] = useState(() => toLocalInputValue(new Date(entry.recordedAt)))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty =
    cycles !== String(entry.cycles) ||
    recordedAt !== toLocalInputValue(new Date(entry.recordedAt))

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить запись')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-white/10 p-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={cycles}
          disabled={readOnly}
          onChange={(event) => setCycles(event.target.value)}
          className="input w-28 shrink-0"
          title="Циклы перезарядки"
        />
        <input
          type="datetime-local"
          max={toLocalInputValue(new Date())}
          value={recordedAt}
          disabled={readOnly}
          onChange={(event) => setRecordedAt(event.target.value)}
          className="input"
          title="Дата записи"
        />
        {!readOnly &&
          (dirty ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => onSave(entry, cycles, recordedAt))}
              title="Сохранить"
              className="shrink-0 rounded-lg p-2 text-emerald-400 transition hover:bg-emerald-400/10"
            >
              <Check size={16} />
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => onDelete(entry))}
              title="Удалить запись"
              className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
            >
              <Trash2 size={16} />
            </button>
          ))}
      </div>
      {error && <p className="mt-1.5 pl-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}
