// Pure: the cook calendar. A grid of weeks (Monday first) ending with this week, one cell
// per day in the viewer's time zone. Day math is on "YYYY-MM-DD" keys, so DST never
// shifts a cell; only the instant-to-day step uses the time zone.
import { addDays, weekStart } from "@/features/activity/stats"
import { dayKey } from "@/features/activity/time"

import type { CookRow } from "./cook-days"

export const HEATMAP_WEEKS = 16

export type HeatmapRow = CookRow & { batchId: number }

export type HeatmapCell = {
  /** "YYYY-MM-DD" */
  day: string
  /** Distinct cooks (a person's batch) that day, whole household. */
  cooks: number
  /** 0 none, 1 one cook, 2 two cooks, 3 three or more. */
  level: 0 | 1 | 2 | 3
  /** After today: drawn faint and not counted. */
  future: boolean
}

export type Heatmap = {
  /** Weeks oldest first; each has 7 cells, Monday to Sunday. */
  weeks: HeatmapCell[][]
  /** Days with a cook among the last 28 days up to and including today. */
  cookDaysLast28: number
}

export function buildHeatmap(
  rows: readonly HeatmapRow[],
  now: number,
  timeZone?: string,
  weekCount = HEATMAP_WEEKS,
): Heatmap {
  const today = dayKey(now, timeZone)
  const first = addDays(weekStart(today), -(weekCount - 1) * 7)

  const batchesByDay = new Map<string, Set<string>>()
  for (const row of rows) {
    if (row.action !== "cooked") continue
    const ms = Date.parse(row.createdAt)
    if (Number.isNaN(ms)) continue
    const day = dayKey(ms, timeZone)
    let batches = batchesByDay.get(day)
    if (!batches) batchesByDay.set(day, (batches = new Set()))
    batches.add(`${row.batchId}:${row.actorId ?? "-"}`)
  }

  const weeks: HeatmapCell[][] = []
  for (let w = 0; w < weekCount; w += 1) {
    const cells: HeatmapCell[] = []
    for (let d = 0; d < 7; d += 1) {
      const day = addDays(first, w * 7 + d)
      const future = day > today
      const cooks = future ? 0 : (batchesByDay.get(day)?.size ?? 0)
      cells.push({ day, cooks, level: Math.min(cooks, 3) as HeatmapCell["level"], future })
    }
    weeks.push(cells)
  }

  const since = addDays(today, -27)
  let cookDaysLast28 = 0
  for (const day of batchesByDay.keys()) if (day >= since && day <= today) cookDaysLast28 += 1

  return { weeks, cookDaysLast28 }
}
