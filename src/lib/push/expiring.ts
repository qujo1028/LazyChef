// Pure: who gets the "expiring soon" push, and what it says. No database, no clock of its own.
import { expiryInfo } from "@/features/pantry/dates"

import type { PushMessage } from "./types"

/** Looks this many days ahead (today, tomorrow, the day after). */
export const LOOKAHEAD_DAYS = 2

/** Local hours (start inclusive, end exclusive) when a push may go out. */
export type SendWindow = { startHour: number; endHour: number }

/** One run a day (Vercel Hobby): any waking hour. */
export const DAILY_WINDOW: SendWindow = { startHour: 8, endHour: 23 }
/** A run every hour (Vercel Pro): early evening, when people plan dinner and shop. */
export const EVENING_WINDOW: SendWindow = { startHour: 17, endHour: 19 }

export type ExpiringItem = { name: string; expires_on: string | null; quantity: number | null; is_staple: boolean }

/** A person's local date ("YYYY-MM-DD") and hour (0 to 23) at `now`. Bad zone names fall back to UTC. */
export function localTime(now: Date, timeZone: string): { date: string; hour: number } {
  const read = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 }
  }
  try {
    return read(timeZone)
  } catch {
    return read("UTC")
  }
}

export function inWindow(hour: number, window: SendWindow): boolean {
  return hour >= window.startHour && hour < window.endHour
}

/** Items that expire today, tomorrow or the day after, soonest first. Ran out and staples don't count. */
export function selectExpiring<T extends ExpiringItem>(items: T[], today: string): (T & { days: number })[] {
  const picked: (T & { days: number })[] = []
  for (const item of items) {
    if (item.is_staple || item.quantity === 0) continue
    const info = expiryInfo(item.expires_on, today)
    if (info && info.days >= 0 && info.days <= LOOKAHEAD_DAYS) picked.push({ ...item, days: info.days })
  }
  return picked.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
}

const WHEN = ["today", "tomorrow", "in 2 days"]

/** null when nothing is expiring. */
export function expiringMessage(items: { name: string; days: number }[]): PushMessage | null {
  if (items.length === 0) return null
  const body =
    items.length === 1
      ? `${items[0].name} expires ${WHEN[items[0].days] ?? `in ${items[0].days} days`}`
      : `${items.length} things in your pantry expire soon`
  return { title: "Expiring soon", body, url: "/pantry", kind: "expiring" }
}

export type ExpiringDevice = { userId: string; timezone: string }

export type ExpiringPush = { userId: string; dedupeKey: string; message: PushMessage }

/**
 * One push per person who has a device, whose local time is inside the window and who has
 * something expiring in any of their households. `itemsByUser` holds each person's pantry items
 * (all their households). A person with several phones uses the first one's time zone.
 */
export function planExpiringPushes(
  devices: ExpiringDevice[],
  itemsByUser: Map<string, ExpiringItem[]>,
  now: Date,
  window: SendWindow,
): ExpiringPush[] {
  const seen = new Set<string>()
  const plan: ExpiringPush[] = []
  for (const { userId, timezone } of devices) {
    if (seen.has(userId)) continue
    seen.add(userId)
    const { date, hour } = localTime(now, timezone)
    if (!inWindow(hour, window)) continue
    const message = expiringMessage(selectExpiring(itemsByUser.get(userId) ?? [], date))
    if (message) plan.push({ userId, dedupeKey: `expiring:${date}`, message })
  }
  return plan
}
