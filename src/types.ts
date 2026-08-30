// Статусы как union-типы + константные объекты
// (в tsconfig включён erasableSyntaxOnly, классические enum недоступны)

export const AssetType = {
  Bike: 'bike',
  Battery: 'battery',
  Charger: 'charger',
} as const
export type AssetType = (typeof AssetType)[keyof typeof AssetType]

export const AssetStatus = {
  Available: 'available',
  /** АКБ/зарядник смонтированы на велосипеде */
  Mounted: 'mounted',
  /** Зарезервирован под аренду-черновик */
  Reserved: 'reserved',
  Rented: 'rented',
  Maintenance: 'maintenance',
  Sold: 'sold',
  /** Выкуплен клиентом по договору rent_to_own */
  BoughtOut: 'bought_out',
  Decommissioned: 'decommissioned',
} as const
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus]

export const WriteOffReason = {
  Broken: 'broken',
  Stolen: 'stolen',
  Lost: 'lost',
  Sold: 'sold',
  Other: 'other',
} as const
export type WriteOffReason = (typeof WriteOffReason)[keyof typeof WriteOffReason]

export const AssetEventType = {
  Purchase: 'purchase',
  Mileage: 'mileage',
  ChargeCycles: 'charge_cycles',
  Mount: 'mount',
  Unmount: 'unmount',
  TrackerInstall: 'tracker_install',
  TrackerRemove: 'tracker_remove',
  WriteOff: 'write_off',
} as const
export type AssetEventType = (typeof AssetEventType)[keyof typeof AssetEventType]

/** Событие из истории актива */
export interface AssetEvent {
  id: string
  type: AssetEventType
  /** ISO-строка */
  date: string
  comment: string
  /** Сумма операции, ₽; null если событие без денег */
  amount: number | null
  transactionId: string | null
  createdByName: string | null
}

/**
 * Актив парка. Типо-специфичные поля null для чужих типов:
 * bike — modelId/gpsTracker*, battery — voltage/capacityAh/chargeCycles,
 * charger — powerW/connector. description/purchasedAt/purchasePrice — общие.
 * Пробег (bike/battery) — только ручной ввод через журнал.
 */
export interface Asset {
  id: string
  type: AssetType
  inventoryNumber: string
  name: string
  status: AssetStatus
  /** Описание; может быть пустой строкой */
  description: string
  /** Дата покупки, ISO */
  purchasedAt: string | null
  /** Цена покупки, ₽ */
  purchasePrice: number | null
  /** VIN рамы (bike) или заводской номер (battery) */
  vin: string | null
  modelId: string | null
  modelName: string | null
  /** Пробег, км — ручной ввод (bike/battery) */
  mileageKm: number | null
  /** Привязанный GPS-трекер (bike); модель/симка/оператор вычисляются на сервере */
  gpsTrackerId: string | null
  gpsTrackerModel: string | null
  gpsSimNumber: string | null
  gpsOperator: string | null
  /** Причина и дата выбытия (sold/decommissioned) */
  writeOffReason: WriteOffReason | null
  writtenOffAt: string | null
  /** Вольтаж, В (battery) */
  voltage: number | null
  /** Ёмкость, А·ч (battery) */
  capacityAh: number | null
  /** Циклы перезарядки (battery), ручной ввод */
  chargeCycles: number | null
  /** Велосипед, на который смонтирована АКБ/зарядник */
  bikeId: string | null
  bikeName: string | null
  /** Куплен в комплекте с этим велосипедом (battery/charger) */
  bundledBikeId: string | null
  bundledBikeName: string | null
  /** Мощность, Вт (charger) */
  powerW: number | null
  /** Разъём (charger) */
  connector: string | null
}

/** SIM-карта из справочника */
export interface SimCard {
  id: string
  phoneNumber: string
  operator: string
  note: string
  /** Трекер, в который вставлена; null — свободна */
  trackerId: string | null
  /** Трекер, с которым шла в комплекте; null — куплена отдельно */
  bundledTrackerId: string | null
  bundledTrackerName: string | null
  /** Дата покупки, ISO */
  purchasedAt: string | null
  /** Цена покупки, ₽; 0 — «в комплекте» */
  purchasePrice: number | null
  status: 'active' | 'written_off'
  writeOffReason: WriteOffReason | null
  /** Комментарий списания (в т.ч. каскадного — вместе с трекером) */
  writeOffComment: string | null
}

export const GpsTrackerStatus = {
  Active: 'active',
  WrittenOff: 'written_off',
  Sold: 'sold',
} as const
export type GpsTrackerStatus = (typeof GpsTrackerStatus)[keyof typeof GpsTrackerStatus]

