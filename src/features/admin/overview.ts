import "server-only"

import { adminDb, firstRow, toNumber, toNumberOrNull, unwrap } from "@/features/admin/stats"

// Server-only wrappers around the admin_* database functions for the Overview page.
// Call them after requireAdmin(). They throw on failure; wrap each card in loadSafely().

export type UserStats = {
  usersTotal: number
  new24h: number
  new7d: number
  new30d: number
  dau: number
  wau: number
  mau: number
  householdsTotal: number
  householdsNew7d: number
  householdsNew30d: number
  avgMembers: number
  /** 0 to 1. */
  multiMemberShare: number
  emptyHouseholds: number
}

export async function getUserStats(): Promise<UserStats> {
  const r = firstRow(unwrap(await adminDb().rpc("admin_user_stats")), "user numbers")
  return {
    usersTotal: toNumber(r.users_total),
    new24h: toNumber(r.new_24h),
    new7d: toNumber(r.new_7d),
    new30d: toNumber(r.new_30d),
    dau: toNumber(r.dau),
    wau: toNumber(r.wau),
    mau: toNumber(r.mau),
    householdsTotal: toNumber(r.households_total),
    householdsNew7d: toNumber(r.households_new_7d),
    householdsNew30d: toNumber(r.households_new_30d),
    avgMembers: toNumber(r.avg_members),
    multiMemberShare: toNumber(r.multi_member_share),
    emptyHouseholds: toNumber(r.empty_households),
  }
}

export type SignupDay = { day: string; users: number; households: number }

/** New people and households per UTC day, oldest first, zero days included. */
export async function getSignupsDaily(days = 30): Promise<SignupDay[]> {
  const rows = unwrap(await adminDb().rpc("admin_signups_daily", { p_days: days })) ?? []
  return rows.map((r) => ({ day: r.day, users: toNumber(r.users), households: toNumber(r.households) }))
}

/** USD, production only, before the store's cut except where noted. */
export type RevenueStats = {
  grossAllTime: number
  gross30d: number
  grossMonth: number
  refunds30d: number
  /** After the store's cut (RevenueCat's takehome, 70% when missing), refunds taken off. */
  net30dEst: number
  mrrEst: number
  payingUsers: number
  trialsStarted30d: number
  expirations30d: number
  sandboxEvents30d: number
}

export async function getRevenueStats(): Promise<RevenueStats> {
  const r = firstRow(unwrap(await adminDb().rpc("admin_revenue_stats")), "revenue numbers")
  return {
    grossAllTime: toNumber(r.gross_all_time),
    gross30d: toNumber(r.gross_30d),
    grossMonth: toNumber(r.gross_month),
    refunds30d: toNumber(r.refunds_30d),
    net30dEst: toNumber(r.net_30d_est),
    mrrEst: toNumber(r.mrr_est),
    payingUsers: toNumber(r.paying_users),
    trialsStarted30d: toNumber(r.trials_started_30d),
    expirations30d: toNumber(r.expirations_30d),
    sandboxEvents30d: toNumber(r.sandbox_events_30d),
  }
}

export type RevenueMonth = { month: string; gross: number; refunds: number }

/** Per UTC month (first day, YYYY-MM-DD), oldest first, zero months included. */
export async function getRevenueMonthly(months = 12): Promise<RevenueMonth[]> {
  const rows = unwrap(await adminDb().rpc("admin_revenue_monthly", { p_months: months })) ?? []
  return rows.map((r) => ({ month: r.month, gross: toNumber(r.gross), refunds: toNumber(r.refunds) }))
}

export type ProStats = {
  activeSubscriptions: number
  trials: number
  notRenewing: number
  sandbox: number
  compsActive: number
  proHouseholds: number
  /** Paying people per store, e.g. { app_store: 3 }. */
  byStore: Record<string, number>
}

export function parseByStore(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([store, n]) => [store, toNumber(n as number | string)]))
}

