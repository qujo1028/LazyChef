import "server-only"

import { MissingServerDbError } from "@/features/admin/load"
import { getServerDb } from "@/lib/supabase/service"

// Server-only wrappers around the admin_* database functions (service_role only). Call them
// after requireAdmin(). They throw on failure; wrap each card's load in loadSafely().
// This file also holds the small helpers the other admin data modules share.

/** The service-role client, or MissingServerDbError when SUPABASE_SECRET_KEY isn't set. */
export function adminDb() {
  const db = getServerDb()
  if (!db) throw new MissingServerDbError()
  return db
}

/** The data of a Supabase response, or a plain Error with its message. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/** Postgres numeric and bigint can arrive as strings. Never NaN: unreadable values become 0. */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function toNumberOrNull(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : toNumber(value)
}

/** Postgres interval text ("01:00:00", "1 day 00:15:00") to seconds. 0 when unreadable. */
export function intervalToSeconds(value: string | null | undefined): number {
  const match = /^(?:(\d+) days? )?(\d+):(\d{2}):(\d{2})/.exec(value ?? "")
  if (!match) return 0
  const [, days, h, m, s] = match
  return Number(days ?? 0) * 86400 + Number(h) * 3600 + Number(m) * 60 + Number(s)
}

/** The only row of a one-row function's result. */
export function firstRow<T>(rows: T[] | null, what: string): T {
  const row = rows?.[0]
  if (!row) throw new Error(`No ${what} came back.`)
  return row
}

// ── Limits ───────────────────────────────────────────────────────────────────

export type RateLimitStat = {
  bucket: string
  maxHits: number
  windowSeconds: number
  activeUsers: number
  usersAtLimit: number
  /** A lower bound: old windows are deleted as people's next ones start. */
  hits24h: number
}

export async function getRateLimitStats(): Promise<RateLimitStat[]> {
  const rows = unwrap(await adminDb().rpc("admin_rate_limit_stats")) ?? []
  return rows.map((r) => ({
    bucket: r.bucket,
    maxHits: toNumber(r.max_hits),
    windowSeconds: intervalToSeconds(r.window_length),
    activeUsers: toNumber(r.active_users),
    usersAtLimit: toNumber(r.users_at_limit),
    hits24h: toNumber(r.hits_24h),
  }))
}

export type AiUsageStats = {
  uses24h: number
  uses7d: number
  householdsActive7d: number
  householdsAtLimit: number
  freeWeeklyLimit: number
}

export async function getAiUsageStats(): Promise<AiUsageStats> {
  const r = firstRow(unwrap(await adminDb().rpc("admin_ai_usage_stats")), "AI usage numbers")
  return {
    uses24h: toNumber(r.uses_24h),
    uses7d: toNumber(r.uses_7d),
    householdsActive7d: toNumber(r.households_active_7d),
    householdsAtLimit: toNumber(r.households_at_limit),
    freeWeeklyLimit: toNumber(r.free_weekly_limit),
  }
}

export type AiTopHousehold = { householdId: string; householdName: string; uses7d: number; atLimit: boolean }

export async function getAiTopHouseholds(limit = 10): Promise<AiTopHousehold[]> {
  const rows = unwrap(await adminDb().rpc("admin_ai_top_households", { p_limit: limit })) ?? []
  return rows.map((r) => ({
    householdId: r.household_id,
    householdName: r.household_name,
    uses7d: toNumber(r.uses_7d),
    atLimit: r.at_limit,
  }))
}

export type SpoonacularDay = {
  day: string
  pointsUsed: number
  /** Null when the day's requests never reported the quota headers. */
  pointsLeft: number | null
  requests: number
  /** True when pointsLeft is null, so pointsUsed is our own running estimate. */
  estimated: boolean
  exhaustedAt: string | null
}

/** Spoonacular's daily points, oldest first. The table keeps about 30 days. */
export async function getSpoonacularDaily(days = 30): Promise<SpoonacularDay[]> {
  const rows =
    unwrap(
      await adminDb()
        .from("spoonacular_usage")
        .select("day, points_used, points_left, requests, exhausted_at")
        .order("day", { ascending: false })
        .limit(Math.min(Math.max(Math.trunc(days) || 30, 1), 365)),
    ) ?? []
  return rows
    .map((r) => ({
      day: r.day,
      pointsUsed: toNumber(r.points_used),
      pointsLeft: toNumberOrNull(r.points_left),
      requests: toNumber(r.requests),
      estimated: r.points_left === null,
      exhaustedAt: r.exhausted_at,
    }))
    .reverse()
}

export type DailyCounter = { day: string; metric: string; n: number }

/** The daily event counters between two UTC days (YYYY-MM-DD), inclusive, at most 400 days. */
export async function getDailyCounters(from: string, to: string): Promise<DailyCounter[]> {
  const rows = unwrap(await adminDb().rpc("admin_daily_counters", { p_from: from, p_to: to })) ?? []
  return rows.map((r) => ({ day: r.day, metric: r.metric, n: toNumber(r.n) }))
}
