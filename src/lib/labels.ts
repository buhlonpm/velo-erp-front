import type {
  AccountType,
  AssetEventType,
  AssetStatus,
  AssetType,
  CategoryKind,
  RentalEventType,
  RentalKind,
  RentalStatus,
  TariffUnit,
  WriteOffReason,
} from '../types'

export type Tone = 'emerald' | 'sky' | 'amber' | 'red' | 'zinc'

export const assetTypeLabels: Record<AssetType, string> = {
  bike: 'Велосипед',
  battery: 'Аккумулятор',
  charger: 'Зарядное',
}

export const assetStatusLabels: Record<AssetStatus, string> = {
  available: 'Доступен',
  mounted: 'На технике',
  reserved: 'В резерве',
  rented: 'В аренде',
  maintenance: 'Обслуживание',
  sold: 'Продан',
  decommissioned: 'Списан',
}

export const assetStatusTones: Record<AssetStatus, Tone> = {
  available: 'emerald',
  mounted: 'sky',
  reserved: 'amber',
  rented: 'sky',
  maintenance: 'amber',
  sold: 'zinc',
  decommissioned: 'zinc',
}

export const writeOffReasonLabels: Record<WriteOffReason, string> = {
  broken: 'Сломан',
  stolen: 'Кража',
  lost: 'Утеря',
  sold: 'Продан',
  other: 'Прочее',
}

export const assetEventTypeLabels: Record<AssetEventType, string> = {
  purchase: 'Покупка',
  mileage: 'Пробег',
  charge_cycles: 'Циклы перезарядки',
  mount: 'Монтаж АКБ',
  unmount: 'Демонтаж АКБ',
  tracker_install: 'Установка трекера',
  tracker_remove: 'Снятие трекера',
  write_off: 'Выбытие',
}

export const rentalStatusLabels: Record<RentalStatus, string> = {
  draft: 'Черновик',
  active: 'Активна',
  overdue: 'Просрочена',
  completed: 'Завершена',
  completed_early: 'Завершена досрочно',
  cancelled: 'Отменена',
}

export const rentalStatusTones: Record<RentalStatus, Tone> = {
  draft: 'amber',
  active: 'emerald',
  overdue: 'red',
  completed: 'zinc',
  completed_early: 'zinc',
  cancelled: 'zinc',
}

export const rentalKindLabels: Record<RentalKind, string> = {
  rent: 'Аренда',
  rent_to_own: 'Под выкуп',
}

/** Короткие подписи единиц тарифа: «1500 ₽/день» */
export const tariffUnitLabels: Record<TariffUnit, string> = {
  hour: 'час',
  day: 'день',
  week: 'неделя',
  month: 'месяц',
}

/** Длительность единицы тарифа в секундах (месяц = 30 суток, как в TariffUnit на бэке) */
export const tariffUnitSeconds: Record<TariffUnit, number> = {
  hour: 3_600,
  day: 86_400,
  week: 604_800,
  month: 2_592_000,
}

/** Подписи событий аренды (лента истории) */
export const rentalEventTypeLabels: Record<RentalEventType, string> = {
  created: 'Создание',
  payment: 'Оплата',
  issued: 'Выдача',
  extension: 'Продление',
  item_return: 'Возврат позиции',
  refund: 'Возврат денег',
  completed: 'Завершение',
  cancelled: 'Отмена',
}

export const accountTypeLabels: Record<AccountType, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bank: 'Расчётный счёт',
}

export const categoryKindLabels: Record<CategoryKind, string> = {
  income: 'Приход',
  expense: 'Расход',
}
