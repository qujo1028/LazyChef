// Day headers and short times for the feed. Pure: pass `now` and the time zone
// (undefined = the runtime's own, i.e. the viewer's once in the browser).

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  const cacheKey = `${timeZone ?? ""}|${JSON.stringify(options)}`
  let format = formatters.get(cacheKey)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { ...options, timeZone })
    formatters.set(cacheKey, format)
  }
  return format
}

/** "2026-09-28" for the calendar day `ms` falls on in `timeZone`. */
export function dayKey(ms: number, timeZone?: string): string {
  const parts = formatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

function previousDayKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
}

/** "Today", "Yesterday", "Mon, Sep 28" (with the year when it isn't this year). */
export function dayLabel(ms: number, now: number, timeZone?: string): string {
  const key = dayKey(ms, timeZone)
  const today = dayKey(now, timeZone)
  if (key >= today) return "Today"
  if (key === previousDayKey(today)) return "Yesterday"
  const sameYear = key.slice(0, 4) === today.slice(0, 4)
  return formatter(timeZone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(ms)
}

/** "just now", "5m ago", "3h ago" within a day; the clock time ("9:15 PM") before that. */
export function shortTime(ms: number, now: number, timeZone?: string): string {
  const elapsed = now - ms
  if (elapsed < MINUTE) return "just now"
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  return formatter(timeZone, { hour: "numeric", minute: "2-digit" }).format(ms)
}

/** Splits newest-first items into day sections, keeping their order. */
export function groupByDay<T>(
  items: T[],
  timeOf: (item: T) => number,
  now: number,
  timeZone?: string,
): { key: string; label: string; items: T[] }[] {
  const days: { key: string; label: string; items: T[] }[] = []
  for (const item of items) {
    const ms = timeOf(item)
    const key = dayKey(ms, timeZone)
    const current = days.at(-1)
    if (current?.key === key) current.items.push(item)
    else days.push({ key, label: dayLabel(ms, now, timeZone), items: [item] })
  }
  return days
}
