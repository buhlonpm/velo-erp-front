import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Plus, X } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { Asset, AssetDetail, AssetType, BikeModel, Customer, Rental, RentalKind, TariffUnit } from '../types'
import { formatDateTime, formatMoney, splitDuration } from '../lib/format'
import { assetTypeLabels, rentalKindLabels, tariffUnitLabels, tariffUnitSeconds } from '../lib/labels'
import { Loading } from '../components/Loading'

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
  /** Цена, ₽ за единицу срока аренды (у rent_to_own — ₽/нед) */
  rate: string
  children: ChildRow[]
}

let rowKey = 0
const newRow = (): ItemRow => ({
  key: ++rowKey,
  assetId: '',
  rate: '',
  children: [],
})

/** Сроки выкупа в неделях (бэк принимает только эти) */
const TERM_WEEKS_OPTIONS = [13, 26, 52] as const

/**
 * Заглушка Asset из позиции аренды — для селектов в режиме редактирования:
 * активы черновика в статусе reserved и не приходят в /assets?status=available.
 */
function assetFromItem(item: {
  assetId: string
  assetType: AssetType
  assetName: string
  inventoryNumber: string
}): Asset {
  return {
    id: item.assetId,
    type: item.assetType,
    inventoryNumber: item.inventoryNumber,
    name: item.assetName,
    status: 'reserved',
    description: '',
    purchasedAt: null,
    purchasePrice: null,
    vin: null,
    modelId: null,
    modelName: null,
    mileageKm: null,
    gpsTrackerId: null,
    gpsTrackerModel: null,
    gpsSimNumber: null,
    gpsOperator: null,
    writeOffReason: null,
    writtenOffAt: null,
    voltage: null,
    capacityAh: null,
    chargeCycles: null,
    bikeId: null,
    bikeName: null,
    bundledBikeId: null,
    bundledBikeName: null,
    powerW: null,
    connector: null,
  }
}

