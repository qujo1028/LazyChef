import "server-only"

import { getServerDb } from "@/lib/supabase/service"
import { subscriptionFromSubscriber, type SubscriptionRow } from "./revenuecat-core"

const API = "https://api.revenuecat.com/v1"
const TIMEOUT_MS = 10_000

/** A RevenueCat or database problem while syncing. The webhook answers 500 so RevenueCat retries. */
export class ProSyncError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProSyncError"
  }
}

function secretKey() {
  return process.env.REVENUECAT_SECRET_API_KEY?.trim() || null
}

/** Whether the server can sync with RevenueCat (secret API key and Supabase secret key both set). */
export function isProSyncConfigured() {
  return Boolean(secretKey() && getServerDb())
}

/** The customer record (GET /v1/subscribers/{id}). Needs a secret (sk_) API key. */
async function fetchSubscriber(userId: string): Promise<unknown> {
  const key = secretKey()
  if (!key) throw new ProSyncError("REVENUECAT_SECRET_API_KEY isn't set.")
  let response: Response
  try {
    response = await fetch(`${API}/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw new ProSyncError(`Couldn't reach RevenueCat: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) throw new ProSyncError(`RevenueCat answered ${response.status}.`)
  return response.json()
}

/**
 * Fetches one person's current state from RevenueCat and saves it. Returns null (and
 * does nothing) for an id that isn't one of our users.
 */
export async function syncSubscription(userId: string): Promise<SubscriptionRow | null> {
  const db = getServerDb()
  if (!db) throw new ProSyncError("SUPABASE_SECRET_KEY isn't set.")

  const { data: profile, error: profileError } = await db.from("profiles").select("id").eq("id", userId).maybeSingle()
  if (profileError) throw new ProSyncError(profileError.message)
  if (!profile) return null

  const row = subscriptionFromSubscriber(userId, await fetchSubscriber(userId))
  const { error } = await db.from("subscriptions").upsert({ ...row, synced_at: new Date().toISOString() })
  if (error) throw new ProSyncError(error.message)
  return row
}
