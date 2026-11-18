// Pure date helpers. Dates are "YYYY-MM-DD" keys (Postgres `date`), compared as
// calendar days so time zones and DST never shift an expiry by one.

const DAY_MS = 86_400_000

/** Items expiring within this many days (or already expired) are "expiring soon". */
export const EXPIRING_SOON_DAYS = 3

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function toUtc(key: string) {
  const [y, m, d] = key.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Today (or `date`) in the device's time zone, as YYYY-MM-DD. */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

export function addDays(key: string, days: number): string {
  return new Date(toUtc(key) + days * DAY_MS).toISOString().slice(0, 10)
}

export type ExpiryInfo = { days: number; label: string; tone: "expired" | "soon" | "later" }

export function expiryInfo(expiresOn: string | null, today: string): ExpiryInfo | null {
  if (!expiresOn) return null
  const days = daysBetween(today, expiresOn)
  if (days < 0) return { days, label: "Expired", tone: "expired" }
  if (days === 0) return { days, label: "Expires today", tone: "soon" }
  if (days === 1) return { days, label: "Expires tomorrow", tone: "soon" }
  return { days, label: `Expires in ${days}d`, tone: days <= EXPIRING_SOON_DAYS ? "soon" : "later" }
}

/** "just now", "5m ago", "3h ago", "2d ago", "3w ago", "4mo ago", "1y ago". */
export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
