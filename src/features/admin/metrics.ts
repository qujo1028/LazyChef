import "server-only"

import { getServerDb } from "@/lib/supabase/service"

/**
 * Counts one event today (AI errors, Spoonacular cache hits and errors). Safe to fire and
 * forget: it never throws and does nothing when the secret key isn't set. The database only
 * accepts a few fixed metric names, so a bad name is logged and dropped.
 */
export async function bumpMetric(metric: string): Promise<void> {
  try {
    const db = getServerDb()
    if (!db) return
    const { error } = await db.rpc("bump_daily_metric", { p_metric: metric })
    if (error) console.error("[admin] couldn't count", metric, error.message)
  } catch (error) {
    console.error("[admin] couldn't count", metric, error)
  }
}
