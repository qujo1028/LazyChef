// Pure: everything the week card and the cook action need, from one list of cook events.
import { dayKey } from "@/features/activity/time"
import { daysBetween } from "@/features/pantry/dates"

import { activeChallenge, doneChallenges, type ChallengeProgress } from "./challenges"
import { COMEBACK_DAYS } from "./constants"
import { cookDaySet, type CookEvent } from "./cook-days"
import { streakInfo, type StreakInfo } from "./streak"
import { cookMilestone, tierFor, type CookMilestone, type HabitSnapshot, type Tier } from "./tiers"
import { cooksThisWeek, lastCookDay } from "./week"

export type HabitSummary = {
  today: string
  cooksThisWeek: number
  tier: Tier | null
  streak: StreakInfo
  challenge: ChallengeProgress | null
  /** Days since the last cook day, or null when the person has never cooked. */
  daysSinceLastCook: number | null
  /** Quiet for COMEBACK_DAYS or more: show "Welcome back" instead of a broken streak. */
  comeback: boolean
  /** Every cook day (YYYY-MM-DD), for the seven dots. */
  days: ReadonlySet<string>
  snapshot: HabitSnapshot
}

export function summarize(events: readonly CookEvent[], now: number, timeZone?: string): HabitSummary {
  const today = dayKey(now, timeZone)
  const days = cookDaySet(events, timeZone)
  const week = cooksThisWeek(days, today)
  const streak = streakInfo(days, today)
  const last = lastCookDay(days)
  const since = last === null ? null : Math.max(0, daysBetween(last, today))
  return {
    today,
    cooksThisWeek: week,
    tier: tierFor(week),
    streak,
    challenge: activeChallenge(events, days, today, timeZone),
    daysSinceLastCook: since,
    comeback: since !== null && since >= COMEBACK_DAYS,
    days,
    snapshot: { cooksThisWeek: week, streak: streak.count, challengesDone: doneChallenges(events, days, today, timeZone) },
  }
}

/** What the cookRecipe action returns about the habit. */
export type HabitResult = {
  cooksThisWeek: number
  tierBefore: Tier | null
  tierAfter: Tier | null
  streakBefore: number
  streakAfter: number
  milestone: CookMilestone | null
}

export function habitResult(before: HabitSummary, after: HabitSummary): HabitResult {
  return {
    cooksThisWeek: after.cooksThisWeek,
    tierBefore: before.tier,
    tierAfter: after.tier,
    streakBefore: before.streak.count,
    streakAfter: after.streak.count,
    milestone: cookMilestone(before.snapshot, after.snapshot),
  }
}
