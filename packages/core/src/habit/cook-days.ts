// Pure: "which days did each person cook". The habit layer counts DISTINCT COOK DAYS per
// person in the viewer's time zone, not batches: two cooks on one day count once.
// Any row with action 'cooked' is a cook, whatever its recipe ids (quick logs have none).
import { dayKey } from "../dates/time"

/** The few columns every cook-day calculation needs. */
export type CookRow = {
  action: string
  actorId: string | null
  createdAt: string
}

/** Day keys ("YYYY-MM-DD" in `timeZone`) on which each actor cooked. Rows without an actor are skipped. */
export function cookDaysByActor(rows: readonly CookRow[], timeZone?: string): Map<string, Set<string>> {
  const byActor = new Map<string, Set<string>>()
  for (const row of rows) {
    if (row.action !== "cooked" || row.actorId === null) continue
    const ms = Date.parse(row.createdAt)
    if (Number.isNaN(ms)) continue
    let days = byActor.get(row.actorId)
    if (!days) {
      days = new Set()
      byActor.set(row.actorId, days)
    }
    days.add(dayKey(ms, timeZone))
  }
  return byActor
}
