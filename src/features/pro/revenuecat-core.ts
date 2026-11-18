// RevenueCat data → our subscriptions table. Pure, so it's unit-tested without the network.
//
// The webhook only says "something changed for these people". We then fetch each person's
// current customer record (GET /v1/subscribers/{id}) and save that, as RevenueCat recommends,
// so duplicate or out-of-order events can't leave a stale row.

import { timingSafeEqual } from "node:crypto"

import { z } from "zod"

import type { Database } from "@/types/database"
import { PRO_ENTITLEMENT_ID } from "@lazychef/core/pro/entitlement"

export type SubscriptionRow = Omit<Database["public"]["Tables"]["subscriptions"]["Insert"], "synced_at">

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The app logs in to RevenueCat with the Supabase user id, so only uuids are our users. */
export function isUserId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

// ── Webhook ────────────────────────────────────────────────────────────────────

const idList = z.array(z.unknown()).nullish()

const webhookSchema = z.object({
  event: z.looseObject({
    id: z.string().min(1).max(200),
    type: z.string().min(1).max(60),
    event_timestamp_ms: z.number().nullish(),
    app_user_id: z.string().nullish(),
    original_app_user_id: z.string().nullish(),
    aliases: idList,
    transferred_from: idList,
    transferred_to: idList,
    environment: z.string().nullish(),
  }),
})

export type WebhookEvent = {
  id: string
  type: string
  appUserId: string | null
  environment: string | null
  eventAt: string | null
  /** Our users this event is about (uuids only, de-duplicated). */
  userIds: string[]
  /** The event object, to keep in the log. */
  raw: Record<string, unknown>
}

/** Null when the body isn't a RevenueCat webhook. */
export function parseWebhook(body: unknown): WebhookEvent | null {
  const parsed = webhookSchema.safeParse(body)
  if (!parsed.success) return null
  const e = parsed.data.event
  // TRANSFER has no app_user_id: the purchase moved from transferred_from to transferred_to,
  // so both sides change. Other events can name the same person under several ids.
  const candidates = [
    e.app_user_id,
    e.original_app_user_id,
    ...(e.aliases ?? []),
    ...(e.transferred_from ?? []),
    ...(e.transferred_to ?? []),
  ]
  const userIds = [...new Set(candidates.filter(isUserId).map((id) => id.toLowerCase()))]
  return {
    id: e.id,
    type: e.type,
    appUserId: e.app_user_id ?? null,
    environment: e.environment ?? null,
    eventAt: typeof e.event_timestamp_ms === "number" ? new Date(e.event_timestamp_ms).toISOString() : null,
    userIds,
    raw: e,
  }
}

/** RevenueCat sends the Authorization value set in its dashboard; compare in constant time. */
export function isAuthorized(header: string | null, expected: string): boolean {
  if (!header || !expected) return false
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ── Customer record → row ───────────────────────────────────────────────────────

const date = z.string().nullish()

const subscriberSchema = z.object({
  subscriber: z.looseObject({
    management_url: z.string().nullish(),
    entitlements: z
      .record(
        z.string(),
        z.looseObject({
          expires_date: date,
          grace_period_expires_date: date,
          product_identifier: z.string().nullish(),
        }),
      )
      .nullish(),
    subscriptions: z
      .record(
        z.string(),
        z.looseObject({
          expires_date: date,
          period_type: z.string().nullish(),
          store: z.string().nullish(),
          is_sandbox: z.boolean().nullish(),
          unsubscribe_detected_at: date,
          billing_issues_detected_at: date,
          refunded_at: date,
        }),
      )
      .nullish(),
  }),
})

function toIso(value: string | null | undefined): string | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

/**
 * The row for `userId` from a GET /v1/subscribers response. Throws when the body isn't a
 * customer record (so the webhook fails and RevenueCat retries).
 */
export function subscriptionFromSubscriber(userId: string, body: unknown, entitlement = PRO_ENTITLEMENT_ID): SubscriptionRow {
  const { subscriber } = subscriberSchema.parse(body)
  const managementUrl = subscriber.management_url ?? null
  const ent = subscriber.entitlements?.[entitlement]
  if (!ent) {
    return {
      user_id: userId,
      has_entitlement: false,
      expires_at: null,
      product_id: null,
      store: null,
      period_type: null,
      is_sandbox: false,
      will_renew: false,
      billing_issue_at: null,
      management_url: managementUrl,
    }
  }

  const productId = ent.product_identifier ?? null
  const subscriptions = subscriber.subscriptions ?? {}
  // Play Store entitlements can name "product:base-plan" while subscriptions are keyed by product.
  const sub = productId ? (subscriptions[productId] ?? subscriptions[productId.split(":")[0]]) : undefined

  // No expiry date at all means a lifetime entitlement; otherwise the grace period counts too.
  const expires = toIso(ent.expires_date)
  const expiresAt = expires ? later(expires, toIso(ent.grace_period_expires_date)) : null

  return {
    user_id: userId,
    has_entitlement: true,
    expires_at: expiresAt,
    product_id: productId,
    store: sub?.store ?? null,
    period_type: sub?.period_type ?? null,
    is_sandbox: sub?.is_sandbox ?? false,
    will_renew: Boolean(sub) && !sub?.unsubscribe_detected_at && !sub?.refunded_at && sub?.store !== "promotional",
    billing_issue_at: toIso(sub?.billing_issues_detected_at),
    management_url: managementUrl,
  }
}