/** GPS-трекер из справочника; симка опциональна */
export interface GpsTracker {
  id: string
  model: string
  imei: string | null
  simCardId: string | null
  simPhoneNumber: string | null
  simOperator: string | null
  /** Причина и комментарий выбытия (written_off/sold) */
  writeOffReason: WriteOffReason | null
  writeOffComment: string | null
  /** Дата покупки, ISO */
  purchasedAt: string | null
  /** Цена покупки, ₽ */
  purchasePrice: number | null
  status: GpsTrackerStatus
  /** Велосипед, на который установлен; null — на складе */
  installedBikeId: string | null
  installedBikeName: string | null
  /** Велосипед, с которого списан (written_off) */
  writtenOffFromBikeId: string | null
}

/** Запись журнала пробега */
export interface MileageLogEntry {
  id: string
  mileageKm: number
  /** ISO-строка */
  recordedAt: string
}

/** Запись журнала циклов перезарядки АКБ */
export interface ChargeCycleLogEntry {
  id: string
  cycles: number
  /** ISO-строка */
  recordedAt: string
}

/** Итоги по активу из GET /assets/{id}/detail */
export interface AssetTotals {
  purchasePrice: number
  expensesTotal: number
  incomeTotal: number
  rentalAccruedTotal: number
  /** Стоимость смонтированной АКБ */
  batteryTotal: number
  /** Стоимость смонтированного зарядника */
  chargerTotal: number
}

/** Карточка актива: паспорт + журнал пробега + операции + аренды + итоги + история */
export interface AssetDetail {
  asset: Asset
  /** Смонтированная АКБ (bike); пустой список — нет */
  mountedBatteries: Asset[]
  /** Смонтированный зарядник (bike); пустой список — нет */
  mountedChargers: Asset[]
  mileageLog: MileageLogEntry[]
  /** Журнал циклов перезарядки (battery); пустой список — нет */
  chargeCycleLog: ChargeCycleLogEntry[]
  transactions: Transaction[]
  rentals: Rental[]
  events: AssetEvent[]
  totals: AssetTotals
}

export interface BikeModel {
  id: string
  brand: string
  model: string
  specs: string
  /** Ресурс модели для расчёта износа, км (null — износ не считаем) */
  maxMileageKm: number | null
  /** Остаточная стоимость при достижении ресурса, % от цены покупки */
  residualPercent: number | null
  /** Тарифы модели (принадлежат модели, 1:N) */
  tariffs: Tariff[]
  /** ISO-строка создания; есть не во всех ответах */
  createdAt?: string
}

export const TariffUnit = {
  Hour: 'hour',
  Day: 'day',
  Week: 'week',
  Month: 'month',
} as const
export type TariffUnit = (typeof TariffUnit)[keyof typeof TariffUnit]

/** Тариф из справочника: цена за единицу времени */
export interface Tariff {
  id: string
  name: string
  unit: TariffUnit
  /** Цена, ₽ за unit */
  price: number
}

export interface Customer {
  id: string
  fullName: string
  phone: string
  email: string
  /** Адрес; может быть пустой строкой */
  address: string
  note: string
  rentalsCount: number
}

export const RentalStatus = {
  /** Черновик: создана, активы в резерве, выдачи не было */
  Draft: 'draft',
  Active: 'active',
  Overdue: 'overdue',
  Completed: 'completed',
  /** Завершена досрочным возвратом (раньше конца оплаченного периода) */
  CompletedEarly: 'completed_early',
  Cancelled: 'cancelled',
} as const
export type RentalStatus = (typeof RentalStatus)[keyof typeof RentalStatus]

export const RentalKind = {
  Rent: 'rent',
  RentToOwn: 'rent_to_own',
} as const
export type RentalKind = (typeof RentalKind)[keyof typeof RentalKind]

export interface RentalItem {
  id: string
  assetId: string
  assetType: AssetType
  assetName: string
  inventoryNumber: string
  /** Цена, ₽ за tariffUnit */
  rate: number
  tariffUnit: TariffUnit
  /** ISO-строка возврата; null — ещё не возвращён */
  returnedAt: string | null
  /** Родительская позиция (АКБ комплекта → позиция велосипеда); null — верхний уровень */
  parentItemId: string | null
}

/** Продление аренды: на сколько и как сдвинулся конец периода */
export interface RentalExtension {
  id: string
  duration: number
  durationUnit: TariffUnit
  /** Конец периода до продления, ISO */
  fromEndAt: string
  /** Конец периода после продления, ISO */
  toEndAt: string
  /** ISO-строка создания */
  createdAt: string
  createdByName: string | null
}

/** Строка графика платежей договора «под выкуп» */
export interface RentalScheduleItem {
  seq: number
  /** ISO-строка плановой даты платежа */
  dueDate: string
  /** Плановая сумма, ₽ */
  amount: number
  /** Погашено, ₽ (хранится на бэке, разносится платежами FIFO) */
  paidPart: number
  status: 'paid' | 'partial' | 'next' | 'pending' | 'overdue'
}

