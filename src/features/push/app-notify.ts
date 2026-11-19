import "server-only"

import { after } from "next/server"

import { notifyRequestSchema, type NotifyResponse } from "@lazychef/core/push/app-contract"
import { notifyJoined, notifyListAdded } from "@/lib/push/notify"
import { apiFailure, apiOk, authenticate, readJsonBody, type BearerAuth } from "@/lib/supabase/bearer"

// POST /api/push/notify: the Expo app says it just did something housemates may hear about.
// The body carries only an event and a household id. Who did it comes from the token, and what
// they did comes from the database, read as them (RLS), so a caller can't put words in a push.

/** A list line newer than this counts as "just added". */
export const LIST_ADD_WINDOW_MS = 5 * 60 * 1000
/** A membership newer than this counts as "just joined". */
export const JOIN_WINDOW_MS = 10 * 60 * 1000
/** Clock drift allowed between this server and the database. */
const SKEW_MS = 60 * 1000

type Notify = typeof notifyListAdded
type NotifyJoin = typeof notifyJoined

export type NotifyApiDeps = {
  authenticate?: (request: Request) => Promise<BearerAuth | Response>
  notifyListAdded?: Notify
  notifyJoined?: NotifyJoin
  /** Where delivery runs once the response is on its way. Defaults to next/server's `after`. */
  defer?: (task: () => Promise<void>) => void
  now?: () => number
}

const FAILED = "Something went wrong. Try again in a minute."

/**
 * `sent` in the response is true when this request claimed the push slot and delivery was scheduled
 * (it runs after the response). It is false when there was nothing recent to tell, the slot was
 * already used (a second call within five minutes), or push isn't configured on the server.
 */
export async function handleNotify(request: Request, deps: NotifyApiDeps = {}): Promise<Response> {
  const auth = await (deps.authenticate ?? authenticate)(request)
  if (auth instanceof Response) return auth

  const body = await readJsonBody(request)
  if (body instanceof Response) return body
  const parsed = notifyRequestSchema.safeParse(body.value)
  if (!parsed.success) return apiFailure("bad_request", "That request didn't look right.")
  const { event, householdId } = parsed.data
  const { user, supabase } = auth

  const { data: membership, error: memberError } = await supabase
    .from("household_members")
    .select("joined_at")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (memberError) {
    console.error("[push] notify: checking membership failed:", memberError.message)
    return apiFailure("failed", FAILED)
  }
  if (!membership) return apiFailure("forbidden", "You're not in that household.")

  const now = deps.now?.() ?? Date.now()
  const defer = deps.defer ?? after
  const nothing: NotifyResponse = { ok: true, sent: false }

  if (event === "list_added") {
    // added_by is stamped from auth.uid() by a trigger, so it can't be forged by the client.
    const { data: line, error } = await supabase
      .from("shopping_list_items")
      .select("name, created_at")
      .eq("household_id", householdId)
      .eq("added_by", user.id)
      .gte("created_at", new Date(now - LIST_ADD_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error("[push] notify: reading the list failed:", error.message)
      return apiFailure("failed", FAILED)
    }
    if (!line) return apiOk(nothing)
    const sent = await (deps.notifyListAdded ?? notifyListAdded)(householdId, user.id, line.name, { defer })
    return apiOk<NotifyResponse>({ ok: true, sent })
  }

  // joined
  const joinedAt = Date.parse(membership.joined_at)
  const age = now - joinedAt
  if (!Number.isFinite(age) || age > JOIN_WINDOW_MS || age < -SKEW_MS) return apiOk(nothing)
  // The join time picks the dedupe slot, so this and the web's join action share one push.
  const sent = await (deps.notifyJoined ?? notifyJoined)(householdId, user.id, { defer, now: () => joinedAt })
  return apiOk<NotifyResponse>({ ok: true, sent })
}
