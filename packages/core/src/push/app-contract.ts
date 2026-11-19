// The contract between the Expo app and the Vercel routes it calls for server-only work (P6):
// account deletion and the pushes a phone action should trigger. The app sends its Supabase
// access token as `Authorization: Bearer <token>`; the route verifies it and acts as that person.
// Pure: shared by src/app/api/** (web server) and apps/mobile.
import { z } from "zod"

import type { NotificationPrefs } from "./prefs"

/** Same values as src/lib/push/types.ts PushKind: one per notification setting. */
export type PushKind = keyof NotificationPrefs

/** Route paths on the web origin (EXPO_PUBLIC_API_URL in the app). */
export const APP_API = {
  deleteAccount: "/api/account/delete",
  notify: "/api/push/notify",
} as const

/**
 * Something a phone did that housemates may hear about. The server never trusts names from the
 * body: it reads the item and the person from the database, so the request carries only ids.
 * - list_added: the caller just added to the shopping list (the server names the newest line
 *   the caller added in the last few minutes; nothing recent means no push).
 * - joined: the caller just joined this household (the server checks the membership is new).
 */
export const notifyRequestSchema = z.discriminatedUnion("event", [
  z.strictObject({ event: z.literal("list_added"), householdId: z.uuid() }),
  z.strictObject({ event: z.literal("joined"), householdId: z.uuid() }),
])
export type NotifyRequest = z.infer<typeof notifyRequestSchema>

/** `sent` is false when nothing went out (deduped, nobody to tell, push not configured). */
export type NotifyResponse = { ok: true; sent: boolean }

/**
 * After a delete, `appleNotRevoked` tells the app to show Apple's "remove LazyChef from your
 * Apple ID" note (TN3194), like the web's /login?deleted=apple.
 */
export type DeleteAccountResponse = { ok: true; appleNotRevoked: boolean }

export type AppApiErrorCode =
  | "unauthorized" // missing, expired or bad token
  | "forbidden" // not a member of that household
  | "bad_request"
  | "not_configured" // the server lacks a key (secret key, push credentials)
  | "rate_limited"
  | "failed"
  | "offline" // app side only: no connection, or the server couldn't be reached

export type AppApiFailure = { ok: false; error: string; code: AppApiErrorCode }

/** Expo push service tokens. Anything else in device_tokens is a raw APNs/FCM token. */
export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token.trim())
}

/** The `data` every push carries, so a tap can open the right screen. */
export type PushData = { url: string; kind: PushKind }

/**
 * Where a tapped push may go. Web and app share these paths (Expo Router drops the (tabs) group).
 * Anything else, including other origins, opens the Pantry.
 */
export const PUSH_TAP_ROUTES = ["/pantry", "/list", "/household", "/recipes", "/activity", "/account"] as const
export type PushTapRoute = (typeof PUSH_TAP_ROUTES)[number]

export function pushTapRoute(url: unknown): PushTapRoute {
  if (typeof url !== "string") return "/pantry"
  const path = url.split(/[?#]/)[0]
  return (PUSH_TAP_ROUTES as readonly string[]).includes(path) ? (path as PushTapRoute) : "/pantry"
}
