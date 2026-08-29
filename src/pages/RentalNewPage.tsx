import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Plus, X } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { Asset, AssetDetail, BikeModel, Customer, Rental, RentalKind, Tariff, TariffUnit } from '../types'
import { formatMoney } from '../lib/format'
import { assetTypeLabels, rentalKindLabels, tariffUnitLabels } from '../lib/labels'

/** Значение для input datetime-local из Date (в локальной TZ) */
function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/** Дочерняя строка — смонтированная на велосипеде АКБ (уходит с родителем) */
interface ChildRow {
  assetId: string
  name: string
  inventoryNumber: string
  /** Тариф доп. АКБ, ₽/час (по умолчанию 0) */
  rate: string
}

interface ItemRow {
  key: number
  assetId: string
  /** Выбранный тариф модели ('' — почасовая ставка вручную) */
  tariffId: string
  /** Цена, ₽ за tariffUnit (строка из input) */
  rate: string
  tariffUnit: TariffUnit
  children: ChildRow[]
}

let rowKey = 0
const newRow = (): ItemRow => ({
  key: ++rowKey,
  assetId: '',
  tariffId: '',
  rate: '',
  tariffUnit: 'hour',
  children: [],
})

export function RentalNewPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([])
  const [models, setModels] = useState<BikeModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [customerId, setCustomerId] = useState('')
  const [kind, setKind] = useState<RentalKind>('rent')
  const [startAt, setStartAt] = useState(() => toLocalInputValue(new Date()))
  const [plannedEndAt, setPlannedEndAt] = useState('')
  const [buyoutPrice, setBuyoutPrice] = useState('')
  const [deposit, setDeposit] = useState('')
  const [comment, setComment] = useState('')
  const [rows, setRows] = useState<ItemRow[]>([newRow()])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      api<Customer[]>('/customers'),
      api<Asset[]>('/assets?status=available'),
      api<BikeModel[]>('/bike-models'),
    ])
      .then(([customerList, assetList, modelList]) => {
        setCustomers(customerList)
        setAvailableAssets(assetList)
        setModels(modelList)
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить данные'),
      )
      .finally(() => setLoading(false))
  }, [])

  const chosenAssetIds = new Set(rows.map((row) => row.assetId).filter(Boolean))
  const assetById = new Map(availableAssets.map((asset) => [asset.id, asset]))
  const modelById = new Map(models.map((model) => [model.id, model]))

  /** Тарифы модели велосипеда для строки; пусто для АКБ/зарядников и велосипедов без модели */
  const tariffsForRow = (row: ItemRow): Tariff[] => {
    const asset = assetById.get(row.assetId)
    if (!asset || asset.type !== 'bike' || !asset.modelId) return []
    return modelById.get(asset.modelId)?.tariffs ?? []
  }

  const updateRow = (key: number, patch: Partial<ItemRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  // При выборе велосипеда дотягиваем его смонтированные АКБ как дочерние позиции
  const handleAssetSelect = async (row: ItemRow, assetId: string) => {
    const asset = availableAssets.find((a) => a.id === assetId)
    updateRow(row.key, { assetId, tariffId: '', rate: '', tariffUnit: 'hour', children: [] })
    if (asset?.type === 'bike') {
      try {
        const detail = await api<AssetDetail>(`/assets/${assetId}/detail`)
        const children: ChildRow[] = detail.mountedBatteries.map((battery) => ({
          assetId: battery.id,
          name: battery.name,
          inventoryNumber: battery.inventoryNumber,
          rate: '0',
        }))
        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, children } : r)))
      } catch {
        // Не удалось узнать комплект — сервер подтянет АКБ сам с тарифом 0
      }
    }
  }

  // Выбор тарифа модели: подставляем цену и единицу; пустое — почасовая ставка вручную
  const handleTariffSelect = (row: ItemRow, tariffId: string) => {
    const tariff = tariffsForRow(row).find((t) => t.id === tariffId)
    if (tariff) {
      updateRow(row.key, { tariffId, rate: String(tariff.price), tariffUnit: tariff.unit })
    } else {
      updateRow(row.key, { tariffId: '', rate: '', tariffUnit: 'hour' })
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const chosenRows = rows.filter((row) => row.assetId)
    if (!customerId || chosenRows.length === 0) {
      setError('Выберите клиента и добавьте хотя бы одну позицию')
      return
    }
    if (
      chosenRows.some(
        (row) => !row.rate.trim() || Number.isNaN(Number(row.rate)) || Number(row.rate) < 0,
      )
    ) {
      setError('Укажите цену для каждой позиции')
      return
    }
    if (kind === 'rent' && !plannedEndAt) {
      setError('Укажите плановую дату окончания')
      return
    }
    if (kind === 'rent_to_own' && !buyoutPrice.trim()) {
      setError('Укажите цену выкупа')
      return
    }

    // Дочерние АКБ шлём явными позициями — сервер свяжет их с родителем и возьмёт наш тариф
    const items = chosenRows.flatMap((row) => [
      { assetId: row.assetId, tariffUnit: row.tariffUnit, rate: Number(row.rate) },
      ...row.children.map((child) => ({
        assetId: child.assetId,
        tariffUnit: 'hour' as TariffUnit,
        rate: Number(child.rate) || 0,
      })),
    ])

    setSubmitting(true)
    setError('')
    try {
      const rental = await api<Rental>('/rentals', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          kind,
          ...(startAt ? { startAt: new Date(startAt).toISOString() } : {}),
          ...(kind === 'rent' ? { plannedEndAt: new Date(plannedEndAt).toISOString() } : {}),
          ...(kind === 'rent_to_own' ? { buyoutPrice: Number(buyoutPrice) } : {}),
          ...(deposit.trim() ? { deposit: Number(deposit) } : {}),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          items,
        }),
      })
      navigate(`/rentals/${rental.id}`)
    } catch (err) {
      // 409: актив уже занят и т.п. — показываем текст сервера, форма не теряется
      setError(err instanceof ApiError ? err.message : 'Не удалось создать аренду')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/rentals')}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
        >
          <ArrowLeft size={16} />
          К арендам
        </button>
        <h1 className="text-xl font-semibold text-zinc-100">Новая аренда</h1>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_2fr]">
          {/* Клиент и условия */}
          <section className="panel h-fit space-y-4 p-5">
            <h2 className="text-sm font-semibold text-zinc-100">Клиент и условия</h2>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Клиент</label>
              <select
                required
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                className="input"
              >
                <option value="" disabled>
                  Выберите клиента…
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-1 rounded-lg border border-white/10 p-1">
              {(Object.keys(rentalKindLabels) as RentalKind[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    kind === value
                      ? 'bg-emerald-400/10 text-emerald-400'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {rentalKindLabels[value]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm text-zinc-400">Начало аренды</label>
                <input
                  type="datetime-local"
                  required
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  className="input"
                />
              </div>
              {kind === 'rent' ? (
                <div>
                  <label className="mb-1.5 block text-sm text-zinc-400">Плановое окончание</label>
                  <input
                    type="datetime-local"
                    required
                    value={plannedEndAt}
                    onChange={(event) => setPlannedEndAt(event.target.value)}
                    className="input"
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-sm text-zinc-400">Цена выкупа, ₽</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={buyoutPrice}
                    onChange={(event) => setBuyoutPrice(event.target.value)}
                    className="input"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Залог, ₽</label>
              <input
                type="number"
                min={0}
                value={deposit}
                onChange={(event) => setDeposit(event.target.value)}
                className="input"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Комментарий</label>
              <textarea
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="input resize-none"
                placeholder="Необязательно"
              />
            </div>
          </section>

          {/* Позиции */}
          <section className="panel h-fit space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">Позиции</h2>
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, newRow()])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-400"
              >
                <Plus size={14} />
                Добавить позицию
              </button>
            </div>

            <div className="space-y-3">
              {rows.map((row) => {
                const rowTariffs = tariffsForRow(row)
                return (
                  <div key={row.key} className="rounded-lg border border-white/10 p-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={row.assetId}
                        onChange={(event) => void handleAssetSelect(row, event.target.value)}
                        className="input"
                      >
                        <option value="">Выберите актив…</option>
                        {availableAssets
                          .filter(
                            (asset) => !chosenAssetIds.has(asset.id) || asset.id === row.assetId,
                          )
                          .map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.name} ({asset.inventoryNumber}) — {assetTypeLabels[asset.type]}
                            </option>
                          ))}
                      </select>
                      {rowTariffs.length > 0 && (
                        <select
                          value={row.tariffId}
                          onChange={(event) => handleTariffSelect(row, event.target.value)}
                          className="input w-52 shrink-0"
                          title="Тариф"
                        >
                          <option value="">Почасовой</option>
                          {rowTariffs.map((tariff) => (
                            <option key={tariff.id} value={tariff.id}>
                              {tariff.name} · {formatMoney(tariff.price)}/
                              {tariffUnitLabels[tariff.unit]}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        required
                        type="number"
                        min={0}
                        value={row.rate}
                        onChange={(event) => updateRow(row.key, { rate: event.target.value })}
                        className="input w-24 shrink-0"
                        placeholder="₽"
                        title={`Цена, ₽/${tariffUnitLabels[row.tariffUnit]} (обязательно)`}
                      />
                      <span className="w-12 shrink-0 text-xs text-zinc-500">
                        ₽/{tariffUnitLabels[row.tariffUnit]}
                      </span>
                      <button
                        type="button"
                        title="Убрать позицию (вместе с АКБ комплекта)"
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                        className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Дочерние АКБ комплекта — уходят вместе с велосипедом */}
                    {row.children.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {row.children.map((child) => (
                          <li key={child.assetId} className="flex items-center gap-2 pl-6">
                            <span className="text-sm text-zinc-400">
                              └ {child.name}{' '}
                              <span className="font-mono text-xs text-zinc-500">
                                {child.inventoryNumber}
                              </span>
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={child.rate}
                              onChange={(event) =>
                                updateRow(row.key, {
                                  children: row.children.map((c) =>
                                    c.assetId === child.assetId
                                      ? { ...c, rate: event.target.value }
                                      : c,
                                  ),
                                })
                              }
                              className="input w-24 shrink-0"
                              placeholder="0"
                              title="Тариф доп. АКБ, ₽/час"
                            />
                            <span className="w-12 shrink-0 text-xs text-zinc-500">₽/час</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              <Check size={16} />
              Создать аренду
            </button>
          </section>
        </form>
      )}
    </div>
  )
}
