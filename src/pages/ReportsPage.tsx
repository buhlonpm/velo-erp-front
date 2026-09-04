import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Bike, Info } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { AccountOption, PnlReport, PnlRow } from '../types'
import { Loading } from '../components/Loading'
import { EmptyState } from '../components/EmptyState'
import { formatMoney, todayDateInput } from '../lib/format'

type Preset = 'month' | 'prevMonth' | '30days' | 'allTime'

const presetLabels: Record<Preset, string> = {
  month: 'Этот месяц',
  prevMonth: 'Прошлый месяц',
  '30days': '30 дней',
  allTime: 'За всё время',
}

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (preset === 'month') {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }
  }
  if (preset === 'prevMonth') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: iso(first), to: iso(last) }
  }
  if (preset === 'allTime') {
    // старт подставит бэк — дата первой операции по кассе
    return { from: '', to: iso(now) }
  }
  const from = new Date(now)
  from.setDate(from.getDate() - 29)
  return { from: iso(from), to: iso(now) }
}

/** Кассовый P&L за период: приходы/расходы по статьям, капекс (техника) — отдельно. */
export function ReportsPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [report, setReport] = useState<PnlReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /** Активный пресет (null — диапазон выбран руками, ни один пресет не подсвечен) */
  const [preset, setPreset] = useState<Preset | null>('month')
  const [range, setRange] = useState(() => presetRange('month'))
  const [accountId, setAccountId] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const accountParam = accountId === 'all' ? '' : `&accountId=${accountId}`
      const fromParam = range.from ? `&from=${range.from}` : '' // пустой from — «за всё время»
      const data = await api<PnlReport>(`/reports/pnl?to=${range.to}${fromParam}${accountParam}`)
      setReport(data)
      // у «за всё время» бэк вернул реальный старт (первая операция) — показываем его в инпуте
      if (!range.from && data.from) {
        setRange((prev) => (prev.from ? prev : { ...prev, from: data.from }))
      }
    } catch (err) {
      setReport(null)
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить отчёт')
    } finally {
      setLoading(false)
    }
  }, [range, accountId])

  useEffect(() => {
    api<AccountOption[]>('/finance/accounts/options').then(setAccounts).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (range.from > range.to) return // бэк вернёт 400, просто ждём корректный диапазон
    load()
  }, [load, range])

  const applyPreset = (next: Preset) => {
    setPreset(next)
    setRange(presetRange(next))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-zinc-100">Отчёты</h1>
        <span className="text-sm text-zinc-500">Прибыль (P&L), кассовый метод</span>
      </div>

      {/* Фильтры: период (пресеты + ручной диапазон) и счёт */}
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="flex gap-1">
          {(Object.keys(presetLabels) as Preset[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={`rounded-lg px-3 py-2 text-sm transition ${
                preset === key
                  ? 'bg-emerald-400/10 text-emerald-400'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              {presetLabels[key]}
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-zinc-500">С</label>
          <input
            type="date"
            value={range.from}
            max={range.to || todayDateInput()}
            onChange={(event) => {
              setPreset(null)
              setRange((prev) => ({ ...prev, from: event.target.value }))
            }}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-zinc-500">По</label>
          <input
            type="date"
            value={range.to}
            min={range.from}
            max={todayDateInput()}
            onChange={(event) => {
              setPreset(null)
              setRange((prev) => ({ ...prev, to: event.target.value }))
            }}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-zinc-500">Счёт</label>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="input"
          >
            <option value="all">Все счета</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <Loading />
      ) : report ? (
        <>
          {/* Итоги */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <TotalCard
              label="Операционная прибыль"
              value={report.operatingProfit}
              hint="Приходы минус расходы за период, без покупки и продажи техники и без вложений владельца — честный результат работы проката"
            />
            <TotalCard
              label="Приходы"
              value={report.incomeTotal}
              hint="Сумма приходных операций за период: оплаты аренд, выкупные платежи, чаевые и прочие. Вложения владельца сюда не входят"
            />
            <TotalCard
              label="Расходы"
              value={report.expenseTotal}
              hint="Сумма расходных операций за период, включая покупку техники"
            />
            <TotalCard
              label="Итог с капексом"
              value={report.netProfit}
              hint={`Операционная прибыль минус вложения в технику (${formatMoney(report.capexOut)}) плюс выручка за проданную технику (${formatMoney(report.capexIn)}). Фактически — изменение денег на счетах за период без вложений владельца`}
            />
          </div>

          {report.ownerInvestmentTotal > 0 && (
            <p className="text-sm text-zinc-500">
              Вложения владельца за период («Введение денег в бизнес»):{' '}
              <span className="font-medium text-zinc-300">
                +{formatMoney(report.ownerInvestmentTotal)}
              </span>{' '}
              — в прибыль не входят
            </p>
          )}

          {/* Разрез по статьям */}
          <div className="grid gap-6 lg:grid-cols-2">
            <CategoryPanel
              title="Приходы"
              rows={report.income}
              total={report.incomeTotal}
              tone="text-emerald-400"
              rowHint="Сумма приходных операций по этой статье за выбранный период"
            />
            <CategoryPanel
              title="Расходы"
              rows={report.expense}
              total={report.expenseTotal}
              tone="text-red-400"
              rowHint="Сумма расходных операций по этой статье за выбранный период"
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Иконка-подсказка «как считается»: тултип при наведении, как в карточке актива */
function Hint({ text }: { text: string }) {
  return (
    <span className="group relative cursor-help text-zinc-600 hover:text-zinc-400">
      <Info size={13} />
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 hidden w-64 -translate-x-1/2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-normal normal-case leading-relaxed text-zinc-300 shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  )
}

function TotalCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="panel p-5">
      <p className="inline-flex items-center gap-1.5 text-sm text-zinc-400">
        {label}
        <Hint text={hint} />
      </p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          value < 0 ? 'text-red-400' : 'text-zinc-100'
        }`}
      >
        {formatMoney(value)}
      </p>
    </div>
  )
}

function CategoryPanel({
  title,
  rows,
  total,
  tone,
  rowHint,
}: {
  title: string
  rows: PnlRow[]
  total: number
  tone: string
  /** Подсказка «как считается» у каждой строки */
  rowHint: string
}) {
  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <h2 className="font-semibold text-zinc-100">{title}</h2>
        <span className={`font-semibold ${tone}`}>{formatMoney(total)}</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="Нет операций" description="За выбранный период операций нет" />
      ) : (
        <ul className="divide-y divide-white/5">
          {rows.map((row) => (
            <li key={row.categoryId} className="flex items-center justify-between px-5 py-3">
              <span className="flex items-center gap-2 text-sm text-zinc-300">
                {row.categoryName}
                <Hint text={row.capex
                  ? 'Покупка/продажа техники — капекс: входит в «Итог с капексом», но не в операционную прибыль'
                  : rowHint} />
                {row.capex && (
                  <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-500">
                    <Bike size={12} />
                    техника
                  </span>
                )}
              </span>
              <span className={`text-sm font-medium ${tone}`}>{formatMoney(row.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
