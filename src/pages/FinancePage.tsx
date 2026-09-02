import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Landmark,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { Account, AccountType, Category, CategoryKind, Transaction } from '../types'
import { Modal } from '../components/Modal'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { formatDateTime, formatMoney } from '../lib/format'
import { accountTypeLabels, categoryKindLabels } from '../lib/labels'

const accountTypeIcons: Record<AccountType, LucideIcon> = {
  cash: Banknote,
  card: CreditCard,
  bank: Landmark,
}

type KindFilter = 'all' | CategoryKind

export function FinancePage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [accountFilter, setAccountFilter] = useState<string>('all')

  const [accountModal, setAccountModal] = useState<{ open: boolean; account?: Account }>({ open: false })
  const [transactionModal, setTransactionModal] = useState<{ open: boolean; transaction?: Transaction }>({ open: false })

  const showError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback)

  const loadAccounts = useCallback(async () => {
    setAccounts(await api<Account[]>('/finance/accounts'))
  }, [])

  const loadCategories = useCallback(async () => {
    setCategories(await api<Category[]>('/finance/categories'))
  }, [])

  const loadTransactions = useCallback(async () => {
    setTransactions(await api<Transaction[]>('/finance/transactions'))
  }, [])

  useEffect(() => {
    Promise.all([loadAccounts(), loadCategories(), loadTransactions()])
      .catch((err) => showError(err, 'Не удалось загрузить финансы'))
      .finally(() => setLoading(false))
  }, [loadAccounts, loadCategories, loadTransactions])

  const totalBalance = useMemo(
    () => accounts.reduce((sum, account) => sum + account.balance, 0),
    [accounts],
  )

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const visibleTransactions = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (kindFilter === 'all' || t.kind === kindFilter) &&
          (accountFilter === 'all' || t.accountId === accountFilter),
      ),
    [transactions, kindFilter, accountFilter],
  )

  const saveAccount = async (form: { id?: string; name: string; type: AccountType }) => {
    try {
      if (form.id) {
        await api(`/finance/accounts/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: form.name, type: form.type }),
        })
      } else {
        await api('/finance/accounts', {
          method: 'POST',
          body: JSON.stringify({ name: form.name, type: form.type }),
        })
      }
      // сначала закрываем модалку, потом перечитываем список
      setAccountModal({ open: false })
      await loadAccounts()
    } catch (err) {
      showError(err, 'Не удалось сохранить счёт')
    }
  }

  const deleteAccount = async (account: Account) => {
    if (!window.confirm(`Удалить счёт «${account.name}»?`)) return
    try {
      await api(`/finance/accounts/${account.id}`, { method: 'DELETE' })
      await loadAccounts()
    } catch (err) {
      // 409: по счёту есть операции
      showError(err, 'Не удалось удалить счёт')
    }
  }

  const saveTransaction = async (form: {
    id?: string
    accountId: string
    categoryId: string
    kind: CategoryKind
    amount: number
    comment: string
  }) => {
    try {
      if (form.id) {
        // kind не редактируется — в PATCH не отправляем
        await api(`/finance/transactions/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            accountId: form.accountId,
            categoryId: form.categoryId,
            amount: form.amount,
            comment: form.comment,
          }),
        })
      } else {
        await api('/finance/transactions', {
          method: 'POST',
          body: JSON.stringify({
            accountId: form.accountId,
            categoryId: form.categoryId,
            kind: form.kind,
            amount: form.amount,
            comment: form.comment,
          }),
        })
      }
      await Promise.all([loadAccounts(), loadTransactions()])
      setTransactionModal({ open: false })
    } catch (err) {
      showError(err, 'Не удалось сохранить операцию')
    }
  }

  const deleteTransaction = async (transaction: Transaction) => {
    if (!window.confirm('Удалить операцию? Баланс счёта пересчитается автоматически.')) return
    try {
      await api(`/finance/transactions/${transaction.id}`, { method: 'DELETE' })
      await Promise.all([loadAccounts(), loadTransactions()])
    } catch (err) {
      showError(err, 'Не удалось удалить операцию')
    }
  }

  if (loading) {
    return <Loading />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Финансы</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Общий остаток: <span className="font-semibold text-emerald-400">{formatMoney(totalBalance)}</span>
          </p>
        </div>
        <button type="button" onClick={() => setTransactionModal({ open: true })} className="btn-primary">
          <Plus size={16} />
          Новая операция
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Счета */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {accounts.map((account) => {
          const Icon = accountTypeIcons[account.type]
          return (
            <div key={account.id} className="panel group relative p-5">
              <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  title="Редактировать счёт"
                  onClick={() => setAccountModal({ open: true, account })}
                  className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/5 hover:text-zinc-300"
                >
                  <Pencil size={14} />
                </button>
                {/* По счёту с операциями удаление невозможно (409) — скрываем кнопку */}
                {!account.inUse && (
                  <button
                    type="button"
                    title="Удалить счёт"
                    onClick={() => void deleteAccount(account)}
                    className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-red-400/10 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <Icon size={16} className="text-emerald-400" />
                <span className="text-sm">{account.name}</span>
              </div>
              <p className="mt-3 text-2xl font-semibold text-zinc-100">{formatMoney(account.balance)}</p>
              <p className="mt-1 text-xs text-zinc-500">{accountTypeLabels[account.type]}</p>
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => setAccountModal({ open: true })}
          className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-zinc-500 transition hover:border-emerald-400/40 hover:text-emerald-400"
        >
          <Plus size={20} />
          <span className="text-sm">Добавить счёт</span>
        </button>
      </section>

      {/* Операции */}
      <OperationsTab
        transactions={visibleTransactions}
        kindFilter={kindFilter}
        onKindFilter={setKindFilter}
        accountFilter={accountFilter}
        onAccountFilter={setAccountFilter}
        accounts={accounts}
        accountById={accountById}
        categoryById={categoryById}
        onEdit={(transaction) => setTransactionModal({ open: true, transaction })}
        onDelete={deleteTransaction}
      />

      <AccountModal
        key={accountModal.account?.id ?? 'new-account'}
        state={accountModal}
        onClose={() => setAccountModal({ open: false })}
        onSave={saveAccount}
      />

      <TransactionModal
        key={transactionModal.transaction?.id ?? 'new-transaction'}
        state={transactionModal}
        accounts={accounts}
        categories={categories}
        onClose={() => setTransactionModal({ open: false })}
        onSave={saveTransaction}
      />
    </div>
  )
}

function OperationsTab({
  transactions,
  kindFilter,
  onKindFilter,
  accountFilter,
  onAccountFilter,
  accounts,
  accountById,
  categoryById,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[]
  kindFilter: KindFilter
  onKindFilter: (filter: KindFilter) => void
  accountFilter: string
  onAccountFilter: (filter: string) => void
  accounts: Account[]
  accountById: Map<string, Account>
  categoryById: Map<string, Category>
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-white/10 p-1">
          {(
            [
              ['all', 'Все'],
              ['income', 'Приходы'],
              ['expense', 'Расходы'],
            ] as [KindFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onKindFilter(value)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                kindFilter === value
                  ? 'bg-emerald-400/10 text-emerald-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={accountFilter}
          onChange={(event) => onAccountFilter(event.target.value)}
          className="input w-auto"
        >
          <option value="all">Все счета</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <section className="panel overflow-hidden">
        {transactions.length === 0 ? (
          <EmptyState icon={Wallet} title="Операций нет" description="Измените фильтры или добавьте операцию" />
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
                  <th className="th" />
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
                      <td className="td max-w-72">
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
                        {/* Операции аренды/актива правятся только из их карточек, системные — никак */}
                        {transaction.system || transaction.rentalId != null || transaction.assetId != null ? (
                          <span
                            className="inline-flex p-2 text-zinc-600"
                            title={
                              transaction.system
                                ? 'Системная операция — создана автоматически (покупка/продажа техники), изменить нельзя'
                                : transaction.rentalId != null
                                  ? 'Операция аренды — правится из карточки аренды'
                                  : 'Операция актива — правится из карточки актива'
                            }
                          >
                            <Lock size={14} />
                          </span>
                        ) : (
                          <span className="inline-flex gap-1">
                            <button
                              type="button"
                              title="Редактировать"
                              onClick={() => onEdit(transaction)}
                              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              title="Удалить"
                              onClick={() => onDelete(transaction)}
                              className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                            >
                              <Trash2 size={16} />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function AccountModal({
  state,
  onClose,
  onSave,
}: {
  state: { open: boolean; account?: Account }
  onClose: () => void
  onSave: (form: { id?: string; name: string; type: AccountType }) => void
}) {
  const editing = state.account
  const [name, setName] = useState(editing?.name ?? '')
  const [type, setType] = useState<AccountType>(editing?.type ?? 'cash')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    onSave({ id: editing?.id, name: name.trim(), type })
  }

  return (
    <Modal open={state.open} title={editing ? 'Редактировать счёт' : 'Новый счёт'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Название</label>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="input"
            placeholder="Касса (наличные)"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Тип</label>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as AccountType)}
            className="input"
          >
            <option value="cash">Наличные</option>
            <option value="card">Карта</option>
            <option value="bank">Расчётный счёт</option>
          </select>
        </div>
        <button type="submit" className="btn-primary w-full">
          {editing ? 'Сохранить' : 'Создать'}
        </button>
      </form>
    </Modal>
  )
}

function TransactionModal({
  state,
  accounts,
  categories,
  onClose,
  onSave,
}: {
  state: { open: boolean; transaction?: Transaction }
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onSave: (form: {
    id?: string
    accountId: string
    categoryId: string
    kind: CategoryKind
    amount: number
    comment: string
  }) => void
}) {
  const editing = state.transaction
  const [kind, setKind] = useState<CategoryKind>(editing?.kind ?? 'income')
  const [accountId, setAccountId] = useState(editing?.accountId ?? '')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [comment, setComment] = useState(editing?.comment ?? '')

  const kindCategories = categories.filter((c) => c.kind === kind)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const value = Number(amount)
    if (!accountId || !categoryId || !value || value <= 0) return
    onSave({ id: editing?.id, accountId, categoryId, kind, amount: value, comment: comment.trim() })
    setAmount('')
    setComment('')
  }

  return (
    <Modal
      open={state.open}
      title={editing ? 'Редактировать операцию' : 'Новая операция'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {editing ? (
          // kind операции не редактируется — показываем текстом
          <p
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              kind === 'income'
                ? 'bg-emerald-400/10 text-emerald-400'
                : 'bg-red-400/10 text-red-400'
            }`}
          >
            {categoryKindLabels[kind]} · вид операции изменить нельзя
          </p>
        ) : (
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
        <button type="submit" className="btn-primary w-full">
          {editing ? 'Сохранить' : 'Добавить'}
        </button>
      </form>
    </Modal>
  )
}
