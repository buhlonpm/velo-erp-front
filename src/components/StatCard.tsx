import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string
  icon: LucideIcon
  hint?: string
  accent?: boolean
}

export function StatCard({ title, value, icon: Icon, hint, accent }: StatCardProps) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">{title}</span>
        <span
          className={`rounded-lg p-2 ${
            accent ? 'bg-emerald-400/10 text-emerald-400' : 'bg-white/5 text-zinc-400'
          }`}
        >
          <Icon size={18} />
        </span>
      </div>
      <div className={`mt-3 text-2xl font-semibold ${accent ? 'text-emerald-400' : 'text-zinc-100'}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  )
}
