import "server-only"

import { isLlmConfigured } from "@/lib/llm/client"
import { DAILY_POINTS, utcDay } from "@/lib/spoonacular/cost"
import { getServerDb } from "@/lib/supabase/service"
import type { HealthState } from "@/features/admin/components/status-dot"

// Health checks for the admin Health tab. Each check reports its own state and never throws.
// Spoonacular is read from our usage table only; we never call its API, because every call
// costs points from the daily allowance.

export type ServiceCheck = { name: string; state: HealthState; detail: string; latencyMs: number | null }

export type ServiceResult = { state: HealthState; detail: string }

const SUPABASE_SLOW_MS = 1500
const GROQ_TIMEOUT_MS = 5000
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"
const SPOONACULAR_LOW_POINTS = 10
const REVENUECAT_STALE_MS = 14 * 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** How long ago an ISO time was, short: "just now", "5 min", "3 h", "2 d". */
export function ago(iso: string, now: Date): string {
  const diff = now.getTime() - Date.parse(iso)
  if (!Number.isFinite(diff) || diff < MINUTE_MS) return "just now"
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} min`
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)} h`
  return `${Math.floor(diff / DAY_MS)} d`
}

/** `ago` as a phrase: "5 min ago", or "just now". */
export function agoPhrase(iso: string, now: Date): string {
  const age = ago(iso, now)
  return age === "just now" ? age : `${age} ago`
}

export type SpoonacularUsageRow = {
  points_used: number
  points_left: number | null
  exhausted_at: string | null
} | null

/** Spoonacular's state from today's usage row (null when no call has been made today). */
export function spoonacularState(row: SpoonacularUsageRow, hasKey: boolean): ServiceResult {
  if (!hasKey) return { state: "off", detail: "SPOONACULAR_API_KEY isn't set" }
  if (row?.exhausted_at) return { state: "down", detail: "Out of points today" }
  if (!row) return { state: "ok", detail: "No calls yet today" }

  const detail = `${row.points_used} of ${DAILY_POINTS} points used`
  if (row.points_left != null && row.points_left < SPOONACULAR_LOW_POINTS) {
    return { state: "warn", detail: `${detail}, ${row.points_left} left` }
  }
  return { state: "ok", detail }
}

/** RevenueCat's state from the newest webhook we received. */
export function revenuecatState(lastReceivedAt: string | null, configured: boolean, now: Date): ServiceResult {
  if (!configured) return { state: "off", detail: "REVENUECAT_SECRET_API_KEY and REVENUECAT_WEBHOOK_AUTH aren't both set" }
  if (!lastReceivedAt) return { state: "warn", detail: "No webhooks received yet" }

  const age = now.getTime() - Date.parse(lastReceivedAt)
  const detail = `Last webhook ${agoPhrase(lastReceivedAt, now)}`
  if (age > REVENUECAT_STALE_MS) return { state: "warn", detail }
  return { state: "ok", detail }
}

function off(name: string, detail: string): ServiceCheck {
  return { name, state: "off", detail, latencyMs: null }
}

function down(name: string, detail: string, latencyMs: number | null = null): ServiceCheck {
  return { name, state: "down", detail, latencyMs }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error"
}

async function checkSupabase(): Promise<ServiceCheck> {
  const name = "Supabase"
  const started = performance.now()
  try {
    const db = getServerDb()
    if (!db) return off(name, "SUPABASE_SECRET_KEY isn't set")
    const { count, error } = await db.from("profiles").select("id", { count: "exact", head: true })
    const latencyMs = Math.round(performance.now() - started)
    if (error) return down(name, error.message, latencyMs)
    if (latencyMs > SUPABASE_SLOW_MS) return { name, state: "warn", detail: "Slow to answer", latencyMs }
    return { name, state: "ok", detail: `${(count ?? 0).toLocaleString("en-US")} users`, latencyMs }
  } catch (error) {
    return down(name, errorText(error))
  }
}

