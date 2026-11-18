import "server-only"

import { NextResponse } from "next/server"

import { runAlerts } from "@/features/admin/alerts"
import { isAuthorized } from "@/features/pro/revenuecat-core"
import { getServerDb } from "@/lib/supabase/service"

// Called once a day by Vercel Cron (see vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET isn't set." }, { status: 503 })
  if (!isAuthorized(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 })
  }

  const db = getServerDb()
  if (!db) return NextResponse.json({ error: "SUPABASE_SECRET_KEY isn't set." }, { status: 503 })

  // Yesterday finalises the previous day; today gives the admin page fresh numbers.
  const now = Date.now()
  const days = [new Date(now - DAY_MS), new Date(now)].map((d) => d.toISOString().slice(0, 10))

  const results: { snapshot: { captured: string[]; failed: string[] } } = {
    snapshot: { captured: [], failed: [] },
  }
  for (const day of days) {
    const { error } = await db.rpc("admin_capture_daily_snapshot", { p_day: day })
    if (error) {
      console.error("[admin] snapshot failed for", day, error.message)
      results.snapshot.failed.push(day)
    } else {
      results.snapshot.captured.push(day)
    }
  }

  // Runs whether or not the snapshot failed, and never throws.
  const alerts = await runAlerts()

  if (results.snapshot.failed.length > 0) {
    return NextResponse.json(
      { ok: false, captured: results.snapshot.captured, failed: results.snapshot.failed, alerts },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, captured: results.snapshot.captured, alerts })
}
