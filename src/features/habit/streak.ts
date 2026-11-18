// Pure: the cooking streak with one forgiven missed day per Monday-week, and its milestones.
import { addDays, cookingStreak, weekStart } from "@/features/activity/stats"

import { STREAK_MILESTONES } from "./constants"

export type StreakInfo = {
  /** Cook days in the run (a forgiven day is not counted). */
  count: number
  /** A missed day inside the run was forgiven. */
  forgave: boolean
  /** Not cooked today yet, so cooking today keeps it going. */
  atRisk: boolean
}

/**
 * Days in a row with a cook, ending today (or yesterday while today is still open). A single
 * missed day is forgiven once per Monday-week, when a cook day sits right before it. With no
 * misses this is exactly cookingStreak().
 */
export function streakInfo(days: ReadonlySet<string>, today: string): StreakInfo {
  const strict = cookingStreak(days, today)
  const forgiven = new Set<string>()
  let day = days.has(today) ? today : addDays(today, -1)
  let count = 0
  while (true) {
    if (days.has(day)) count += 1
    else if (!forgiven.has(weekStart(day)) && days.has(addDays(day, -1))) forgiven.add(weekStart(day))
    else break
    day = addDays(day, -1)
  }
  const total = Math.max(count, strict)
  return { count: total, forgave: forgiven.size > 0, atRisk: !days.has(today) && total > 0 }
}

/** The biggest milestone crossed going from `before` to `after` days, or null. */
export function streakMilestone(before: number, after: number): number | null {
  let hit: number | null = null
  for (const m of STREAK_MILESTONES) if (before < m && after >= m) hit = m
  return hit
}