/** Стратегия переплаты по графику выкупа; без стратегии — переплата гасит ближайшие платежи */
export const OverpaymentStrategy = {
  /** Срок короче, платёж прежний */
  ShortenTerm: 'shorten_term',
  /** Следующие платежи меньше, срок прежний */
  ReduceNext: 'reduce_next',
} as const
export type OverpaymentStrategy = (typeof OverpaymentStrategy)[keyof typeof OverpaymentStrategy]

export interface Rental {
  id: string
  customerId: string
  customerName: string
  kind: RentalKind
  status: RentalStatus
  /** ISO-строка даты начала */
  startAt: string
  /** ISO-строка планового окончания; у rent_to_own — дата последнего платежа */
  plannedEndAt: string | null
  /** Залог, ₽ */
  deposit: number
  /** Цена выкупа, ₽ (rent_to_own) */
  buyoutPrice: number | null
  /** Срок выкупа в неделях: 13/26/52 (rent_to_own) */
  termWeeks: number | null
  comment: string
  /** Сумма, ₽ */
  amount: number
  /** Оплачено, ₽ */
  paidAmount: number
  /** Возвращено клиенту (расходные операции по аренде) — блок «Возвраты» */
  refundedAmount: number
  items: RentalItem[]
  /** Продления аренды (хронологически) */
  extensions: RentalExtension[]
  /** График платежей (rent_to_own); у rent — пустой массив */
  schedule: RentalScheduleItem[]
  /** Ближайший непогашенный платёж, ISO (rent_to_own); null — всё оплачено */
  nextPaymentDue: string | null
  /** ISO-строка создания */
  createdAt: string
}

export const AccountType = {
  Cash: 'cash',
  Card: 'card',
  Bank: 'bank',
} as const
export type AccountType = (typeof AccountType)[keyof typeof AccountType]

export interface Account {
  id: string
  name: string
  type: AccountType
  /** Текущий остаток, ₽ */
  balance: number
  /** По счёту есть операции — удалить нельзя */
  inUse: boolean
}

/** Облегчённый счёт для селектов (id + название, без остатка) — /finance/accounts/options */
/** Типы событий аренды (лента в карточке) */
export const RentalEventType = {
  Created: 'created',
  Payment: 'payment',
  Issued: 'issued',
  Extension: 'extension',
  /** Изменение условий выкупа: сумма, график платежей */
  Schedule: 'schedule',
  ItemReturn: 'item_return',
  Refund: 'refund',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const
export type RentalEventType = (typeof RentalEventType)[keyof typeof RentalEventType]

/** Событие из истории аренды */
export interface RentalEvent {
  id: string
  type: RentalEventType
  /** ISO-строка */
  date: string
  /** Дата «по документам» (день оплаты из операции, день выдачи/приёма); null если неприменимо */
  docDate: string | null
  comment: string
  /** Сумма операции, ₽; null если событие без денег */
  amount: number | null
  transactionId: string | null
  /** Продление: на сколько и как сдвинулся конец периода */
  duration: number | null
  durationUnit: TariffUnit | null
  fromEndAt: string | null
  toEndAt: string | null
  createdByName: string | null
}

export interface AccountOption {
  id: string
  name: string
}
export const CategoryKind = {
  Income: 'income',
  Expense: 'expense',
} as const
export type CategoryKind = (typeof CategoryKind)[keyof typeof CategoryKind]

/** Статья прихода/расхода */
export interface Category {
  id: string
  name: string
  kind: CategoryKind
  /** По статье есть операции — удалить нельзя */
  inUse: boolean
}

/** Денежная операция по счёту */
export interface Transaction {
  id: string
  accountId: string
  categoryId: string
  kind: CategoryKind
  /** Сумма, ₽ (всегда положительная; знак определяется kind) */
  amount: number
  /** ISO-строка даты */
  date: string
  comment: string
  /** Привязка к аренде; null — ручная операция */
  rentalId: string | null
  /** Привязка к активу; null — операция без актива */
  assetId: string | null
  /** Системная операция (покупка/продажа техники) — не редактируется и не удаляется */
  system: boolean
  /** Статус аренды, к которой привязана операция; null — операция без аренды.
   *  completed/completed_early — операция заморожена (бэк отклоняет PATCH/DELETE с 409) */
  rentalStatus: string | null
}

/** Дашборд: счётчики активов одного типа по статусам */
export interface DashboardTypeStats {
  type: AssetType
  total: number
  available: number
  mounted: number
  reserved: number
  rented: number
  maintenance: number
}

/** Дашборд: компактная строка аренды (просроченные / подходящие к концу / последние) */
export interface DashboardRental {
  id: string
  customerName: string
  composition: string
  startAt: string
  plannedEndAt: string | null
  amount: number
  status: RentalStatus
  /** Ближайший непогашенный платёж по графику (rent_to_own), ISO */
  nextPaymentDue: string | null
}

/** GET /api/dashboard — весь дашборд одним запросом */
export interface Dashboard {
  assets: DashboardTypeStats[]
  overdue: DashboardRental[]
  endingSoon: DashboardRental[]
  latest: DashboardRental[]
}
