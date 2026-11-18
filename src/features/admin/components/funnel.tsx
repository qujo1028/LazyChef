import { formatCount, formatPercent } from "@/features/admin/components/stat-tile"
import { shareOf } from "@/features/admin/overview-format"

/** Horizontal bars, one per step, as a share of step 1. Steps are counted separately. */
export function Funnel({ steps, caption }: { steps: { step: number; label: string; users: number }[]; caption: string }) {
  const first = steps[0]?.users ?? 0
  return (
    <figure className="grid gap-3">
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
      <ol className="grid gap-2" aria-label="People who reached each step">
        {steps.map((s) => {
          const share = shareOf(s.users, first)
          return (
            <li key={s.step} className="grid gap-1" title={`${s.label}: ${formatCount(s.users)} (${formatPercent(share)})`}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {s.step}. {s.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatCount(s.users)} reached · {formatPercent(share)}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share * 100, s.users > 0 ? 1 : 0)}%` }} />
              </div>
            </li>
          )
        })}
      </ol>
    </figure>
  )
}
