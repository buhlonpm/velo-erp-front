import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BatteryCharging, Bike, Plus, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { AccountOption, Asset, AssetStatus, AssetType, BikeModel } from '../types'
import { Modal } from '../components/Modal'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { dateInputToIso, formatNumber } from '../lib/format'
import { assetStatusLabels, assetStatusTones, assetTypeLabels } from '../lib/labels'

const typeIcons: Record<AssetType, LucideIcon> = {
  bike: Bike,
  battery: BatteryCharging,
  charger: Zap,
}

const typeTabLabels: Record<AssetType, string> = {
  bike: 'Велосипеды',
  battery: 'Аккумуляторы',
  charger: 'Зарядники',
}

type StatusFilter = 'all' | AssetStatus

const statusFilterLabels: [StatusFilter, string][] = [
  ['all', 'Все'],
  ['available', 'Доступен'],
  ['mounted', 'На технике'],
  ['rented', 'В аренде'],
  ['maintenance', 'Обслуживание'],
  ['sold', 'Продан'],
  ['decommissioned', 'Списан'],
]

export function ParkPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<AssetType>('bike')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [assets, setAssets] = useState<Asset[]>([])
  const [models, setModels] = useState<BikeModel[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState({ open: false })

  const showError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback)

  const loadAssets = useCallback(async () => {
    setLoading(true)
    try {
      const query = statusFilter === 'all' ? '' : `&status=${statusFilter}`
      setAssets(await api<Asset[]>(`/assets?type=${tab}${query}`))
      setError('')
    } catch (err) {
      showError(err, 'Не удалось загрузить парк')
    } finally {
      setLoading(false)
    }
  }, [tab, statusFilter])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  // Справочники для форм: модели велосипедов, счета (списание покупки), трекеры.
  // Счета могут быть недоступны по правам — тогда select списания просто пуст.
  useEffect(() => {
    api<BikeModel[]>('/bike-models')
      .then(setModels)
      .catch((err) => showError(err, 'Не удалось загрузить модели'))
    api<AccountOption[]>('/finance/accounts/options').then(setAccounts).catch(() => setAccounts([]))
  }, [])

  const saveAsset = async (form: AssetForm) => {
    try {
      await api('/assets', { method: 'POST', body: JSON.stringify(form.body) })
      await loadAssets()
      setModal({ open: false })
    } catch (err) {
      showError(err, 'Не удалось сохранить актив')
    }
  }

  const TypeIcon = typeIcons[tab]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Парк</h1>
        <button type="button" onClick={() => setModal({ open: true })} className="btn-primary">
          <Plus size={16} />
          Добавить
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Табы типов */}
      <div className="flex gap-1 border-b border-white/5">
        {(Object.keys(typeTabLabels) as AssetType[]).map((type) => {
          const Icon = typeIcons[type]
          return (
            <button
              key={type}
              type="button"
              onClick={() => setTab(type)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                tab === type
                  ? 'border-emerald-400 text-emerald-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon size={16} />
              {typeTabLabels[type]}
            </button>
          )
        })}
      </div>

      {/* Фильтр по статусу */}
      <div className="flex w-fit gap-1 rounded-lg border border-white/10 p-1">
        {statusFilterLabels.map(([value, label]) => (
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
        ) : assets.length === 0 ? (
          <EmptyState
            icon={TypeIcon}
            title={`${typeTabLabels[tab]} не найдены`}
            description="Измените фильтр или добавьте актив кнопкой «Добавить»"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">{tab === 'bike' ? 'VIN' : 'Инв. номер'}</th>
                  {tab === 'bike' && (
                    <>
                      <th className="th">Модель</th>
                      <th className="th">Пробег</th>
                    </>
                  )}
                  {tab === 'battery' && (
                    <>
                      <th className="th">Название</th>
                      <th className="th">Вольтаж / ёмкость</th>
                      <th className="th">Пробег, км</th>
                      <th className="th">Установлена</th>
                    </>
                  )}
                  {tab === 'charger' && (
                    <>
                      <th className="th">Название</th>
                      <th className="th">Мощность / разъём</th>
                    </>
                  )}
                  <th className="th">Статус</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset, index) => (
                  <tr
                    key={asset.id}
                    onClick={() => navigate(`/park/${asset.type === 'bike' ? 'bikes' : asset.type === 'battery' ? 'batteries' : 'chargers'}/${asset.id}`)}
                    className={`cursor-pointer transition hover:bg-white/5 ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
                  >
                    <td className="td font-mono text-xs font-medium text-zinc-200">
                      {asset.inventoryNumber}
                    </td>
                    {tab === 'bike' && (
                      <>
                        <td className="td">{asset.modelName ?? asset.name}</td>
                        <td className="td text-zinc-500">
                          {asset.mileageKm != null ? `${formatNumber(asset.mileageKm)} км` : '—'}
                        </td>
                      </>
                    )}
                    {tab === 'battery' && (
                      <>
                        <td className="td">{asset.name}</td>
                        <td className="td text-zinc-500">
                          {asset.voltage != null ? `${asset.voltage} В` : '—'}
                          {' / '}
                          {asset.capacityAh != null ? `${asset.capacityAh} А·ч` : '—'}
                        </td>
                        <td className="td text-zinc-500">
                          {asset.mileageKm != null ? formatNumber(asset.mileageKm) : '—'}
                        </td>
                        <td className="td text-zinc-500">{asset.bikeName ?? '—'}</td>
                      </>
                    )}
                    {tab === 'charger' && (
                      <>
                        <td className="td">{asset.name}</td>
                        <td className="td text-zinc-500">
                          {asset.powerW != null ? `${asset.powerW} Вт` : '—'}
                          {' / '}
                          {asset.connector || '—'}
                        </td>
                      </>
                    )}
                    <td className="td">
                      <StatusBadge
                        label={assetStatusLabels[asset.status]}
                        tone={assetStatusTones[asset.status]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Действия (редактирование, списание) — только из карточки актива */}
      <AssetModal
        key={`new-${tab}`}
        state={modal}
        type={tab}
        models={models}
        accounts={accounts}
        onClose={() => setModal({ open: false })}
        onSave={saveAsset}
      />
    </div>
  )
}

interface AssetForm {
  body: Record<string, unknown>
}

/** Только создание актива — редактирование и списание живут в карточке актива */
function AssetModal({
  state,
  type,
  models,
  accounts,
  onClose,
  onSave,
}: {
  state: { open: boolean }
  type: AssetType
  models: BikeModel[]
  accounts: AccountOption[]
  onClose: () => void
  onSave: (form: AssetForm) => void
}) {
  const isBike = type === 'bike'
  const isBattery = type === 'battery'
  const [inventoryNumber, setInventoryNumber] = useState('')
  const [vin, setVin] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [modelId, setModelId] = useState('')
  const [mileageKm, setMileageKm] = useState('')
  const [voltage, setVoltage] = useState('')
  const [capacityAh, setCapacityAh] = useState('')
  const [powerW, setPowerW] = useState('')
  const [connector, setConnector] = useState('')
  // Покупка (все типы) — date input хранит YYYY-MM-DD
  const [purchasedAt, setPurchasedAt] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [purchaseAccountId, setPurchaseAccountId] = useState('')
  // «В комплекте с велосипедом» — только при создании АКБ/зарядника
  const canBundle = !isBike
  const [bundled, setBundled] = useState(false)
  const [bundledBikeId, setBundledBikeId] = useState('')
  const [bikes, setBikes] = useState<Asset[]>([])

  useEffect(() => {
    if (!state.open || !canBundle) return
    api<Asset[]>('/assets?type=bike')
      .then((list) =>
        setBikes(list.filter((b) => b.status === 'available' || b.status === 'maintenance')),
      )
      .catch(() => setBikes([]))
  }, [state.open, canBundle])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!inventoryNumber.trim()) return

    // Покупка обязательна при создании: цена >= 0 (0 — «в комплекте», без счёта);
    // при цене > 0 счёт списания обязателен (иначе 409).
    // «В комплекте с велосипедом» — цена принудительно 0, велосипед обязателен.
    if (bundled) {
      if (!bundledBikeId) return
    } else {
      const price = Number(purchasePrice)
      if (!purchasePrice.trim() || Number.isNaN(price) || price < 0) return
      if (price > 0 && !purchaseAccountId) return
    }

    const common: Record<string, unknown> = {
      inventoryNumber: inventoryNumber.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      // VIN — только у велосипеда и АКБ
      ...((isBike || isBattery) && vin.trim() ? { vin: vin.trim() } : {}),
      ...(purchasedAt ? { purchasedAt: dateInputToIso(purchasedAt) } : {}),
      ...(bundled
        ? { purchasePrice: 0, bundledBikeId }
        : purchasePrice.trim()
          ? { purchasePrice: Number(purchasePrice) }
          : {}),
    }
    if (!bundled && Number(purchasePrice) > 0) {
      common.purchaseAccountId = purchaseAccountId
    }

    let body: Record<string, unknown>
    if (isBike) {
      // Создание велосипеда: имя выводится из модели на сервере
      body = {
        ...common,
        type,
        ...(modelId ? { modelId } : {}),
        ...(mileageKm.trim() ? { mileageKm: Number(mileageKm) } : {}),
      }
    } else {
      body = {
        ...common,
        type,
        ...(name.trim() ? { name: name.trim() } : {}),
      }
      if (type === 'battery') {
        body = {
          ...body,
          ...(voltage.trim() ? { voltage: Number(voltage) } : {}),
          ...(capacityAh.trim() ? { capacityAh: Number(capacityAh) } : {}),
        }
      } else {
        body = {
          ...body,
          ...(powerW.trim() ? { powerW: Number(powerW) } : {}),
          ...(connector.trim() ? { connector: connector.trim() } : {}),
        }
      }
    }
    onSave({ body })
  }

  return (
    <Modal
      open={state.open}
      title={`Новый актив: ${assetTypeLabels[type]}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Инвентарный номер</label>
          <input
            required
            value={inventoryNumber}
            onChange={(event) => setInventoryNumber(event.target.value)}
            className="input"
            placeholder="EV-001"
          />
        </div>

        {(isBike || isBattery) && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">
              {isBike ? 'VIN рамы' : 'Заводской номер (VIN)'} (необязательно)
            </label>
            <input
              value={vin}
              onChange={(event) => setVin(event.target.value)}
              className="input"
              placeholder={isBike ? 'WVWZZZ…' : 'SN…'}
            />
          </div>
        )}

        {isBike && (
          <>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Модель</label>
              <select
                required
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                className="input"
              >
                <option value="" disabled>
                  Выберите модель…
                </option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.brand} {model.model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">
                Начальный пробег, км (необязательно)
              </label>
              <input
                type="number"
                min={0}
                value={mileageKm}
                onChange={(event) => setMileageKm(event.target.value)}
                className="input"
                placeholder="0"
              />
            </div>
          </>
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

        {type === 'battery' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Вольтаж, В</label>
              <input
                type="number"
                min={0}
                value={voltage}
                onChange={(event) => setVoltage(event.target.value)}
                className="input"
                placeholder="48"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Ёмкость, А·ч</label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={capacityAh}
                onChange={(event) => setCapacityAh(event.target.value)}
                className="input"
                placeholder="17.5"
              />
            </div>
          </div>
        )}

        {type === 'charger' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Мощность, Вт</label>
              <input
                type="number"
                min={0}
                value={powerW}
                onChange={(event) => setPowerW(event.target.value)}
                className="input"
                placeholder="120"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Разъём</label>
              <input
                value={connector}
                onChange={(event) => setConnector(event.target.value)}
                className="input"
                placeholder="XLR"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Описание (необязательно)</label>
          <textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="input resize-none"
          />
        </div>

        {/* Способ покупки — только при создании АКБ/зарядника */}
        {canBundle && (
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
                Куплен отдельно
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
                В комплекте с велосипедом
              </button>
            </div>
          </div>
        )}

        {canBundle && bundled && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Велосипед *</label>
            <select
              required
              value={bundledBikeId}
              onChange={(event) => setBundledBikeId(event.target.value)}
              className="input"
            >
              <option value="" disabled>
                Выберите велосипед…
              </option>
              {bikes.map((bike) => (
                <option key={bike.id} value={bike.id}>
                  {bike.name} ({bike.inventoryNumber})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-600">
              Цена 0 ₽, дата покупки — как у велосипеда; актив сразу будет смонтирован на него
            </p>
          </div>
        )}

        {!(canBundle && bundled) && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Дата покупки</label>
            <input
              type="date"
              value={purchasedAt}
              onChange={(event) => setPurchasedAt(event.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">
              Цена покупки, ₽ *
            </label>
            <input
              required
              type="number"
              min={0}
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              className="input"
              placeholder="0 — в комплекте"
            />
          </div>
        </div>
        )}

        {/* Списание за покупку — только при цене > 0 */}
        {!bundled && Number(purchasePrice) > 0 && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">Списать со счёта *</label>
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

        <button type="submit" className="btn-primary w-full">
          Добавить
        </button>
      </form>
    </Modal>
  )
}
