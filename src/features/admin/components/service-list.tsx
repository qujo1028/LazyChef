import type { ServiceCheck } from "@/features/admin/health"
import { StatusDot } from "@/features/admin/components/status-dot"

/** Each external service: name, state, detail, and how long its check took. */
export function ServiceList({ checks }: { checks: ServiceCheck[] }) {
  return (
    <ul className="grid divide-y rounded-lg border">
      {checks.map((check) => (
        <li key={check.name} className="grid gap-1 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-medium">{check.name}</span>
            <StatusDot state={check.state} />
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="min-w-0 text-xs break-words text-muted-foreground">{check.detail}</span>
            {check.latencyMs != null ? (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{check.latencyMs} ms</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
