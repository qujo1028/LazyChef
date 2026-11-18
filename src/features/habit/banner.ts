// Housemate-cook banners, pure: who gets announced, what it says, and the rate limit.
import { cookedRecipe, rowFromRecord } from "@/features/activity/feed"
import type { Tables } from "@/types/database"

export const BANNER_INTERVAL_MS = 5 * 60 * 1000
const REMEMBERED_BATCHES = 200

/** At most one banner per interval, and never twice for the same batch (one cook is many rows). */
export function createBannerGate(intervalMs = BANNER_INTERVAL_MS) {
  const seen = new Set<number>()
  let lastShown = Number.NEGATIVE_INFINITY
  return {
    shouldShow(batchId: number | null, now: number): boolean {
      // A cook without a batch id cannot be deduped (and NaN would match every later one).
      if (batchId !== null && Number.isFinite(batchId)) {
        if (seen.has(batchId)) return false
        seen.add(batchId)
        if (seen.size > REMEMBERED_BATCHES) seen.delete(seen.values().next().value as number)
      }
      if (now - lastShown < intervalMs) return false
      lastShown = now
      return true
    },
  }
}

export type BannerMember = { userId: string; displayName: string }

/** The banner text for a live activity_log insert, or null when it should not be announced. */
export function housemateCookMessage(
  record: Tables<"activity_log">,
  viewerId: string,
  members: readonly BannerMember[],
): { batchId: number | null; title: string } | null {
  if (record.action !== "cooked" || !record.actor_id || record.actor_id === viewerId) return null
  const name = members.find((m) => m.userId === record.actor_id)?.displayName ?? "A housemate"
  const recipe = cookedRecipe(rowFromRecord(record))
  return {
    batchId: record.batch_id == null ? null : Number(record.batch_id),
    title: recipe ? `${name} just cooked ${recipe.title}` : `${name} just cooked something`,
  }
}
