import { describe, expect, it } from "vitest"

import { isAuthorized, isUserId, parseWebhook, subscriptionFromSubscriber } from "./revenuecat-core"

const ALEX = "8b7a3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"
const BLAIR = "1f2e3d4c-5b6a-4987-8765-43210fedcba9"

function event(fields: Record<string, unknown>) {
  return { api_version: "1.0", event: { id: "evt_1", type: "INITIAL_PURCHASE", event_timestamp_ms: 1_762_600_000_000, ...fields } }
}

describe("parseWebhook", () => {
  it("reads a purchase", () => {
    const parsed = parseWebhook(
      event({ app_user_id: ALEX, original_app_user_id: ALEX, aliases: [ALEX, "$RCAnonymousID:abc"], environment: "SANDBOX" }),
    )
    expect(parsed).toMatchObject({
      id: "evt_1",
      type: "INITIAL_PURCHASE",
      appUserId: ALEX,
      environment: "SANDBOX",
      eventAt: "2025-11-08T11:06:40.000Z",
      userIds: [ALEX],
    })
  })

  it("collects both sides of a TRANSFER (no app_user_id)", () => {
    const parsed = parseWebhook(event({ type: "TRANSFER", transferred_from: [ALEX], transferred_to: [BLAIR.toUpperCase()] }))
    expect(parsed?.appUserId).toBeNull()
    expect(parsed?.userIds).toEqual([ALEX, BLAIR])
  })

  it("ignores anonymous and non-uuid ids", () => {
    expect(parseWebhook(event({ type: "TEST", app_user_id: "$RCAnonymousID:123", aliases: [42, null] }))?.userIds).toEqual([])
  })

  it("rejects bodies that aren't webhooks", () => {
    expect(parseWebhook(null)).toBeNull()
    expect(parseWebhook({})).toBeNull()
    expect(parseWebhook({ event: { type: "RENEWAL" } })).toBeNull()
    expect(parseWebhook({ event: { id: "", type: "RENEWAL" } })).toBeNull()
  })
})

describe("isAuthorized", () => {
  it("needs the exact value", () => {
    expect(isAuthorized("Bearer s3cret", "Bearer s3cret")).toBe(true)
    expect(isAuthorized("Bearer s3cre", "Bearer s3cret")).toBe(false)
    expect(isAuthorized("Bearer s3creT", "Bearer s3cret")).toBe(false)
    expect(isAuthorized(null, "Bearer s3cret")).toBe(false)
    expect(isAuthorized("", "")).toBe(false)
  })
})

describe("isUserId", () => {
  it("accepts uuids only", () => {
    expect(isUserId(ALEX)).toBe(true)
    expect(isUserId("$RCAnonymousID:abc")).toBe(false)
    expect(isUserId(undefined)).toBe(false)
  })
})

describe("subscriptionFromSubscriber", () => {
  const trial = {
    subscriber: {
      management_url: "https://apps.apple.com/account/subscriptions",
      entitlements: {
        lazychef_pro: {
          expires_date: "2026-11-11T10:00:00Z",
          grace_period_expires_date: null,
          product_identifier: "lazychef_pro_yearly",
          purchase_date: "2026-11-08T10:00:00Z",
        },
      },
      subscriptions: {
        lazychef_pro_yearly: {
          expires_date: "2026-11-11T10:00:00Z",
          period_type: "trial",
          store: "app_store",
          is_sandbox: true,
          unsubscribe_detected_at: null,
          billing_issues_detected_at: null,
          refunded_at: null,
        },
      },
    },
  }

  it("saves an active trial", () => {
    expect(subscriptionFromSubscriber(ALEX, trial)).toEqual({
      user_id: ALEX,
      has_entitlement: true,
      expires_at: "2026-11-11T10:00:00.000Z",
      product_id: "lazychef_pro_yearly",
      store: "app_store",
      period_type: "trial",
      is_sandbox: true,
      will_renew: true,
      billing_issue_at: null,
      management_url: "https://apps.apple.com/account/subscriptions",
    })
  })

  it("marks a cancelled trial as not renewing (it still runs until it expires)", () => {
    const cancelled = structuredClone(trial)
    cancelled.subscriber.subscriptions.lazychef_pro_yearly.unsubscribe_detected_at = "2026-11-09T08:00:00Z" as never
    const row = subscriptionFromSubscriber(ALEX, cancelled)
    expect(row.has_entitlement).toBe(true)
    expect(row.will_renew).toBe(false)
  })

  it("extends to the grace period on a billing issue", () => {
    const billing = structuredClone(trial)
    billing.subscriber.entitlements.lazychef_pro.grace_period_expires_date = "2026-11-27T10:00:00Z" as never
    billing.subscriber.subscriptions.lazychef_pro_yearly.billing_issues_detected_at = "2026-11-11T10:00:05Z" as never
    const row = subscriptionFromSubscriber(ALEX, billing)
    expect(row.expires_at).toBe("2026-11-27T10:00:00.000Z")
    expect(row.billing_issue_at).toBe("2026-11-11T10:00:05.000Z")
  })

  it("keeps an expired entitlement with its date (the database decides it's over)", () => {
    const expired = structuredClone(trial)
    expired.subscriber.entitlements.lazychef_pro.expires_date = "2026-01-01T00:00:00Z"
    expect(subscriptionFromSubscriber(ALEX, expired)).toMatchObject({ has_entitlement: true, expires_at: "2026-01-01T00:00:00.000Z" })
  })

  it("treats no expiry date as lifetime", () => {
    const lifetime = structuredClone(trial)
    lifetime.subscriber.entitlements.lazychef_pro.expires_date = null as never
    lifetime.subscriber.entitlements.lazychef_pro.grace_period_expires_date = "2026-12-01T00:00:00Z" as never
    expect(subscriptionFromSubscriber(ALEX, lifetime).expires_at).toBeNull()
  })

  it("matches a Play Store base plan to its subscription", () => {
    const play = structuredClone(trial)
    play.subscriber.entitlements.lazychef_pro.product_identifier = "lazychef_pro_yearly:yearly"
    const row = subscriptionFromSubscriber(ALEX, play)
    expect(row.product_id).toBe("lazychef_pro_yearly:yearly")
    expect(row.store).toBe("app_store")
  })

  it("saves 'no Pro' for a customer without the entitlement", () => {
    expect(subscriptionFromSubscriber(ALEX, { subscriber: { entitlements: {}, subscriptions: {} } })).toMatchObject({
      has_entitlement: false,
      expires_at: null,
      will_renew: false,
    })
  })

  it("doesn't renew promotional grants or refunds", () => {
    const promo = structuredClone(trial)
    promo.subscriber.subscriptions.lazychef_pro_yearly.store = "promotional"
    expect(subscriptionFromSubscriber(ALEX, promo).will_renew).toBe(false)
    const refunded = structuredClone(trial)
    refunded.subscriber.subscriptions.lazychef_pro_yearly.refunded_at = "2026-11-09T00:00:00Z" as never
    expect(subscriptionFromSubscriber(ALEX, refunded).will_renew).toBe(false)
  })

  it("throws on something that isn't a customer record", () => {
    expect(() => subscriptionFromSubscriber(ALEX, { error: "nope" })).toThrow()
  })
})