export function RentalNewPage() {
  const navigate = useNavigate()
  // Есть id в маршруте — режим редактирования черновика (PATCH), иначе создание (POST)
  const { id } = useParams<{ id: string }>()
  const isEdit = id != null
  const [customers, setCustomers] = useState<Customer[]>([])
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([])
  const [models, setModels] = useState<BikeModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Открыли на редактирование не-черновик — форму не показываем (бэк всё равно дал бы 409)
  const [notDraft, setNotDraft] = useState(false)

  const [customerId, setCustomerId] = useState('')
  const [kind, setKind] = useState<RentalKind>('rent')
  const [startAt, setStartAt] = useState(() => toLocalInputValue(new Date()))
  // Срок аренды: конец периода считает сервер (plannedEndAt = startAt + duration × unit);
  // единица срока — она же единица тарифа всех позиций
  const [duration, setDuration] = useState('')
  const [durationUnit, setDurationUnit] = useState<TariffUnit>('day')
  // Под выкуп: срок в неделях и итог выкупа; недельный платёж = сумма цен позиций (₽/нед)
  const [termWeeks, setTermWeeks] = useState<number>(TERM_WEEKS_OPTIONS[0])
  const [buyoutPrice, setBuyoutPrice] = useState('')
  /** Итог правился вручную (только при одной позиции) — не пересчитываем его из цен позиций */
  const [buyoutTouched, setBuyoutTouched] = useState(false)
  const [comment, setComment] = useState('')
  const [rows, setRows] = useState<ItemRow[]>([newRow()])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [customerList, assetList, modelList] = await Promise.all([
          api<Customer[]>('/customers'),
          api<Asset[]>('/assets?status=available'),
          api<BikeModel[]>('/bike-models'),
        ])
        setCustomers(customerList)
        setModels(modelList)

        if (id == null) {
          setAvailableAssets(assetList)
          return
        }

        const rental = await api<Rental>(`/rentals/${id}`)
        if (rental.status !== 'draft') {
          setNotDraft(true)
          return
        }

        // Активы черновика в резерве и не приходят в ?status=available —
        // дополняем селекты заглушками из позиций аренды, чтобы выбранные отображались
        const rootItems = rental.items.filter((item) => !item.parentItemId)
        const missing = rootItems
          .filter((item) => !assetList.some((asset) => asset.id === item.assetId))
          .map(assetFromItem)
        setAvailableAssets([...assetList, ...missing])

        setCustomerId(rental.customerId)
        setKind(rental.kind)
        setStartAt(toLocalInputValue(new Date(rental.startAt)))
        setComment(rental.comment)
        if (rental.kind === 'rent') {
          // Срок восстанавливаем из фактического периода (startAt → plannedEndAt)
          const period = splitDuration(rental.startAt, rental.plannedEndAt)
          if (period) {
            setDuration(String(period.value))
            setDurationUnit(period.unit)
          }
        } else {
          if (rental.termWeeks != null) setTermWeeks(rental.termWeeks)
          setBuyoutPrice(rental.buyoutPrice != null ? String(rental.buyoutPrice) : '')
          // Итог уже известен — не даём эффекту перезатереть его до первой ручной правки
          setBuyoutTouched(true)
        }

        // Позиции — только корневые; дочерний комплект дотягиваем из карточек велосипедов
        const prefilled: ItemRow[] = rootItems.map((item) => ({
          key: ++rowKey,
          assetId: item.assetId,
          rate: String(item.rate),
          children: [],
        }))
        await Promise.all(
          prefilled.map(async (row, index) => {
            if (rootItems[index].assetType !== 'bike') return
            try {
              const detail = await api<AssetDetail>(`/assets/${row.assetId}/detail`)
              row.children = [...detail.mountedBatteries, ...detail.mountedChargers].map((kit) => ({
                assetId: kit.id,
                name: kit.name,
                inventoryNumber: kit.inventoryNumber,
                type: kit.type,
              }))
            } catch {
              // Не удалось узнать комплект — сервер подтянет АКБ/зарядник сам с тарифом 0
            }
          }),
        )
        setRows(prefilled.length > 0 ? prefilled : [newRow()])
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить данные')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id])

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

  // Под выкуп цены позиций — ₽/нед: при переключении kind переподставляем из справочника
  // модели по неделе и сбрасываем ручную правку итога (он снова = сумме цен позиций × недель)
  const handleKindChange = (value: RentalKind) => {
    setKind(value)
    if (value === 'rent_to_own') {
      setBuyoutTouched(false)
      setRows((prev) =>
        prev.map((row) => {
          if (!row.assetId) return row
          const price = catalogPrice(row.assetId, 'week')
          return price !== undefined ? { ...row, rate: String(price) } : row
        }),
      )
    }
  }

  // Под выкуп: недельный платёж = сумма цен корневых позиций (₽/нед); итог = платёж × недель.
  // При одной позиции итог можно править вручную (цена позиции пересчитается как итог ÷ недель);
  // при нескольких позициях итог только вычисляется — править надо цены самих позиций.
  const chosenRowsList = rows.filter((row) => row.assetId)
  const singleChosenRow = chosenRowsList.length === 1 ? chosenRowsList[0] : null
  const weeklyFromRows = chosenRowsList
    .filter((row) => row.rate.trim())
    .reduce((acc, row) => acc + Number(row.rate), 0)

  useEffect(() => {
    if (kind !== 'rent_to_own') return
    if (chosenRowsList.length !== 1) {
      setBuyoutTouched(false)
      setBuyoutPrice(weeklyFromRows > 0 ? String(weeklyFromRows * termWeeks) : '')
    } else if (!buyoutTouched) {
      setBuyoutPrice(weeklyFromRows > 0 ? String(weeklyFromRows * termWeeks) : '')
    }
  }, [kind, buyoutTouched, chosenRowsList.length, weeklyFromRows, termWeeks])

  // Ручная правка итога (одна позиция) → цена позиции = round(итог / недель)
  const handleBuyoutChange = (value: string) => {
    setBuyoutTouched(true)
    setBuyoutPrice(value)
    if (singleChosenRow) {
      updateRow(singleChosenRow.key, {
        rate: Number(value) > 0 ? String(Math.round(Number(value) / termWeeks)) : '',
      })
    }
  }

  // Правка цены позиции — итог снова следует за ценами позиций
  const handleRateChange = (row: ItemRow, value: string) => {
    setBuyoutTouched(false)
    updateRow(row.key, { rate: value })
  }

  // Смена срока: итог пересчитывается от цен позиций (случай без ручной правки покроет useEffect выше)
  const handleTermWeeksChange = (weeks: number) => {
    setTermWeeks(weeks)
    setBuyoutTouched(false)
  }

  // Превью графика: N платежей по X ₽, первый — в день начала, последний — startAt + (N-1)×7 дней
  const schedulePreview =
    kind === 'rent_to_own' && startAt && Number(buyoutPrice) > 0
      ? (() => {
          const first = new Date(startAt)
          const last = new Date(first.getTime() + (termWeeks - 1) * 7 * 86_400_000)
          const weekly = Math.round(Number(buyoutPrice) / termWeeks)
          return (
            `${termWeeks} платеж${termWeeks === 52 ? 'а' : 'ей'} по ${formatMoney(weekly)}, ` +
            `первый — ${formatDateTime(first.toISOString())}, последний — ${formatDateTime(last.toISOString())}`
          )
        })()
      : null

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
    // Под выкуп единица тарифа всегда неделя — цену берём из недельного тарифа модели
    const price = assetId
      ? catalogPrice(assetId, kind === 'rent_to_own' ? 'week' : durationUnit)
      : undefined
    setBuyoutTouched(false)
    updateRow(row.key, {
      assetId,
      rate: price !== undefined ? String(price) : '',
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
      if (!TERM_WEEKS_OPTIONS.includes(termWeeks as (typeof TERM_WEEKS_OPTIONS)[number])) {
        setError('Выберите срок выкупа: 13, 26 или 52 недели')
        return
      }
      if (!buyoutPrice.trim() || Number.isNaN(Number(buyoutPrice)) || Number(buyoutPrice) <= 0) {
        setError('Укажите итоговую сумму выкупа (больше 0)')
        return
      }
    }

    // Дочерний комплект (АКБ/зарядник) не шлём — сервер подтянет его сам с тарифом 0.
    // Единицу тарифа не шлём: у rent она = единице срока аренды, у rent_to_own — всегда week.
    const items = chosenRows.map((row) => ({
      assetId: row.assetId,
      rate: Number(row.rate),
    }))

    setSubmitting(true)
    setError('')
    try {
      if (isEdit) {
        // Полное редактирование черновика: kind не шлём — тип договора менять нельзя
        await api<Rental>(`/rentals/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            customerId,
            ...(startAt ? { startAt: new Date(startAt).toISOString() } : {}),
            ...(kind === 'rent' ? { duration: Number(duration), durationUnit } : {}),
            ...(kind === 'rent_to_own' ? { buyoutPrice: Number(buyoutPrice), termWeeks } : {}),
            comment: comment.trim(),
            items,
          }),
        })
        navigate(`/rentals/${id}`)
      } else {
        const rental = await api<Rental>('/rentals', {
          method: 'POST',
          body: JSON.stringify({
            customerId,
            kind,
            ...(startAt ? { startAt: new Date(startAt).toISOString() } : {}),
            ...(kind === 'rent' ? { duration: Number(duration), durationUnit } : {}),
            ...(kind === 'rent_to_own' ? { buyoutPrice: Number(buyoutPrice), termWeeks } : {}),
            ...(comment.trim() ? { comment: comment.trim() } : {}),
            items,
          }),
        })
        navigate(`/rentals/${rental.id}`)
      }
    } catch (err) {
      // 409: актив уже занят и т.п. — показываем текст сервера, форма не теряется
      setError(
        err instanceof ApiError
          ? err.message
          : isEdit
            ? 'Не удалось сохранить аренду'
            : 'Не удалось создать аренду',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => (isEdit ? navigate(`/rentals/${id}`) : navigate('/rentals'))}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
        >
          <ArrowLeft size={16} />
          {isEdit ? 'К аренде' : 'К арендам'}
        </button>
        <h1 className="text-xl font-semibold text-zinc-100">
          {isEdit ? 'Редактирование черновика' : 'Новая аренда'}
        </h1>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {notDraft ? (
        // Открыли на редактирование выданную/завершённую аренду — править можно только черновик
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-400">
          Менять аренду можно только в черновике
        </p>
      ) : loading ? (
        <Loading />
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
                  disabled={isEdit}
                  onClick={() => handleKindChange(value)}
                  title={isEdit ? 'Тип договора у созданной аренды не меняется' : undefined}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${
                    kind === value
                      ? 'bg-emerald-400/10 text-emerald-400'
                      : 'text-zinc-400 hover:text-zinc-200'
                  } ${isEdit ? 'opacity-50' : ''}`}
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
                  <label className="mb-1.5 block text-sm text-zinc-400">Срок выкупа *</label>
                  <div className="flex gap-1 rounded-lg border border-white/10 p-1">
                    {TERM_WEEKS_OPTIONS.map((weeks) => (
                      <button
                        key={weeks}
                        type="button"
                        onClick={() => handleTermWeeksChange(weeks)}
                        className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition ${
                          termWeeks === weeks
                            ? 'bg-emerald-400/10 text-emerald-400'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {weeks} нед.
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Под выкуп: недельный платёж — сумма цен позиций; итог правится только при одной позиции */}
            {kind === 'rent_to_own' && (
              <div className="space-y-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm text-zinc-400">Платёж в неделю</label>
                    <p className="px-3 py-2 text-lg font-semibold text-zinc-100">
                      {weeklyFromRows > 0 ? formatMoney(weeklyFromRows) : '—'}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm text-zinc-400">Итого выкуп, ₽ *</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={buyoutPrice}
                      onChange={(event) => handleBuyoutChange(event.target.value)}
                      disabled={!singleChosenRow}
                      className="input disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        singleChosenRow
                          ? 'Итог выкупа — цена позиции пересчитается (итог ÷ недель)'
                          : 'Итог = сумма цен позиций × срок — правьте цены самих позиций'
                      }
                    />
                  </div>
                </div>
                {schedulePreview && <p className="text-xs text-zinc-500">{schedulePreview}</p>}
                <p className="text-xs text-zinc-500">
                  {singleChosenRow
                    ? 'Недельный платёж — это цена позиции; правка итога пересчитает её. Оплата принимается в карточке аренды после создания.'
                    : 'Недельный платёж и итог считаются из цен позиций — чтобы изменить, поправьте цену в позиции. Оплата принимается в карточке аренды после создания.'}
                </p>
              </div>
            )}

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
                // У rent_to_own единица тарифа всегда неделя (сервер проставляет сам)
                const unitLabel = kind === 'rent' ? tariffUnitLabels[durationUnit] : 'нед'
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
                      {/* Единица тарифа = единице срока аренды; у rent_to_own — всегда неделя */}
                      <input
                        required
                        type="number"
                        min={0}
                        value={row.rate}
                        onChange={(event) => handleRateChange(row, event.target.value)}
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
              {isEdit ? 'Сохранить' : 'Создать аренду'}
            </button>
          </section>
        </form>
      )}
    </div>
  )
}
