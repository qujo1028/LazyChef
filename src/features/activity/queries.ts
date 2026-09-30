import "server-only"

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

/** Most rows the Stats page reads (newest first). */
const STATS_LIMIT = 5000

/** The household's cooking and shopping history for the Stats page, plus its members. */
export async function getStatsRows(householdId: string): Promise<{
  rows: StatsRow[]
  members: ActivityMember[]
  fetchedAt: number
}> {
  const supabase = await createClient()
  const [activity, members] = await Promise.all([
    supabase
      .from("activity_log")
      .select("action, batch_id, actor_id, item_name, details, created_at")
      .eq("household_id", householdId)
      .in("action", ["cooked", "shopped"])
      .order("created_at", { ascending: false })
      .limit(STATS_LIMIT),
    getHouseholdMembers(householdId),
  ])
  if (activity.error) throw activity.error

  return {
    rows: activity.data.map((row) => ({
      action: row.action === "shopped" ? "shopped" : "cooked",
      batchId: Number(row.batch_id),
      actorId: row.actor_id,
      itemName: row.item_name,
      details: row.details,
      createdAt: row.created_at,
    })),
    members: members.map(({ userId, displayName, avatarUrl }) => ({ userId, displayName, avatarUrl })),
    fetchedAt: Date.now(),
  }
}
