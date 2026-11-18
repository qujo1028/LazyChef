import { describe, expect, it } from "vitest"

import type { Tables } from "@/types/database"

import { BANNER_INTERVAL_MS, createBannerGate, housemateCookMessage } from "./banner"

const members = [
  { userId: "me", displayName: "Me" },
  { userId: "sam", displayName: "Sam" },
]

function record(over: Partial<Tables<"activity_log">> = {}): Tables<"activity_log"> {
  return {
    id: 1,
    batch_id: 7,
    actor_id: "sam",
    action: "cooked",
    details: { recipe_id: 12, recipe_title: "Dal" },
    ...over,
  } as Tables<"activity_log">
}

describe("housemateCookMessage", () => {
  it("names the housemate and the recipe", () => {
    expect(housemateCookMessage(record(), "me", members)).toEqual({ batchId: 7, title: "Sam just cooked Dal" })
  })
  it("skips your own cooks, other actions and unknown actors", () => {
    expect(housemateCookMessage(record({ actor_id: "me" }), "me", members)).toBeNull()
    expect(housemateCookMessage(record({ action: "added" }), "me", members)).toBeNull()
    expect(housemateCookMessage(record({ actor_id: null }), "me", members)).toBeNull()
  })
  it("falls back kindly", () => {
    expect(housemateCookMessage(record({ actor_id: "new" }), "me", members)?.title).toBe("A housemate just cooked Dal")
    expect(housemateCookMessage(record({ details: {} }), "me", members)?.title).toBe("Sam just cooked something")
  })
})

describe("createBannerGate", () => {
  it("does not dedupe cooks without a batch id, but still rate limits", () => {
    const gate = createBannerGate()
    expect(gate.shouldShow(null, 0)).toBe(true)
    expect(gate.shouldShow(null, 1000)).toBe(false)
    expect(gate.shouldShow(null, BANNER_INTERVAL_MS + 1)).toBe(true)
  })
  it("dedupes by batch", () => {
    const gate = createBannerGate()
    expect(gate.shouldShow(1, 0)).toBe(true)
    expect(gate.shouldShow(1, BANNER_INTERVAL_MS * 3)).toBe(false)
  })
  it("allows one banner per interval", () => {
    const gate = createBannerGate()
    expect(gate.shouldShow(1, 1000)).toBe(true)
    expect(gate.shouldShow(2, 1000 + BANNER_INTERVAL_MS - 1)).toBe(false)
    expect(gate.shouldShow(3, 1000 + BANNER_INTERVAL_MS)).toBe(true)
  })
})
