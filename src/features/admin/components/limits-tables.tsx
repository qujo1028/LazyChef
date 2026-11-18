import { Badge } from "@/components/ui/badge"
import { countersByMetric, addDays, windowLabel } from "@/features/admin/limits"
import type { AiTopHousehold, DailyCounter, RateLimitStat } from "@/features/admin/stats"
import { utcDay } from "@/lib/spoonacular/cost"
import { formatCount } from "@/features/admin/components/stat-tile"

// Tables for the admin Limits tab. Each wraps itself in overflow-x-auto so a wide table scrolls
// inside its card instead of pushing the page sideways on a phone.

const CELL = "px-2 py-1.5 align-top"
const HEAD = "px-2 py-1.5 text-left text-xs font-medium text-muted-foreground"

/** Per-person hourly-style limits: who is at the cap now, and how often requests were refused. */
export function RateLimitTable({ rows }: { rows: RateLimitStat[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No limits are set.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th scope="col" className={HEAD}>Bucket</th>
            <th scope="col" className={HEAD}>Limit</th>
            <th scope="col" className={HEAD}>Active users now</th>
            <th scope="col" className={HEAD}>At limit now</th>
            <th scope="col" className={HEAD}>Hits (24 h)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const atLimit = row.usersAtLimit > 0
            return (
              <tr key={row.bucket} className={`border-b last:border-0 ${atLimit ? "bg-amber-500/10" : ""}`}>
                <th scope="row" className={`${CELL} font-mono text-xs font-normal`}>{row.bucket}</th>
                <td className={CELL}>{`${formatCount(row.maxHits)} per ${windowLabel(row.windowSeconds)}`}</td>
                <td className={`${CELL} tabular-nums`}>{formatCount(row.activeUsers)}</td>
                <td className={`${CELL} tabular-nums`}>
                  <span className="inline-flex items-center gap-2">
                    {formatCount(row.usersAtLimit)}
                    {atLimit ? <Badge variant="outline">At limit</Badge> : null}
                  </span>
                </td>
                <td className={`${CELL} tabular-nums`}>{formatCount(row.hits24h)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** The households that used the most AI in the last 7 days, with their weekly cap. */
export function TopHouseholdsTable({ rows, limit }: { rows: AiTopHousehold[]; limit: number }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No household has used the AI in the last 7 days.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th scope="col" className={HEAD}>Household</th>
            <th scope="col" className={HEAD}>Uses (7 d)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.householdId} className={`border-b last:border-0 ${row.atLimit ? "bg-amber-500/10" : ""}`}>
              <th scope="row" className={`${CELL} font-normal`}>{row.householdName}</th>
              <td className={`${CELL} tabular-nums`}>
                <span className="inline-flex items-center gap-2">
                  {`${formatCount(row.uses7d)} / ${formatCount(limit)}`}
                  {row.atLimit ? <Badge variant="outline">At cap</Badge> : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Requests refused by each limit bucket over 14 days, with yesterday and today split out. */
export function RejectedTable({ rows }: { rows: DailyCounter[] }) {
  const today = utcDay()
  const yesterday = addDays(today, -1)
  const byMetric = countersByMetric(rows)

  const buckets = [...byMetric.entries()]
    .filter(([metric]) => metric.startsWith("rate_limited:"))
    .map(([metric, byDay]) => ({
      bucket: metric.slice("rate_limited:".length),
      total: [...byDay.values()].reduce((sum, n) => sum + n, 0),
      yesterday: byDay.get(yesterday) ?? 0,
      today: byDay.get(today) ?? 0,
    }))
    .sort((a, b) => b.total - a.total || a.bucket.localeCompare(b.bucket))

  if (buckets.length === 0) {
    return <p className="text-sm text-muted-foreground">No requests were turned away in the last 14 days.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th scope="col" className={HEAD}>Bucket</th>
            <th scope="col" className={HEAD}>Total 14 d</th>
            <th scope="col" className={HEAD}>Yesterday</th>
            <th scope="col" className={HEAD}>Today</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((row) => (
            <tr key={row.bucket} className="border-b last:border-0">
              <th scope="row" className={`${CELL} font-mono text-xs font-normal`}>{row.bucket}</th>
              <td className={`${CELL} tabular-nums`}>{formatCount(row.total)}</td>
              <td className={`${CELL} tabular-nums`}>{formatCount(row.yesterday)}</td>
              <td className={`${CELL} tabular-nums`}>{formatCount(row.today)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
