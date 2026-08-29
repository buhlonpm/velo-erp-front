import type { Tone } from '../lib/labels'

const toneClasses: Record<Tone, { badge: string; dot: string }> = {
  emerald: { badge: 'bg-emerald-400/10 text-emerald-400 ring-emerald-400/20', dot: 'bg-emerald-400' },
  sky: { badge: 'bg-sky-400/10 text-sky-400 ring-sky-400/20', dot: 'bg-sky-400' },
  amber: { badge: 'bg-amber-400/10 text-amber-400 ring-amber-400/20', dot: 'bg-amber-400' },
  red: { badge: 'bg-red-400/10 text-red-400 ring-red-400/20', dot: 'bg-red-400' },
  zinc: { badge: 'bg-zinc-400/10 text-zinc-400 ring-zinc-400/20', dot: 'bg-zinc-400' },
}

interface StatusBadgeProps {
  label: string
  tone: Tone
}

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  const classes = toneClasses[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${classes.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} />
      {label}
    </span>
  )
}
