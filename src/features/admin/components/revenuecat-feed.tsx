import { Badge } from "@/components/ui/badge"
import { agoPhrase } from "@/features/admin/health"
import type { RevenueCatEvent } from "@/features/admin/insights"

const SHOWN = 15

/** The newest RevenueCat webhook events, compact. Sandbox events are marked so they aren't mistaken for real sales. */
export function RevenueCatFeed({ events, now }: { events: RevenueCatEvent[]; now: Date }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No webhook events yet.</p>

  const shown = events.slice(0, SHOWN)
  const hidden = events.length - shown.length

  return (
    <div className="grid gap-2">
      <ul className="grid gap-1.5">
        {shown.map((event, i) => {
          const sandbox = event.environment?.toUpperCase() === "SANDBOX"
          return (
            <li
              key={`${event.receivedAt}-${i}`}
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-b pb-1.5 text-sm last:border-0"
            >
              <span className="font-mono text-xs break-all">{event.type}</span>
              <span className="min-w-0 break-all text-muted-foreground">{event.productId ?? "–"}</span>
              {event.store ? <span className="text-xs text-muted-foreground">{event.store}</span> : null}
              {sandbox ? (
                <Badge variant="secondary">sandbox</Badge>
              ) : event.environment ? (
                <span className="text-xs text-muted-foreground">{event.environment}</span>
              ) : null}
              <time dateTime={event.receivedAt} className="ml-auto text-xs text-muted-foreground tabular-nums">
                {agoPhrase(event.receivedAt, now)}
              </time>
            </li>
          )
        })}
      </ul>
      {hidden > 0 ? <p className="text-xs text-muted-foreground">and {hidden} more</p> : null}
    </div>
  )
}
