// Pure: weekly tiers and the milestone a cook can earn.
import type { ChallengeKind } from "./challenges"
import { TIER_THRESHOLDS } from "./constants"
import { streakMilestone } from "./streak"

export type Tier = "bronze" | "silver" | "gold"

export const TIER_LABELS: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" }

/** The tier for this many cook days in a week (null below Bronze). */
export function tierFor(cooksThisWeek: number): Tier | null {
  if (cooksThisWeek >= TIER_THRESHOLDS.gold) return "gold"
  if (cooksThisWeek >= TIER_THRESHOLDS.silver) return "silver"
  if (cooksThisWeek >= TIER_THRESHOLDS.bronze) return "bronze"
  return null
}

/** The next tier up and how many cook days it needs, or null at Gold. */
export function nextTier(cooksThisWeek: number): { tier: Tier; at: number } | null {
  for (const tier of ["bronze", "silver", "gold"] as const) {
    if (cooksThisWeek < TIER_THRESHOLDS[tier]) return { tier, at: TIER_THRESHOLDS[tier] }
  }
  return null
}

export type HabitSnapshot = {
  cooksThisWeek: number
  streak: number
  challengesDone: readonly ChallengeKind[]
}

export type CookMilestone =
  | { kind: "challenge"; challenge: ChallengeKind }
  | { kind: "streak"; days: number }
  | { kind: "tier"; tier: Tier }

/**
 * What a cook earned, comparing the snapshots before and after it: a finished challenge, a streak
 * milestone or a tier-up (in that order when several happen at once). Cook days only grow on a
 * person's first cook of a day, so a second cook the same day is null.
 */
export function cookMilestone(before: HabitSnapshot, after: HabitSnapshot): CookMilestone | null {
  const challenge = after.challengesDone.find((kind) => !before.challengesDone.includes(kind))
  if (challenge) return { kind: "challenge", challenge }
  const days = streakMilestone(before.streak, after.streak)
  if (days !== null) return { kind: "streak", days }
  const tier = tierFor(after.cooksThisWeek)
  if (tier !== null && tier !== tierFor(before.cooksThisWeek)) return { kind: "tier", tier }
  return null
}
