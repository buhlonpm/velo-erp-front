import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { Customer } from '../types'
import { Modal } from '../components/Modal'
import { CustomerModal } from '../components/CustomerModal'
import type { CustomerForm } from '../components/CustomerModal'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<{ open: boolean; customer?: Customer }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)

  const showError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback)

  const loadCustomers = useCallback(async (q: string) => {
    try {
      const param = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
      setCustomers(await api<Customer[]>(`/customers${param}`))
      setError('')
    } catch (err) {
      showError(err, 'Не удалось загрузить клиентов')
    } finally {
      setLoading(false)
    }
  }, [])

  // Поиск на сервере, с небольшим debounce
  useEffect(() => {
    const timer = setTimeout(() => void loadCustomers(query), 300)
    return () => clearTimeout(timer)
  }, [query, loadCustomers])

  // Ошибки сохранения показывает сама модалка (ловит ApiError из onSave)
  const saveCustomer = async (form: CustomerForm) => {
    const body = {
      fullName: form.fullName,
      phone: form.phone,
      ...(form.email ? { email: form.email } : {}),
      ...(form.address ? { address: form.address } : {}),
      ...(form.note ? { note: form.note } : {}),
    }
    if (form.id) {
      await api(`/customers/${form.id}`, { method: 'PATCH', body: JSON.stringify(body) })
    } else {
      await api('/customers', { method: 'POST', body: JSON.stringify(body) })
    }
    await loadCustomers(query)
    setModal({ open: false })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold text-zinc-100">Клиенты</h1>
        <button
          type="button"
          className="btn-primary ml-auto"
          onClick={() => setModal({ open: true })}
        >
          <Plus size={16} />
          Добавить клиента
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="relative w-full sm:w-72">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя или телефон…"
          className="input pl-9"
        />
      </div>

      <section className="panel overflow-hidden">
        {loading ? (
          <Loading />
        ) : customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Клиенты не найдены"
            description="Попробуйте изменить поисковый запрос"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">ФИО</th>
                  <th className="th">Телефон</th>
                  <th className="th">Email</th>
                  <th className="th">Адрес</th>
                  <th className="th">Аренд</th>
                  <th className="th">Заметка</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer, index) => (
                  <tr
                    key={customer.id}
                    className={`transition hover:bg-white/5 ${
                      index % 2 === 1 ? 'bg-white/[0.02]' : ''
                    }`}
                  >
                    <td className="td font-medium text-zinc-200">{customer.fullName}</td>
                    <td className="td">{customer.phone}</td>
                    <td className="td text-zinc-500">{customer.email || '—'}</td>
                    <td className="td max-w-56">
                      <span className="block truncate text-zinc-500" title={customer.address}>
                        {customer.address || '—'}
                      </span>
                    </td>
                    <td className="td">{customer.rentalsCount}</td>
                    <td className="td max-w-56">
                      <span className="block truncate text-zinc-500" title={customer.note}>
                        {customer.note || '—'}
                      </span>
                    </td>
                    <td className="td text-right">
                      <span className="inline-flex gap-1">
                        <button
                          type="button"
                          title="Редактировать"
                          onClick={() => setModal({ open: true, customer })}
                          className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                        >
                          <Pencil size={16} />
                        </button>
                        {/* По клиенту с арендами удаление невозможно (409) — скрываем кнопку */}
                        {customer.rentalsCount === 0 && (
                          <button
                            type="button"
                            title="Удалить"
                            onClick={() => setDeleteTarget(customer)}
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-400"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CustomerModal
        key={modal.customer?.id ?? 'new'}
        state={modal}
        onClose={() => setModal({ open: false })}
        onSave={saveCustomer}
      />

      {/* Удаление клиента без аренд (бэк вернёт 409, если аренды появились) */}
      {deleteTarget && (
        <DeleteCustomerModal
          customer={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSubmit={async () => {
            await api(`/customers/${deleteTarget.id}`, { method: 'DELETE' })
            setDeleteTarget(null)
            await loadCustomers(query)
          }}
        />
      )}
    </div>
  )
}

/** Подтверждение удаления клиента; ошибки (напр. 409 «есть аренды») — текстом внутри модалки */
function DeleteCustomerModal({
  customer,
  onClose,
  onSubmit,
}: {
  customer: Customer
  onClose: () => void
  onSubmit: () => Promise<void>
}) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onSubmit()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить клиента')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open title="Удалить клиента" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <p className="text-sm text-zinc-400">
          Удалить клиента {customer.fullName} навсегда? Действие необратимо.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={16} />
            Удалить
          </button>
        </div>
      </form>
    </Modal>
  )
}

