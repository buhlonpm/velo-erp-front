import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client'
import type { Customer } from '../types'
import { Modal } from './Modal'
import { PhoneInput } from './PhoneInput'

export interface CustomerForm {
  id?: string
  fullName: string
  phone: string
  email: string
  address: string
  note: string
}

/** Создание/редактирование клиента; ошибки API — текстом внутри модалки */
export function CustomerModal({
  state,
  onClose,
  onSave,
}: {
  state: { open: boolean; customer?: Customer }
  onClose: () => void
  onSave: (form: CustomerForm) => Promise<void>
}) {
  const editing = state.customer
  const [fullName, setFullName] = useState(editing?.fullName ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [address, setAddress] = useState(editing?.address ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!fullName.trim() || !phone.trim()) return
    setError('')
    setSaving(true)
    try {
      await onSave({
        id: editing?.id,
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        note: note.trim(),
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить клиента')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={state.open}
      title={editing ? `Редактировать: ${editing.fullName}` : 'Добавить клиента'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
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
          <button type="submit" disabled={saving} className="btn-primary">
            {editing ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
