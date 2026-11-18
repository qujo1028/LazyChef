import "server-only"

import { NextResponse } from "next/server"

import { isAuthorized } from "@/features/pro/revenuecat-core"
import { deliverToUsers } from "@/lib/push/deliver"
import {
  DAILY_WINDOW,
  EVENING_WINDOW,
  inWindow,
  localTime,
  planExpiringPushes,
  type ExpiringItem,
} from "@/lib/push/expiring"
import { getSender } from "@/lib/push/index"
import { getPushStore } from "@/lib/push/store"
import { getServerDb } from "@/lib/supabase/service"

// "Expiring soon" pushes. Vercel Cron calls this (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
// Once a day (Hobby plan): anyone whose local time is 08:00 to 22:59 at that moment gets theirs.
// Every hour (Pro plan): change the cron path to /api/push/expiring?mode=hourly and only people whose
// local time is 17:00 to 18:59 get one. Either way, a person gets at most one a local day.
export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000
const CHUNK = 200

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET isn't set." }, { status: 503 })
  if (!isAuthorized(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 })
  }

  const db = getServerDb()
  const store = getPushStore()
  if (!db || !store) return NextResponse.json({ error: "SUPABASE_SECRET_KEY isn't set." }, { status: 503 })

  const window = new URL(request.url).searchParams.get("mode") === "hourly" ? EVENING_WINDOW : DAILY_WINDOW
  const now = new Date()

  try {
    const { data: devices, error: deviceError } = await db
      .from("device_tokens")
      .select("user_id, timezone")
      .order("last_seen_at", { ascending: false })
      .limit(10_000)
    if (deviceError) throw new Error(`loading devices: ${deviceError.message}`)

    const due = devices.filter((d) => inWindow(localTime(now, d.timezone).hour, window))
    const userIds = [...new Set(due.map((d) => d.user_id))]
    if (userIds.length === 0) return NextResponse.json({ ok: true, due: 0, planned: 0, sent: 0 })

    // Households of the people who are due, then their pantries. Local dates are within a day of UTC's.
    const householdsByUser = new Map<string, string[]>()
    for (const ids of chunks(userIds, CHUNK)) {
      const { data, error } = await db.from("household_members").select("user_id, household_id").in("user_id", ids)
      if (error) throw new Error(`loading households: ${error.message}`)
      for (const row of data) householdsByUser.set(row.user_id, [...(householdsByUser.get(row.user_id) ?? []), row.household_id])
    }
    const householdIds = [...new Set([...householdsByUser.values()].flat())]
    const itemsByHousehold = new Map<string, ExpiringItem[]>()
    const from = dayKey(now.getTime() - DAY_MS)
    const to = dayKey(now.getTime() + 4 * DAY_MS)
    for (const ids of chunks(householdIds, CHUNK)) {
      const { data, error } = await db
        .from("pantry_items")
        .select("household_id, name, expires_on, quantity, is_staple")
        .in("household_id", ids)
        .gte("expires_on", from)
        .lte("expires_on", to)
      if (error) throw new Error(`loading pantry: ${error.message}`)
      for (const row of data) {
        itemsByHousehold.set(row.household_id, [...(itemsByHousehold.get(row.household_id) ?? []), row])
      }
    }
    const itemsByUser = new Map<string, ExpiringItem[]>()
    for (const [userId, households] of householdsByUser) {
      itemsByUser.set(userId, households.flatMap((id) => itemsByHousehold.get(id) ?? []))
    }

    const plan = planExpiringPushes(
      due.map((d) => ({ userId: d.user_id, timezone: d.timezone })),
      itemsByUser,
      now,
      window,
    )
    const byUser = new Map(plan.map((p) => [p.userId, p]))
    const summary =
      plan.length === 0
        ? { sent: 0, failed: 0, skipped: 0, removedTokens: 0 }
        : await deliverToUsers(plan.map((p) => p.userId), plan[0].message, {
            sender: getSender(),
            store,
            messageFor: (userId) => byUser.get(userId)!.message,
            dedupeKey: (userId) => byUser.get(userId)!.dedupeKey,
          })
    return NextResponse.json({ ok: true, due: userIds.length, planned: plan.length, ...summary })
  } catch (error) {
    console.error("[push] expiring run failed:", error instanceof Error ? error.message : "unknown error")
    return NextResponse.json({ ok: false, error: "The run failed." }, { status: 500 })
  }
}
