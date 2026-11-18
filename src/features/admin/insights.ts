import "server-only"

import { adminDb, toNumber, unwrap } from "@/features/admin/stats"

// Server-only wrappers around the admin_* database functions for the Insights page.
// Call them after requireAdmin(). They throw on failure; wrap each card in loadSafely().

export type FunnelStep = { step: number; label: string; users: number }

/** How far people who signed up on or after `since` (YYYY-MM-DD) get. Steps 1 to 6, each counted alone. */
export async function getActivationFunnel(since: string): Promise<FunnelStep[]> {
  const rows = unwrap(await adminDb().rpc("admin_activation_funnel", { p_since: since })) ?? []
  return rows.map((r) => ({ step: toNumber(r.step), label: r.label, users: toNumber(r.users) }))
}

export type RetentionCohort = {
  /** Monday of the sign-up week (YYYY-MM-DD, UTC). */
  cohortWeek: string
  size: number
  /** Week 0 is the sign-up week. Only weeks that have started are listed. */
  weeks: { weekN: number; active: number }[]
}

type RetentionRow = { cohort_week: string; size: number | string; week_n: number | string; active: number | string }

/** Groups the flat rows by sign-up week, oldest first, each cohort's weeks in order. */
export function groupRetention(rows: RetentionRow[]): RetentionCohort[] {
  const cohorts = new Map<string, RetentionCohort>()
  for (const r of rows) {
    let cohort = cohorts.get(r.cohort_week)
    if (!cohort) {
      cohort = { cohortWeek: r.cohort_week, size: toNumber(r.size), weeks: [] }
      cohorts.set(r.cohort_week, cohort)
    }
    cohort.weeks.push({ weekN: toNumber(r.week_n), active: toNumber(r.active) })
  }
  const list = [...cohorts.values()].sort((a, b) => a.cohortWeek.localeCompare(b.cohortWeek))
  for (const c of list) c.weeks.sort((a, b) => a.weekN - b.weekN)
  return list
}

export async function getRetentionCohorts(weeks = 8): Promise<RetentionCohort[]> {
  return groupRetention(unwrap(await adminDb().rpc("admin_retention_cohorts", { p_weeks: weeks })) ?? [])
}

export const POPULAR_LISTS = ["cooked", "saved", "rated_up", "rated_down", "pantry", "wasted"] as const
export type PopularList = (typeof POPULAR_LISTS)[number]
export type PopularItem = { name: string; n: number }
export type Popular = Record<PopularList, PopularItem[]>

/** Groups the flat rows by list. Every list is present, empty when nothing came back. */
export function groupPopular(rows: { list: string; name: string; n: number | string }[]): Popular {
  const result: Popular = { cooked: [], saved: [], rated_up: [], rated_down: [], pantry: [], wasted: [] }
  for (const r of rows) {
    if ((POPULAR_LISTS as readonly string[]).includes(r.list)) {
      result[r.list as PopularList].push({ name: r.name, n: toNumber(r.n) })
    }
  }
  return result
}

/** The most cooked, saved, rated, stocked and removed over the last `days`, top `limit` each. */
export async function getPopular(days = 30, limit = 10): Promise<Popular> {
  return groupPopular(unwrap(await adminDb().rpc("admin_popular", { p_days: days, p_limit: limit })) ?? [])
}

export type RevenueCatEvent = {
  type: string
  productId: string | null
  store: string | null
  environment: string | null
  eventAt: string | null
  receivedAt: string
}

/** The latest RevenueCat events, newest first. Says what happened, never to whom. */
export async function getRevenueCatRecent(limit = 50): Promise<RevenueCatEvent[]> {
  const rows = unwrap(await adminDb().rpc("admin_revenuecat_recent", { p_limit: limit })) ?? []
  return rows.map((r) => ({
    type: r.type,
    productId: r.product_id,
    store: r.store,
    environment: r.environment,
    eventAt: r.event_at,
    receivedAt: r.received_at,
  }))
}