async function checkGroq(): Promise<ServiceCheck> {
  const name = "Groq (AI recipes)"
  if (!isLlmConfigured()) return off(name, "GROQ_API_KEY isn't set")
  const key = process.env.GROQ_API_KEY?.trim() ?? ""
  const started = performance.now()
  try {
    const response = await fetch(GROQ_MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
      next: { revalidate: 300 },
    })
    const latencyMs = Math.round(performance.now() - started)
    if (response.status === 200) return { name, state: "ok", detail: "Reachable", latencyMs }
    if (response.status === 401 || response.status === 403) return down(name, "Key rejected", latencyMs)
    return down(name, `Unexpected answer (HTTP ${response.status})`, latencyMs)
  } catch {
    return down(name, "Couldn't reach Groq")
  }
}

async function checkSpoonacular(): Promise<ServiceCheck> {
  const name = "Spoonacular (recipe search)"
  const hasKey = Boolean(process.env.SPOONACULAR_API_KEY?.trim())
  if (!hasKey) return { name, ...spoonacularState(null, false), latencyMs: null }

  const started = performance.now()
  try {
    const db = getServerDb()
    if (!db) return off(name, "SUPABASE_SECRET_KEY isn't set")
    const { data, error } = await db
      .from("spoonacular_usage")
      .select("points_used, points_left, exhausted_at")
      .eq("day", utcDay())
      .maybeSingle()
    const latencyMs = Math.round(performance.now() - started)
    if (error) return down(name, error.message, latencyMs)
    return { name, ...spoonacularState(data, true), latencyMs }
  } catch (error) {
    return down(name, errorText(error))
  }
}

async function checkRevenueCat(): Promise<ServiceCheck> {
  const name = "RevenueCat (subscriptions)"
  const configured = Boolean(process.env.REVENUECAT_SECRET_API_KEY?.trim() && process.env.REVENUECAT_WEBHOOK_AUTH?.trim())
  if (!configured) return { name, ...revenuecatState(null, false, new Date()), latencyMs: null }

  try {
    const db = getServerDb()
    if (!db) return off(name, "SUPABASE_SECRET_KEY isn't set")
    const { data, error } = await db
      .from("revenuecat_events")
      .select("received_at")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return down(name, error.message)
    return { name, ...revenuecatState(data?.received_at ?? null, true, new Date()), latencyMs: null }
  } catch (error) {
    return down(name, errorText(error))
  }
}

/** Supabase, Groq, Spoonacular and RevenueCat, checked in parallel. */
export async function checkServices(): Promise<ServiceCheck[]> {
  return Promise.all([checkSupabase(), checkGroq(), checkSpoonacular(), checkRevenueCat()])
}

const ENV_VARS: readonly { name: string; required: boolean }[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", required: true },
  { name: "SUPABASE_SECRET_KEY", required: true },
  { name: "ADMIN_EMAILS", required: false },
  { name: "GITHUB_DASHBOARD_TOKEN", required: false },
  { name: "GITHUB_REPO", required: false },
  { name: "CRON_SECRET", required: false },
  { name: "GROQ_API_KEY", required: false },
  { name: "SPOONACULAR_API_KEY", required: false },
  { name: "REVENUECAT_SECRET_API_KEY", required: false },
  { name: "REVENUECAT_WEBHOOK_AUTH", required: false },
  { name: "NEXT_PUBLIC_REVENUECAT_IOS_KEY", required: false },
  { name: "NEXT_PUBLIC_REVENUECAT_ANDROID_KEY", required: false },
  { name: "NEXT_PUBLIC_SITE_URL", required: false },
  { name: "NEXT_PUBLIC_SUPPORT_EMAIL", required: false },
]

/** Which expected env vars are set. Names and booleans only; values never leave this function. */
export function envChecklist(env: Record<string, string | undefined> = process.env): { name: string; set: boolean; required: boolean }[] {
  return ENV_VARS.map(({ name, required }) => ({ name, set: Boolean(env[name]?.trim()), required }))
}
