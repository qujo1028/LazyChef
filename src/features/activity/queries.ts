import "server-only"

import type { CookRow } from "@/features/habit/cook-days"
import { getHouseholdMembers } from "@/features/household/queries"
import { createClient } from "@/lib/supabase/server"

import { ACTIVITY_LIMIT, type ActivityMember, type ActivityRow } from "./feed"
import type { StatsRow } from "./stats"

/** The household's latest activity (newest first), its members for naming live rows, and when it was read. */
export async function getActivityFeed(householdId: string): Promise<{
  rows: ActivityRow[]
  members: ActivityMember[]
  fetchedAt: number
}> {
  const supabase = await createClient()
  const [activity, members] = await Promise.all([
    supabase
      .from("activity_log")
      .select(
        "id, actor_id, action, item_name, quantity, unit, batch_id, details, created_at, actor:profiles!activity_log_actor_id_fkey(display_name, avatar_url)",
      )
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(ACTIVITY_LIMIT),
    getHouseholdMembers(householdId),
  ])
  if (activity.error) throw activity.error

  return {
    rows: activity.data.map((row) => ({
      id: Number(row.id),
      actorId: row.actor_id,
      actor: row.actor ? { name: row.actor.display_name, avatarUrl: row.actor.avatar_url } : null,
      action: row.action,
      itemName: row.item_name,
      quantity: row.quantity === null ? null : Number(row.quantity),
      unit: row.unit,
      batchId: Number(row.batch_id),
      details: row.details,
      createdAt: row.created_at,
    })),
    members: members.map(({ userId, displayName, avatarUrl }) => ({ userId, displayName, avatarUrl })),
    // Lets the first render's relative times match between server and browser.
    fetchedAt: Date.now(),
  }
}

/** Most rows the Chart and Board read (newest first). Rows are per ingredient, so this is a few hundred cooks. */
export const STATS_LIMIT = 5000
/** PostgREST caps one response (often at 1000 rows), so history is read in pages. */
const PAGE = 1000

/**
 * Reads up to STATS_LIMIT rows through `fetchPage`, a page at a time. It asks for one row
 * more than the limit so `truncated` is exact: true only when older rows were left behind.
 */
async function readPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Error | null }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []
  while (rows.length < STATS_LIMIT + 1) {
    const from = rows.length
    const to = Math.min(from + PAGE, STATS_LIMIT + 1) - 1
    const { data, error } = await fetchPage(from, to)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < to - from + 1) break
  }
  return { rows: rows.slice(0, STATS_LIMIT), truncated: rows.length > STATS_LIMIT }
}

/** The household's cooking and shopping history for the Chart view, plus its members. */
export async function getStatsRows(householdId: string): Promise<{
  rows: StatsRow[]
  members: ActivityMember[]
  fetchedAt: number
  /** True when older history was left out (the 5000 row cap), so all-time numbers are lower bounds. */
  truncated: boolean
}> {
  const supabase = await createClient()
  const [activity, members] = await Promise.all([
    readPages((from, to) =>
      supabase
        .from("activity_log")
        .select("action, batch_id, actor_id, item_name, details, created_at")
        .eq("household_id", householdId)
        .in("action", ["cooked", "shopped"])
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    getHouseholdMembers(householdId),
  ])

  return {
    rows: activity.rows.map((row) => ({
      action: row.action === "shopped" ? "shopped" : "cooked",
      batchId: Number(row.batch_id),
      actorId: row.actor_id,
      itemName: row.item_name,
      details: row.details,
      createdAt: row.created_at,
    })),
    members: members.map(({ userId, displayName, avatarUrl }) => ({ userId, displayName, avatarUrl })),
    fetchedAt: Date.now(),
    truncated: activity.truncated,
  }
}

/**
 * Every cook (newest first) for the Board, with only the columns it needs. Cooked rows
 * only, so shopping never eats into the cap.
 */
export async function getBoardRows(householdId: string): Promise<{
  rows: CookRow[]
  members: ActivityMember[]
  fetchedAt: number
  truncated: boolean
}> {
  const supabase = await createClient()
  const [activity, members] = await Promise.all([
    readPages((from, to) =>
      supabase
        .from("activity_log")
        .select("actor_id, created_at")
        .eq("household_id", householdId)
        .eq("action", "cooked")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    getHouseholdMembers(householdId),
  ])

  return {
    rows: activity.rows.map((row) => ({ action: "cooked", actorId: row.actor_id, createdAt: row.created_at })),
    members: members.map(({ userId, displayName, avatarUrl }) => ({ userId, displayName, avatarUrl })),
    fetchedAt: Date.now(),
    truncated: activity.truncated,
  }
}
