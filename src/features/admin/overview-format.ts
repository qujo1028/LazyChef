// Pure helpers for the Overview page: date ranges, gap handling, stacking, cohort maths.
// No server-only import: these are plain functions so they can be unit tested.

const DAY_MS = 86_400_000

import { utcDay } from "@/lib/spoonacular/cost"

export { utcDay }

/** `day` (YYYY-MM-DD) moved by `n` days, UTC. */
export function addDays(day: string, n: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS))
}

/** Every day from `from` to `to` inclusive, oldest first. Empty when from is after to. */
export function dayRange(from: string, to: string): string[] {
  const days: string[] = []
  for (let d = from; d <= to && days.length < 800; d = addDays(d, 1)) days.push(d)
  return days
}

/** The last `count` days ending on `today`, oldest first. */
export function lastDays(today: string, count: number): string[] {
  return dayRange(addDays(today, -(count - 1)), today)
}

/** One value per day; days with no row get `fill` (0 for counts, null for gaps). */
export function fillDays<T extends { day: string }, F extends number | null>(
  rows: T[],
  days: string[],
  pick: (row: T) => number | null,
  fill: F,
): (number | F | null)[] {
  const byDay = new Map(rows.map((r) => [r.day, pick(r)]))
  return days.map((d) => (byDay.has(d) ? (byDay.get(d) ?? null) : fill))
}

/** A daily counter metric as one value per day. Missing days are null (a gap, not zero). */
export function counterSeries(
  counters: { day: string; metric: string; n: number }[],
  metric: string,
  days: string[],
): (number | null)[] {
  const rows = counters.filter((c) => c.metric === metric)
  return fillDays(rows, days, (r) => r.n, null)
}

/**
 * Daily counters only get a row on a day something happened. So once tracking has started
 * (the first day with a row for any of `metrics` inside `days`), a missing day means 0.
 * Days before that stay null (gaps). Returns the start day (null when nothing is tracked)
 * and one series per metric, in the order given.
 */
export function counterSeriesFromStart(
  counters: { day: string; metric: string; n: number }[],
  metrics: string[],
  days: string[],
): { start: string | null; series: Record<string, (number | null)[]> } {
  const inRange = counters.filter((c) => metrics.includes(c.metric) && days.includes(c.day))
  const start = inRange.map((c) => c.day).sort()[0] ?? null
  const series: Record<string, (number | null)[]> = {}
  for (const metric of metrics) {
    const rows = inRange.filter((c) => c.metric === metric)
    series[metric] = fillDays(rows, days, (r) => r.n, 0).map((v, i) => (start === null || days[i] < start ? null : v))
  }
  return { start, series }
}

/** The first day that has a non-null value, or null. `values` lines up with `days`. */
export function firstValueDay(days: string[], values: (number | null)[]): string | null {
  const i = values.findIndex((v) => v !== null)
  return i === -1 ? null : days[i]
}

export type StackColumn = { day: string; total: number; segments: { key: string; n: number }[] }

/** Activity rows (days with nothing left out) as one stacked column per day. Unknown actions are dropped. */
export function stackActivity(
  rows: { day: string; action: string; n: number }[],
  days: string[],
  actions: readonly string[],
): StackColumn[] {
  return days.map((day) => {
    const segments = actions.map((key) => ({
      key,
      n: rows.filter((r) => r.day === day && r.action === key).reduce((sum, r) => sum + r.n, 0),
    }))
    return { day, total: segments.reduce((sum, s) => sum + s.n, 0), segments }
  })
}

/** Share of the cohort active in each week 0..weeks-1, as 0..1. null where the week hasn't happened or the cohort is empty. */
export function cohortPercents(
  cohort: { size: number; weeks: { weekN: number; active: number }[] },
  weeks = 8,
): (number | null)[] {
  return Array.from({ length: weeks }, (_, n) => {
    const w = cohort.weeks.find((x) => x.weekN === n)
    if (!w || cohort.size <= 0) return null
    return Math.min(w.active / cohort.size, 1)
  })
}

/** The usage row for a metric, or undefined. */
export function findMetric<T extends { metric: string }>(stats: T[], metric: string): T | undefined {
  return stats.find((s) => s.metric === metric)
}

export const activityMetric = (action: string) => `activity:${action}`

/** n as a share of the first step, 0..1 (0 when the first step is empty). */
export function shareOf(n: number, total: number): number {
  return total > 0 ? n / total : 0
}

/** A ratio a / b, or null when b is 0. */
export function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null
}

/** "2026-11-17" to "Nov 17". */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

/** "2026-11-01" to "Nov 26". */
export function shortMonth(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
}

const STORE_NAMES: Record<string, string> = {
  app_store: "App Store",
  play_store: "Google Play",
  stripe: "Stripe",
  promotional: "Promotional",
  amazon: "Amazon",
  mac_app_store: "Mac App Store",
}

/** "app_store" to "App Store"; unknown stores are title-cased. */
export function storeLabel(store: string): string {
  return STORE_NAMES[store] ?? store.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/** "App Store: 3, Google Play: 1", biggest first; null when there are none. */
export function formatByStore(byStore: Record<string, number>): string | null {
  const entries = Object.entries(byStore)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  return entries.length ? entries.map(([s, n]) => `${storeLabel(s)}: ${n}`).join(", ") : null
}
