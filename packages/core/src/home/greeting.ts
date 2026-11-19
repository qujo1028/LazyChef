// The Home tab's greeting. Pure: pass `now` and the viewer's time zone.

function hourIn(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).formatToParts(now)
  const hour = Number(parts.find((part) => part.type === "hour")?.value)
  return Number.isFinite(hour) ? hour % 24 : now.getUTCHours()
}

/** "Good morning" (5 to 11), "Good afternoon" (12 to 16), else "Good evening". */
export function greetingWord(now: Date, timeZone: string): string {
  const hour = hourIn(now, timeZone)
  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 17) return "Good afternoon"
  return "Good evening"
}

/** "Good morning, Sam": the first word of the display name, or no name at all. */
export function greeting(now: Date, timeZone: string, displayName: string | null): string {
  const word = greetingWord(now, timeZone)
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? `${word}, ${first}` : word
}