export async function getProStats(): Promise<ProStats> {
  const r = firstRow(unwrap(await adminDb().rpc("admin_pro_stats")), "Pro numbers")
  return {
    activeSubscriptions: toNumber(r.active_subscriptions),
    trials: toNumber(r.trials),
    notRenewing: toNumber(r.not_renewing),
    sandbox: toNumber(r.sandbox),
    compsActive: toNumber(r.comps_active),
    proHouseholds: toNumber(r.pro_households),
    byStore: parseByStore(r.by_store),
  }
}

/** d30 and d7 are null for metrics without windows (pantry_items_now). */
export type UsageStat = { metric: string; allTime: number; d30: number | null; d7: number | null }

export async function getUsageStats(): Promise<UsageStat[]> {
  const rows = unwrap(await adminDb().rpc("admin_usage_stats")) ?? []
  return rows.map((r) => ({
    metric: r.metric,
    allTime: toNumber(r.all_time),
    d30: toNumberOrNull(r.d30),
    d7: toNumberOrNull(r.d7),
  }))
}

export type ActivityDay = { day: string; action: string; n: number }

/** Activity-log rows per UTC day and action. Days with nothing are left out. */
export async function getActivityDaily(days = 30): Promise<ActivityDay[]> {
  const rows = unwrap(await adminDb().rpc("admin_activity_daily", { p_days: days })) ?? []
  return rows.map((r) => ({ day: r.day, action: r.action, n: toNumber(r.n) }))
}

/** Back-filled days only have usersTotal and householdsTotal; the rest are null. */
export type DailySnapshot = {
  day: string
  capturedAt: string
  usersTotal: number | null
  householdsTotal: number | null
  multiMemberHouseholds: number | null
  proHouseholds: number | null
  payingUsers: number | null
  trialsActive: number | null
  compsActive: number | null
  mrrEstUsd: number | null
  pantryItemsTotal: number | null
  shoppingItemsOpen: number | null
  savedRecipesTotal: number | null
  spoonacularPointsUsed: number | null
}

/** Snapshots between two UTC days (YYYY-MM-DD), inclusive, at most 400 days. */
export async function getDailySnapshots(from: string, to: string): Promise<DailySnapshot[]> {
  const rows = unwrap(await adminDb().rpc("admin_daily_snapshots", { p_from: from, p_to: to })) ?? []
  return rows.map((r) => ({
    day: r.day,
    capturedAt: r.captured_at,
    usersTotal: toNumberOrNull(r.users_total),
    householdsTotal: toNumberOrNull(r.households_total),
    multiMemberHouseholds: toNumberOrNull(r.multi_member_households),
    proHouseholds: toNumberOrNull(r.pro_households),
    payingUsers: toNumberOrNull(r.paying_users),
    trialsActive: toNumberOrNull(r.trials_active),
    compsActive: toNumberOrNull(r.comps_active),
    mrrEstUsd: toNumberOrNull(r.mrr_est_usd),
    pantryItemsTotal: toNumberOrNull(r.pantry_items_total),
    shoppingItemsOpen: toNumberOrNull(r.shopping_items_open),
    savedRecipesTotal: toNumberOrNull(r.saved_recipes_total),
    spoonacularPointsUsed: toNumberOrNull(r.spoonacular_points_used),
  }))
}

/**
 * Saves today's snapshot if there isn't one yet (the dashboard calls this as it loads, so
 * history builds up without a cron job). Never throws: failures are logged.
 */
export async function captureSnapshotIfMissing(): Promise<void> {
  try {
    const db = adminDb()
    const today = new Date().toISOString().slice(0, 10)
    const existing = unwrap(await db.rpc("admin_daily_snapshots", { p_from: today, p_to: today })) ?? []
    if (existing.length > 0) return
    unwrap(await db.rpc("admin_capture_daily_snapshot", { p_day: today }))
  } catch (error) {
    console.error("[admin] couldn't save today's snapshot:", error)
  }
}
