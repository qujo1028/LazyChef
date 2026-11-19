// The Home tab's expiring-soon line. Pure: pass the pantry and today's date key.
import { daysBetween } from "../dates/days"

/** Items expiring within this many days (today included) count. */
export const EXPIRING_WINDOW_DAYS = 7

export type ExpiringInput = { name: string; expires_on: string | null; quantity: number | null; is_staple?: boolean }

export type ExpiringSummary = { count: number; text: string }

/**
 * Items that expire in the next 7 days, today included. Items that already expired still count
 * (they still need using up), but items that ran out (quantity 0) and staples do not, matching the
 * Pantry's "expiring" section. Returns null when nothing qualifies.
 *
 * Copy: "Milk expires today", "Milk expires tomorrow", "Milk expires in 3 days", "Milk is past its date";
 * with several items, "2 things expire this week" (or "2 things need using up" when some are past their date).
 */
export function expiringSoon(items: Iterable<ExpiringInput>, today: string): ExpiringSummary | null {
  const hits: { name: string; days: number }[] = []
  for (const item of items) {
    if (item.expires_on === null || item.quantity === 0 || item.is_staple) continue
    const days = daysBetween(today, item.expires_on)
    if (days <= EXPIRING_WINDOW_DAYS) hits.push({ name: item.name.trim() || "Something", days })
  }
  if (hits.length === 0) return null

  if (hits.length === 1) {
    const { name, days } = hits[0]
    if (days < 0) return { count: 1, text: `${name} is past its date` }
    if (days === 0) return { count: 1, text: `${name} expires today` }
    if (days === 1) return { count: 1, text: `${name} expires tomorrow` }
    return { count: 1, text: `${name} expires in ${days} days` }
  }
  const pastDate = hits.some((hit) => hit.days < 0)
  return {
    count: hits.length,
    text: pastDate ? `${hits.length} things need using up` : `${hits.length} things expire this week`,
  }
}
