import { isAuthorized, parseWebhook } from "@/features/pro/revenuecat-core"
import { isProSyncConfigured, syncSubscription } from "@/features/pro/sync"
import { getServerDb } from "@/lib/supabase/service"
import type { Json } from "@/types/database"

// RevenueCat → POST here on every subscription change. Set the same Authorization value in
// RevenueCat (Integrations → Webhooks) and REVENUECAT_WEBHOOK_AUTH. Anything but a 200 makes
// RevenueCat retry (5 times over about 80 minutes), so problems on our side answer 500.

export async function POST(request: Request) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH?.trim()
  if (!expected || !isProSyncConfigured()) {
    console.error("RevenueCat webhook: REVENUECAT_WEBHOOK_AUTH, REVENUECAT_SECRET_API_KEY or SUPABASE_SECRET_KEY isn't set.")
    return Response.json({ error: "Not set up." }, { status: 503 })
  }
  if (!isAuthorized(request.headers.get("authorization"), expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 })
  }
  const event = parseWebhook(body)
  if (!event) return Response.json({ error: "Not a RevenueCat event." }, { status: 400 })

  // Keep every event once (retries reuse the id). A repeat still syncs below: the earlier
  // attempt may have failed partway, and syncing twice is harmless.
  const db = getServerDb()!
  const { error: logError } = await db.from("revenuecat_events").upsert(
    {
      id: event.id,
      type: event.type,
      app_user_id: event.appUserId,
      environment: event.environment,
      event_at: event.eventAt,
      payload: event.raw as Json,
    },
    { onConflict: "id", ignoreDuplicates: true },
  )
  if (logError) {
    console.error("RevenueCat webhook: saving the event failed:", logError.message)
    return Response.json({ error: "Couldn't save the event." }, { status: 500 })
  }

  // The dashboard's "Send test event" uses a made-up customer.
  if (event.type === "TEST") return Response.json({ ok: true, test: true })

  try {
    const synced = []
    for (const userId of event.userIds) {
      if (await syncSubscription(userId)) synced.push(userId)
    }
    return Response.json({ ok: true, synced: synced.length })
  } catch (error) {
    console.error("RevenueCat webhook: sync failed:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Sync failed." }, { status: 500 })
  }
}
