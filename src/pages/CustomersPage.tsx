import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Plus, Search, Users } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { Customer } from '../types'
import { Modal } from '../components/Modal'
import { PhoneInput } from '../components/PhoneInput'
import { EmptyState } from '../components/EmptyState'

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<{ open: boolean; customer?: Customer }>({ open: false })

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

  const saveCustomer = async (form: CustomerForm) => {
    try {
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
    } catch (err) {
      showError(err, 'Не удалось сохранить клиента')
    }
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
          <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
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
                      <button
                        type="button"
                        title="Редактировать"
                        onClick={() => setModal({ open: true, customer })}
                        className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                      >
                        <Pencil size={16} />
                      </button>
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
    </div>
  )
}

interface CustomerForm {
  id?: string
  fullName: string
  phone: string
  email: string
  address: string
  note: string
}

function CustomerModal({
  state,
  onClose,
  onSave,
}: {
  state: { open: boolean; customer?: Customer }
  onClose: () => void
  onSave: (form: CustomerForm) => void
}) {
  const editing = state.customer
  const [fullName, setFullName] = useState(editing?.fullName ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [address, setAddress] = useState(editing?.address ?? '')
  const [note, setNote] = useState(editing?.note ?? '')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!fullName.trim() || !phone.trim()) return
    onSave({
      id: editing?.id,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      note: note.trim(),
    })
  }

  return (
    <Modal
      open={state.open}
      title={editing ? `Редактировать: ${editing.fullName}` : 'Добавить клиента'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm text-zinc-400">ФИО</span>
          <input
            type="text"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Иван Петров"
            className="input"
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Телефон</span>
            <PhoneInput
              required
              value={phone}
              onChange={setPhone}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Адрес</span>
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Город, улица, дом"
              className="input"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm text-zinc-400">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="client@mail.ru"
            className="input"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-zinc-400">Заметка</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            className="input resize-none"
          />
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          >
            Отмена
          </button>
          <button type="submit" className="btn-primary">
            {editing ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
