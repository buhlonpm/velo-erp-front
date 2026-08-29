import type { ChangeEvent } from 'react'

/** Нормализация к 11 цифрам с ведущей 7: «8…» → «7…» */
function normalizeDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits && !digits.startsWith('7')) digits = `7${digits}`
  return digits.slice(0, 11)
}

/** «79213456789» → «+7 (921) 345-67-89», прогрессивно по мере ввода */
function formatDigits(digits: string): string {
  if (!digits) return ''
  const national = digits.slice(1)
  let out = '+7'
  if (national.length > 0) out += ` (${national.slice(0, 3)}`
  if (national.length >= 3) out += ')'
  if (national.length > 3) out += ` ${national.slice(3, 6)}`
  if (national.length > 6) out += `-${national.slice(6, 8)}`
  if (national.length > 8) out += `-${national.slice(8, 10)}`
  return out
}

const PHONE_PATTERN = '^\\+7 \\(\\d{3}\\) \\d{3}-\\d{2}-\\d{2}$'

/**
 * Телефон РФ с маской «+7 (XXX) XXX-XX-XX».
 * Наружу в onChange отдаёт отформатированную строку (её же и храним).
 */
export function PhoneInput({
  value,
  onChange,
  required,
  placeholder = '+7 (900) 000-00-00',
  id,
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
  id?: string
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    let digits = normalizeDigits(raw)
    // Backspace по разделителю (")", пробел, дефис): цифры не изменились — сносим ещё одну
    const prevDigits = normalizeDigits(value)
    if (raw.length < value.length && digits === prevDigits) {
      digits = digits.slice(0, -1)
    }
    onChange(formatDigits(digits))
  }

  return (
    <input
      id={id}
      type="tel"
      inputMode="tel"
      required={required}
      pattern={PHONE_PATTERN}
      title="Формат: +7 (921) 345-67-89"
      value={formatDigits(normalizeDigits(value))}
      onChange={handleChange}
      className="input"
      placeholder={placeholder}
    />
  )
}
