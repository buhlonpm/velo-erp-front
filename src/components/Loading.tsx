import { useEffect, useState } from 'react'

/**
 * Индикатор загрузки с задержкой 250 мс: при быстром ответе API
 * текст не мелькает, раздел открывается сразу.
 */
export function Loading({ padded = true }: { padded?: boolean }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 250)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null
  return <p className={`${padded ? 'p-6 ' : ''}text-sm text-zinc-500`}>Загрузка…</p>
}
