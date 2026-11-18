// Pure: this Monday-week's cook days.
import { addDays, weekStart } from "@/features/activity/stats"

/** The seven days (Monday first) of the week `today` is in. */
export function weekDayKeys(today: string): string[] {
  const start = weekStart(today)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Distinct cook days in the week `today` is in. */
export function cooksThisWeek(days: ReadonlySet<string>, today: string): number {
  let count = 0
  for (const day of weekDayKeys(today)) if (days.has(day)) count += 1
  return count
}

/** The newest cook day, or null. */
export function lastCookDay(days: ReadonlySet<string>): string | null {
  let last: string | null = null
  for (const day of days) if (last === null || day > last) last = day
  return last
}
