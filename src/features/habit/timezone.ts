// The viewer's time zone. The server cannot know it, so the browser keeps it in the shared
// TIMEZONE_COOKIE (see TimezoneSync) and the server reads it; until the first visit it falls back to UTC.

export const FALLBACK_TIME_ZONE = "UTC"

/** The zone if it is a real IANA name, else null. */
export function validTimeZone(zone: string | null | undefined): string | null {
  if (!zone || zone.length > 64) return null
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return zone
  } catch {
    return null
  }
}
