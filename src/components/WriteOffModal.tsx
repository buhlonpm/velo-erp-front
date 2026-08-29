import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import type { AccountOption, Asset, WriteOffReason } from '../types'
import { Modal } from './Modal'
import { writeOffReasonLabels } from '../lib/labels'

/**
 * Списание актива (POST /assets/{id}/write-off).
 * reason=sold требует цену и счёт зачисления.
 */
export function WriteOffModal({
  asset,
  accounts,
  onClose,
  onSaved,
}: {
  asset: Asset | null
  accounts: AccountOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [reason, setReason] = useState<WriteOffReason>('broken')
  const [salePrice, setSalePrice] = useState('')
  const [saleAccountId, setSaleAccountId] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!asset) return null

  const isSold = reason === 'sold'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isSold) {
      const price = Number(salePrice)
      if (!salePrice.trim() || Number.isNaN(price) || price <= 0 || !saleAccountId) return
    }
    setSubmitting(true)
    setError('')
    try {
      await api(`/assets/${asset.id}/write-off`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          ...(isSold
            ? { salePrice: Number(salePrice), saleAccountId }
            : {}),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      })
      onSaved()
    } catch (err) {
      // 409: актив в аренде / уже выбыл / нет цены продажи — текст сервера
      setError(err instanceof ApiError ? err.message : 'Не удалось списать актив')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      title={`Списание: ${asset.name} (${asset.inventoryNumber})`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Причина</label>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as WriteOffReason)}
            className="input"
          >
            {(Object.keys(writeOffReasonLabels) as WriteOffReason[]).map((value) => (
              <option key={value} value={value}>
                {writeOffReasonLabels[value]}
              </option>
            ))}
          </select>
        </div>

        {isSold && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Цена продажи, ₽ *</label>
              <input
                required
                type="number"
                min={1}
                value={salePrice}
                onChange={(event) => setSalePrice(event.target.value)}
                className="input"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">Зачислить на счёт *</label>
              <select
                required
                value={saleAccountId}
                onChange={(event) => setSaleAccountId(event.target.value)}
                className="input"
              >
                <option value="" disabled>
                  Выберите счёт…
                </option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Комментарий</label>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="input"
            placeholder="Необязательно"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          Списать
        </button>
      </form>
    </Modal>
  )
}
