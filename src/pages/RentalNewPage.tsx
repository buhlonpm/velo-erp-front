import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Plus, X } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { Asset, AssetDetail, AssetType, BikeModel, Customer, Rental, RentalKind, TariffUnit } from '../types'
import { formatDateTime, formatMoney } from '../lib/format'
import { assetTypeLabels, rentalKindLabels, tariffUnitLabels, tariffUnitSeconds } from '../lib/labels'

/** Значение для input datetime-local из Date (в локальной TZ) */
function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/** Дочерняя строка — АКБ/зарядник, смонтированные на велосипеде (едут комплектом за 0 ₽) */
interface ChildRow {
  assetId: string
  name: string
  inventoryNumber: string
  type: AssetType
}

interface ItemRow {
  key: number
  assetId: string
  /** Цена, ₽ за единицу срока аренды (строка из input) */
  rate: string
  /** Единица тарифа — только для rent_to_own (у rent она = единице срока аренды) */
  tariffUnit: TariffUnit | ''
  children: ChildRow[]
}

let rowKey = 0
const newRow = (): ItemRow => ({
  key: ++rowKey,
  assetId: '',
  rate: '',
  tariffUnit: '',
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
  // Срок аренды: конец периода считает сервер (plannedEndAt = startAt + duration × unit);
  // единица срока — она же единица тарифа всех позиций
  const [duration, setDuration] = useState('')
  const [durationUnit, setDurationUnit] = useState<TariffUnit>('day')
  const [buyoutPrice, setBuyoutPrice] = useState('')
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

  /** Цена из справочника модели для единицы срока аренды; undefined — нет тарифа или не велосипед */
  const catalogPrice = (assetId: string, unit: TariffUnit): number | undefined => {
    const asset = assetById.get(assetId)
    if (!asset || asset.type !== 'bike' || !asset.modelId) return undefined
    return modelById.get(asset.modelId)?.tariffs.find((tariff) => tariff.unit === unit)?.price
  }

  const updateRow = (key: number, patch: Partial<ItemRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  // Смена единицы срока: переподставляем цены велосипедов из справочника модели;
  // нет тарифа с такой единицей — оставляем введённую сумму (в справочник ничего не пишется)
  const handleDurationUnitChange = (unit: TariffUnit) => {
    setDurationUnit(unit)
    setRows((prev) =>
      prev.map((row) => {
        if (!row.assetId) return row
        const price = catalogPrice(row.assetId, unit)
        return price !== undefined ? { ...row, rate: String(price) } : row
      }),
    )
  }

  // Общая сумма аренды = срок × сумма цен позиций (единица тарифа = единице срока; комплект 0 ₽)
  const totalAmount =
    kind === 'rent' && Number(duration) > 0
      ? rows
          .filter((row) => row.assetId && row.rate.trim())
          .reduce((sum, row) => sum + Number(duration) * Number(row.rate), 0)
      : 0
  // Предпросмотр фиксированного конца периода (его посчитает сервер)
  const plannedEndPreview =
    kind === 'rent' && startAt && Number(duration) > 0
      ? new Date(
          new Date(startAt).getTime() + Number(duration) * tariffUnitSeconds[durationUnit] * 1000,
        )
      : null

  // При выборе велосипеда дотягиваем смонтированные АКБ и зарядник как дочерние строки
  const handleAssetSelect = async (row: ItemRow, assetId: string) => {
    const asset = availableAssets.find((a) => a.id === assetId)
    const price = assetId ? catalogPrice(assetId, durationUnit) : undefined
    updateRow(row.key, {
      assetId,
      rate: price !== undefined ? String(price) : '',
      tariffUnit: '',
      children: [],
    })
    if (asset?.type === 'bike') {
      try {
        const detail = await api<AssetDetail>(`/assets/${assetId}/detail`)
        const children: ChildRow[] = [...detail.mountedBatteries, ...detail.mountedChargers].map(
          (kit) => ({
            assetId: kit.id,
            name: kit.name,
            inventoryNumber: kit.inventoryNumber,
            type: kit.type,
          }),
        )
        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, children } : r)))
      } catch {
        // Не удалось узнать комплект — сервер подтянет АКБ/зарядник сам с тарифом 0
      }
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
    if (kind === 'rent' && (!duration.trim() || Number(duration) <= 0)) {
      setError('Укажите срок аренды')
      return
    }
    if (kind === 'rent_to_own') {
      if (!buyoutPrice.trim()) {
        setError('Укажите цену выкупа')
        return
      }
      if (chosenRows.some((row) => !row.tariffUnit)) {
        setError('Выберите единицу тарифа (час/день/неделя/месяц) для каждой позиции')
        return
      }
    }

    // Дочерний комплект (АКБ/зарядник) не шлём — сервер подтянет его сам с тарифом 0.
    // Единицу тарифа при rent не шлём — сервер ставит единицу срока аренды.
    const items = chosenRows.map((row) => ({
      assetId: row.assetId,
      rate: Number(row.rate),
      ...(kind === 'rent_to_own' ? { tariffUnit: row.tariffUnit } : {}),
    }))

    setSubmitting(true)
    setError('')
    try {
      const rental = await api<Rental>('/rentals', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          kind,
          ...(startAt ? { startAt: new Date(startAt).toISOString() } : {}),
          ...(kind === 'rent' ? { duration: Number(duration), durationUnit } : {}),
          ...(kind === 'rent_to_own' ? { buyoutPrice: Number(buyoutPrice) } : {}),
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
                  <label className="mb-1.5 block text-sm text-zinc-400">Срок аренды *</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      required
                      value={duration}
                      onChange={(event) => setDuration(event.target.value)}
                      className="input w-20 shrink-0"
                      placeholder="3"
                    />
                    <select
                      value={durationUnit}
                      onChange={(event) => handleDurationUnitChange(event.target.value as TariffUnit)}
                      className="input"
                    >
                      {(Object.keys(tariffUnitLabels) as TariffUnit[]).map((unit) => (
                        <option key={unit} value={unit}>
                          {tariffUnitLabels[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {plannedEndPreview && (
                    <p className="mt-1 text-xs text-zinc-500">
                      Окончание: {formatDateTime(plannedEndPreview.toISOString())}
                    </p>
                  )}
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

            {/* Общая сумма аренды — вычисляемая, меняется ценами позиций; оплата — в карточке аренды */}
            {kind === 'rent' && (
              <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Общая сумма аренды</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-400">
                  {formatMoney(totalAmount)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Считается из цен позиций — чтобы изменить, поправьте цену тарифа в позиции.
                  Оплата принимается в карточке аренды после создания.
                </p>
              </div>
            )}
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
                const unitLabel =
                  kind === 'rent'
                    ? tariffUnitLabels[durationUnit]
                    : row.tariffUnit
                      ? tariffUnitLabels[row.tariffUnit]
                      : '—'
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
                      {/* Единица тарифа = единице срока аренды; выбор только у rent_to_own (срока нет) */}
                      {kind === 'rent_to_own' && row.assetId && (
                        <select
                          value={row.tariffUnit}
                          onChange={(event) =>
                            updateRow(row.key, { tariffUnit: event.target.value as TariffUnit })
                          }
                          className="input w-32 shrink-0"
                          title="Единица тарифа"
                        >
                          <option value="" disabled>
                            Единица…
                          </option>
                          {(Object.keys(tariffUnitLabels) as TariffUnit[]).map((unit) => (
                            <option key={unit} value={unit}>
                              {tariffUnitLabels[unit]}
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
                        className="input w-28 shrink-0"
                        placeholder="₽"
                        title={`Цена, ₽/${unitLabel} (обязательно)`}
                      />
                      <span className="w-16 shrink-0 text-xs text-zinc-500">₽/{unitLabel}</span>
                      <button
                        type="button"
                        title="Убрать позицию (вместе с комплектом)"
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                        className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Дочерний комплект (АКБ/зарядник) — едет с велосипедом за 0 ₽, тарифов нет */}
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
                            <span className="text-xs text-zinc-600">
                              {assetTypeLabels[child.type]}, в комплекте — 0 ₽
                            </span>
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
