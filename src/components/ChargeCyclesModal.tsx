import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client'
import type { Asset } from '../types'
import { Modal } from './Modal'

/** Значение для input datetime-local из Date (в локальной TZ) */
function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/**
 * Запись циклов перезарядки в журнал АКБ (POST /assets/{id}/charge-cycles).
 * Дата/время по умолчанию — текущий момент, можно изменить на прошлое
 * (но не раньше последней записи журнала); будущая дата запрещена — как у пробега.
 */
export function ChargeCyclesModal({
  asset,
  minRecordedAt,
  onClose,
  onSave,
}: {
  asset: Asset | null
  /** Дата последней записи журнала — раньше неё ставить нельзя (бэк отвечает 409) */
  minRecordedAt?: string | null
  onClose: () => void
  /** Должен кидать ошибку (ApiError) — модалка покажет её текстом и не закроется */
  onSave: (assetId: string, cycles: number, recordedAt: string | null) => Promise<void>
}) {
  const [cycles, setCycles] = useState('')
  const [recordedAt, setRecordedAt] = useState(() => toLocalInputValue(new Date()))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!asset) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const value = Number(cycles)
    if (Number.isNaN(value) || value < 0 || !recordedAt) return
    setSubmitting(true)
    setError('')
    try {
      await onSave(asset.id, value, new Date(recordedAt).toISOString())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось записать циклы')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      title={`Циклы перезарядки: ${asset.name} (${asset.inventoryNumber})`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Циклов перезарядки</label>
          <input
            required
            type="number"
            min={asset.chargeCycles ?? 0}
            value={cycles}
            onChange={(event) => setCycles(event.target.value)}
            className="input"
            placeholder={asset.chargeCycles != null ? String(asset.chargeCycles) : '0'}
          />
          {asset.chargeCycles != null && (
            <p className="mt-1 text-xs text-zinc-500">
              Текущее: {asset.chargeCycles} — новое значение не может быть меньше
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">Дата и время</label>
          <input
            required
            type="datetime-local"
            min={minRecordedAt ? toLocalInputValue(new Date(minRecordedAt)) : undefined}
            max={toLocalInputValue(new Date())}
            value={recordedAt}
            onChange={(event) => setRecordedAt(event.target.value)}
            className="input"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          Записать
        </button>
      </form>
    </Modal>
  )
}
