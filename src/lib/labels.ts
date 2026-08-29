import type {
  AccountType,
  AssetEventType,
  AssetStatus,
  AssetType,
  CategoryKind,
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
  rented: 'В аренде',
  maintenance: 'Обслуживание',
  sold: 'Продан',
  decommissioned: 'Списан',
}

export const assetStatusTones: Record<AssetStatus, Tone> = {
  available: 'emerald',
  mounted: 'sky',
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
  active: 'Активна',
  overdue: 'Просрочена',
  completed: 'Завершена',
  cancelled: 'Отменена',
}

export const rentalStatusTones: Record<RentalStatus, Tone> = {
  active: 'emerald',
  overdue: 'red',
  completed: 'zinc',
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

export const accountTypeLabels: Record<AccountType, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bank: 'Расчётный счёт',
}

export const categoryKindLabels: Record<CategoryKind, string> = {
  income: 'Приход',
  expense: 'Расход',
}
