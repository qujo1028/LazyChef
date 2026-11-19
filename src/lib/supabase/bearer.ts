import "server-only"

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"

import type { AppApiErrorCode, AppApiFailure } from "@lazychef/core/push/app-contract"
import type { Database } from "@/types/database"

import { getSupabaseConfig } from "./config"

// Auth for the routes the Expo app calls (packages/core/src/push/app-contract.ts). The app has no
// cookies, so it sends its Supabase access token as `Authorization: Bearer <token>`. The token is
// checked with Supabase Auth, and the client handed back acts AS that person (publishable key plus
// their token), so RLS applies exactly as it does for the web.
//
// These routes are for the native app only. They send no CORS headers, so a browser page on another
// origin (Expo web included) can't call them; native fetch doesn't need CORS.

/** Request bodies are a few ids; anything bigger is refused before it's read in full. */
export const MAX_BODY_BYTES = 4 * 1024

export type BearerAuth = { user: User; supabase: SupabaseClient<Database> }

const STATUS: Record<Exclude<AppApiErrorCode, "offline">, number> = {
  unauthorized: 401,
  forbidden: 403,
  bad_request: 400,
  not_configured: 503,
  rate_limited: 429,
  failed: 500,
}

/** A JSON failure in the contract's shape. `status` overrides the code's usual one (405, 413, 415). */
export function apiFailure(code: Exclude<AppApiErrorCode, "offline">, error: string, status = STATUS[code]): Response {
  const body: AppApiFailure = { ok: false, code, error }
  return Response.json(body, { status, headers: { "cache-control": "no-store" } })
}

/** A JSON success. */
export function apiOk<T extends { ok: true }>(body: T): Response {
  return Response.json(body, { headers: { "cache-control": "no-store" } })
}

/** For every method but POST. */
export function methodNotAllowed(): Response {
  const response = apiFailure("bad_request", "Use POST.", 405)
  response.headers.set("allow", "POST")
  return response
}

/** The token from `Authorization: Bearer <token>`, or null. Case-insensitive scheme, one token, no spaces. */
export function bearerToken(header: string | null | undefined): string | null {
  const match = /^Bearer[ ]+([^\s]+)[ ]*$/i.exec(header?.trim() ?? "")
  const token = match?.[1]
  // An access token is a JWT, well under this; refuse junk before it goes anywhere.
  return token && token.length <= 8192 ? token : null
}

const UNAUTHORIZED = "Sign in again to do that."

/** A Supabase client that acts as the token's owner. Never persists or refreshes anything. */
export function clientForToken(token: string): SupabaseClient<Database> {
  const { url, publishableKey } = getSupabaseConfig()
  return createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * Verifies the request's bearer token with Supabase Auth. Returns the person and a client acting as
 * them, or a 401 Response. `makeClient` is for tests.
 */
export async function authenticate(
  request: Request,
  makeClient: (token: string) => SupabaseClient<Database> = clientForToken,
): Promise<BearerAuth | Response> {
  const token = bearerToken(request.headers.get("authorization"))
  if (!token) return apiFailure("unauthorized", UNAUTHORIZED)
  const supabase = makeClient(token)
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return apiFailure("unauthorized", UNAUTHORIZED)
    return { user: data.user, supabase }
  } catch {
    // Auth unreachable: not the caller's fault, and not a reason to sign them out.
    return apiFailure("failed", "Something went wrong. Try again in a minute.")
  }
}

/**
 * Reads a JSON body of at most `max` bytes. Returns the parsed value, or a 413/415/400 Response.
 * The size is checked while reading, so a body without (or lying about) Content-Length is still capped.
 */
export async function readJsonBody(request: Request, max = MAX_BODY_BYTES): Promise<{ value: unknown } | Response> {
  const type = request.headers.get("content-type") ?? ""
  if (!/^application\/json\s*(;|$)/i.test(type.trim())) return apiFailure("bad_request", "Send JSON.", 415)

  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > max) return apiFailure("bad_request", "That request is too big.", 413)

  const text = await readLimited(request, max)
  if (text === null) return apiFailure("bad_request", "That request is too big.", 413)
  try {
    return { value: JSON.parse(text) }
  } catch {
    return apiFailure("bad_request", "That request didn't look right.")
  }
}

async function readLimited(request: Request, max: number): Promise<string | null> {
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}
