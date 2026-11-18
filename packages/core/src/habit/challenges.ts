// Pure: challenge progress, DERIVED from cook history (nothing is persisted yet). A challenge
// counts for the current Monday-week; the active one is the first not yet finished this week.
import { addDays, weekStart } from "../activity/stats"
import { dayKey } from "../dates/time"

import type { CookEvent } from "./cook-events"
import { weekDayKeys } from "./week"

export type ChallengeKind = "streak3" | "try_new"

export const CHALLENGE_ORDER: readonly ChallengeKind[] = ["streak3", "try_new"]

export type ChallengeProgress = {
  kind: ChallengeKind
  title: string
  progress: number
  target: number
  done: boolean
  /** "2 of 3 nights" */
  label: string
}

const TITLES: Record<ChallengeKind, string> = { streak3: "Cook 3 days in a row", try_new: "Try something new" }

/** The longest run of consecutive cook days inside the week so far, and the run still open. */
function weekRuns(days: ReadonlySet<string>, today: string): { best: number; open: number } {
  let best = 0
  let run = 0
  for (const day of weekDayKeys(today)) {
    if (day > today) break
    run = days.has(day) ? run + 1 : 0
    best = Math.max(best, run)
  }
  // The open run ends today, or yesterday while today is undecided; it never reaches back past Monday.
  const start = weekStart(today)
  let day = days.has(today) ? today : addDays(today, -1)
  let open = 0
  while (day >= start && days.has(day)) {
    open += 1
    day = addDays(day, -1)
  }
  return { best, open }
}

/** The first cook ever of each recipe, with the day it fell on. */
function firstCooks(events: readonly CookEvent[], timeZone?: string) {
  const sorted = events
    .filter((event) => event.recipeKey !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.batchId - b.batchId)
  const seen = new Set<string>()
  const firsts: { event: CookEvent; day: string }[] = []
  for (const event of sorted) {
    const key = event.recipeKey as string
    if (seen.has(key)) continue
    seen.add(key)
    firsts.push({ event, day: dayKey(Date.parse(event.at), timeZone) })
  }
  return firsts
}

export function challengeProgress(
  kind: ChallengeKind,
  events: readonly CookEvent[],
  days: ReadonlySet<string>,
  today: string,
  timeZone?: string,
): ChallengeProgress {
  if (kind === "streak3") {
    const { best, open } = weekRuns(days, today)
    const done = best >= 3
    const progress = done ? 3 : open
    return { kind, title: TITLES[kind], progress, target: 3, done, label: `${progress} of 3 nights` }
  }
  const week = new Set(weekDayKeys(today))
  const done = firstCooks(events, timeZone).some(({ day }) => week.has(day))
  return {
    kind,
    title: TITLES[kind],
    progress: done ? 1 : 0,
    target: 1,
    done,
    label: done ? "Tried something new" : "0 of 1 new recipe",
  }
}

/** Every challenge finished this week. */
export function doneChallenges(
  events: readonly CookEvent[],
  days: ReadonlySet<string>,
  today: string,
  timeZone?: string,
): ChallengeKind[] {
  return CHALLENGE_ORDER.filter((kind) => challengeProgress(kind, events, days, today, timeZone).done)
}

/** The first challenge not finished this week, or null when all are. */
export function activeChallenge(
  events: readonly CookEvent[],
  days: ReadonlySet<string>,
  today: string,
  timeZone?: string,
): ChallengeProgress | null {
  for (const kind of CHALLENGE_ORDER) {
    const progress = challengeProgress(kind, events, days, today, timeZone)
    if (!progress.done) return progress
  }
  return null
}
