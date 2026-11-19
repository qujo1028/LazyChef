import { describe, expect, it } from "vitest"

import { isExpoPushToken, notifyRequestSchema, pushTapRoute } from "./app-contract"

describe("pushTapRoute", () => {
  it("keeps known screens", () => {
    expect(pushTapRoute("/list")).toBe("/list")
    expect(pushTapRoute("/household?x=1")).toBe("/household")
    expect(pushTapRoute("/activity#top")).toBe("/activity")
    expect(pushTapRoute("/list/")).toBe("/list")
  })
  it("sends anything else to the pantry", () => {
    expect(pushTapRoute("https://evil.example/list")).toBe("/pantry")
    expect(pushTapRoute("//evil.example")).toBe("/pantry")
    expect(pushTapRoute("/admin")).toBe("/pantry")
    expect(pushTapRoute(undefined)).toBe("/pantry")
    expect(pushTapRoute(42)).toBe("/pantry")
  })
})

describe("isExpoPushToken", () => {
  it("spots Expo tokens", () => {
    expect(isExpoPushToken("ExponentPushToken[abc123]")).toBe(true)
    expect(isExpoPushToken("ExpoPushToken[abc123]")).toBe(true)
  })
  it("leaves raw APNs and FCM tokens alone", () => {
    expect(isExpoPushToken("a1b2c3d4e5")).toBe(false)
    expect(isExpoPushToken("ExponentPushToken[]")).toBe(false)
  })
})

describe("notifyRequestSchema", () => {
  const id = "4b0f3f0e-9a7e-4c1e-8f43-1d2a3b4c5d6e"
  it("takes ids only", () => {
    expect(notifyRequestSchema.safeParse({ event: "list_added", householdId: id }).success).toBe(true)
    expect(notifyRequestSchema.safeParse({ event: "list_added", householdId: id, itemName: "x" }).success).toBe(false)
    expect(notifyRequestSchema.safeParse({ event: "joined", householdId: "nope" }).success).toBe(false)
  })
})
