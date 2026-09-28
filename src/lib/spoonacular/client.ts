import "server-only"

// Low-level Spoonacular access: the key, timeouts, quota headers and friendly errors.
//
// Free plan limits: 50 points a day (reset at midnight UTC), 60 requests a minute,
// 2 requests at a time. Terms: responses may be cached for at most 1 hour; only
// recipe id/title/image may be stored permanently.

export const SPOONACULAR_BASE_URL = "https://api.spoonacular.com"

const TIMEOUT_MS = 10_000
const MAX_CONCURRENT = 2
const MAX_PER_MINUTE = 60

/** From the X-API-Quota-* response headers. Points can be fractional. */
export type SpoonacularQuota = {
  /** What this request cost (X-API-Quota-Request). */
  request: number | null
  /** Used today, including this request (X-API-Quota-Used). */
  used: number | null
  /** Left today (X-API-Quota-Left). */
  left: number | null
}

export type SpoonacularErrorCode =
  | "no_key" // SPOONACULAR_API_KEY isn't set
  | "bad_key" // 401
  | "quota" // 402: the day's points are used up
  | "rate_limit" // 429, or our own per-minute guard
  | "timeout"
  | "network"
  | "http" // any other non-2xx status
  | "bad_response" // not the JSON we expected

const MESSAGES: Record<SpoonacularErrorCode, string> = {
  no_key: "Spoonacular isn't set up yet.",
  bad_key: "Spoonacular didn't accept the API key.",
  quota: "Spoonacular's daily limit is used up. It resets at midnight UTC.",
  rate_limit: "Spoonacular is busy right now. Try again in a minute.",
  timeout: "Spoonacular took too long to answer.",
  network: "Couldn't reach Spoonacular.",
  http: "Spoonacular had a problem.",
  bad_response: "Spoonacular sent an unexpected answer.",
}

/** A failed Spoonacular call. `message` is short and safe to show to users. */
export class SpoonacularError extends Error {
  readonly code: SpoonacularErrorCode
  /** HTTP status, when the API answered. */
  readonly status: number | null
  readonly quota: SpoonacularQuota | null

  constructor(
    code: SpoonacularErrorCode,
    options: { status?: number | null; quota?: SpoonacularQuota | null; cause?: unknown } = {},
  ) {
    super(MESSAGES[code], { cause: options.cause })
    this.name = "SpoonacularError"
    this.code = code
    this.status = options.status ?? null
    this.quota = options.quota ?? null
  }
}

function apiKey(): string | null {
  return process.env.SPOONACULAR_API_KEY?.trim() || null
}

/** Whether SPOONACULAR_API_KEY is set. Check before offering Spoonacular-backed features. */
export function isSpoonacularConfigured(): boolean {
  return apiKey() !== null
}

function readNumber(headers: Headers, name: string): number | null {
  const value = headers.get(name)
  if (value === null || value.trim() === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function readQuota(headers: Headers): SpoonacularQuota {
  return {
    request: readNumber(headers, "X-API-Quota-Request"),
    used: readNumber(headers, "X-API-Quota-Used"),
    left: readNumber(headers, "X-API-Quota-Left"),
  }
}

// ── Guards (per server instance) ───────────────────────────────────────────────
// Spoonacular's limits are per account; these only stop one instance from making
// calls that are sure to fail (and from spending requests while blocked).

/** Set after a 402 (until midnight UTC) or 429 (for Retry-After seconds). */
let blocked: { code: "quota" | "rate_limit"; until: number } | null = null
const recentStarts: number[] = []
let active = 0
const waiting: (() => void)[] = []

function nextUtcMidnight(now: number): number {
  const date = new Date(now)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
}

async function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return
  }
  // release() hands its slot straight to us, so `active` stays the same.
  await new Promise<void>((resolve) => waiting.push(resolve))
}

function releaseSlot() {
  const next = waiting.shift()
  if (next) next()
  else active--
}

function checkGuards(now: number) {
  if (blocked && blocked.until > now) throw new SpoonacularError(blocked.code)
  blocked = null
  while (recentStarts.length > 0 && recentStarts[0] <= now - 60_000) recentStarts.shift()
  if (recentStarts.length >= MAX_PER_MINUTE) throw new SpoonacularError("rate_limit")
  recentStarts.push(now)
}

function errorForStatus(status: number): SpoonacularErrorCode {
  if (status === 401 || status === 403) return "bad_key"
  if (status === 402) return "quota"
  if (status === 429) return "rate_limit"
  return "http"
}

export type SpoonacularRequest = {
  method?: "GET" | "POST"
  /** Query parameters. Never put the key here; it goes in a header. */
  query?: Record<string, string | number | boolean>
  /** Sent as application/x-www-form-urlencoded. */
  form?: Record<string, string | number | boolean>
}

/**
 * Calls a Spoonacular endpoint and returns its JSON plus the quota headers.
 * Throws SpoonacularError for every failure (including a missing key, which
 * never reaches the network). The key is sent as the x-api-key header only.
 */
export async function spoonacularFetch<T = unknown>(
  path: string,
  { method = "GET", query, form }: SpoonacularRequest = {},
): Promise<{ data: T; quota: SpoonacularQuota }> {
  const key = apiKey()
  if (!key) throw new SpoonacularError("no_key")

  const url = new URL(path, SPOONACULAR_BASE_URL)
  for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, String(value))

  const headers: Record<string, string> = { "x-api-key": key, Accept: "application/json" }
  let body: string | undefined
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    body = new URLSearchParams(Object.entries(form).map(([name, value]) => [name, String(value)])).toString()
  }

  checkGuards(Date.now())
  await acquireSlot()
  try {
    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Our own short-lived cache decides what's reused (the terms allow ≤ 1 hour).
        cache: "no-store",
      })
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : ""
      throw new SpoonacularError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network", { cause })
    }

    const quota = readQuota(response.headers)
    if (!response.ok) {
      const code = errorForStatus(response.status)
      if (code === "quota") {
        blocked = { code, until: nextUtcMidnight(Date.now()) }
      } else if (code === "rate_limit") {
        const retryAfter = Number(response.headers.get("Retry-After"))
        const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) : 10
        blocked = { code, until: Date.now() + seconds * 1000 }
      }
      // Drain the body so the connection can be reused; its text isn't needed.
      await response.body?.cancel().catch(() => {})
      throw new SpoonacularError(code, { status: response.status, quota })
    }

    let data: T
    try {
      data = (await response.json()) as T
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : ""
      if (name === "TimeoutError" || name === "AbortError") throw new SpoonacularError("timeout", { cause, quota })
      throw new SpoonacularError("bad_response", { status: response.status, quota, cause })
    }
    return { data, quota }
  } finally {
    releaseSlot()
  }
}
