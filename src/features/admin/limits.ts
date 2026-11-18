import type { DailyCounter, SpoonacularDay } from "@/features/admin/stats"

// Pure helpers for the admin Limits tab. No database or server-only imports, so they can be tested directly.

const DAY_SECONDS = 86400
const HOUR_SECONDS = 3600
const MINUTE_SECONDS = 60

/** Shifts a UTC day (YYYY-MM-DD) by whole days. */
export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

/**
 * Exactly `days` entries ending on `today` (UTC YYYY-MM-DD), oldest first. Days with no row
 * become empty days, so charts never have gaps.
 */
export function fillDays(rows: SpoonacularDay[], days: number, today: string): SpoonacularDay[] {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const filled: SpoonacularDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i)
    filled.push(
      byDay.get(day) ?? {
        day,
        pointsUsed: 0,
        pointsLeft: null,
        requests: 0,
        estimated: false,
        exhaustedAt: null,
      },
    )
  }
  return filled
}

/** A rate-limit window in plain words: 3600 is "1 hour", 900 is "15 min", 86400 is "1 day". */
export function windowLabel(seconds: number): string {
  if (seconds > 0 && seconds % DAY_SECONDS === 0) {
    const n = seconds / DAY_SECONDS
    return n === 1 ? "1 day" : `${n} days`
  }
  if (seconds > 0 && seconds % HOUR_SECONDS === 0) {
    const n = seconds / HOUR_SECONDS
    return n === 1 ? "1 hour" : `${n} hours`
  }
  if (seconds > 0 && seconds % MINUTE_SECONDS === 0) return `${seconds / MINUTE_SECONDS} min`
  return `${seconds} sec`
}

/** Daily counters grouped as metric, then day, then count. Repeated rows add up. */
export function countersByMetric(rows: DailyCounter[]): Map<string, Map<string, number>> {
  const byMetric = new Map<string, Map<string, number>>()
  for (const row of rows) {
    let byDay = byMetric.get(row.metric)
    if (!byDay) {
      byDay = new Map()
      byMetric.set(row.metric, byDay)
    }
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.n)
  }
  return byMetric
}

/** The total count over every row whose metric passes the predicate. */
export function sumMetric(rows: DailyCounter[], predicate: (metric: string) => boolean): number {
  let total = 0
  for (const row of rows) if (predicate(row.metric)) total += row.n
  return total
}

/** Spoonacular cache hits over all lookups, or null when there were no lookups. */
export function cacheHitRate(rows: DailyCounter[]): number | null {
  const hits = sumMetric(rows, (metric) => metric === "spoonacular_cache:hit")
  const misses = sumMetric(rows, (metric) => metric === "spoonacular_cache:miss")
  const lookups = hits + misses
  return lookups === 0 ? null : hits / lookups
}

/** Error counts by code for metrics like `ai_error:<code>`, biggest first (ties sorted by code). */
export function errorsByCode(rows: DailyCounter[], prefix: string): { code: string; total: number }[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (!row.metric.startsWith(prefix)) continue
    const code = row.metric.slice(prefix.length)
    totals.set(code, (totals.get(code) ?? 0) + row.n)
  }
  return [...totals.entries()]
    .map(([code, total]) => ({ code, total }))
    .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code))
}
