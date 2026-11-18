import { describe, expect, it } from "vitest"

import {
  DAILY_WINDOW,
  EVENING_WINDOW,
  expiringMessage,
  inWindow,
  localTime,
  planExpiringPushes,
  selectExpiring,
  type ExpiringItem,
} from "./expiring"

const item = (name: string, expires_on: string | null, over: Partial<ExpiringItem> = {}): ExpiringItem => ({
  name,
  expires_on,
  quantity: 1,
  is_staple: false,
  ...over,
})

describe("localTime", () => {
  it("reads the date and hour in the person's zone", () => {
    const now = new Date("2026-11-20T17:30:00Z")
    expect(localTime(now, "UTC")).toEqual({ date: "2026-11-20", hour: 17 })
    expect(localTime(now, "America/New_York")).toEqual({ date: "2026-11-20", hour: 12 })
  })

  it("UTC+13 is already tomorrow", () => {
    expect(localTime(new Date("2026-11-20T17:30:00Z"), "Pacific/Tongatapu")).toEqual({ date: "2026-11-21", hour: 6 })
  })

  it("UTC-11 is still yesterday", () => {
    expect(localTime(new Date("2026-11-20T05:30:00Z"), "Pacific/Pago_Pago")).toEqual({ date: "2026-11-19", hour: 18 })
  })

  it("follows the clock change (US fall back, 2026-11-01)", () => {
    // 05:30 UTC is 01:30 EDT, the first 1:30; 06:30 UTC is 01:30 EST, the second one.
    expect(localTime(new Date("2026-11-01T05:30:00Z"), "America/New_York")).toEqual({ date: "2026-11-01", hour: 1 })
    expect(localTime(new Date("2026-11-01T06:30:00Z"), "America/New_York")).toEqual({ date: "2026-11-01", hour: 1 })
    expect(localTime(new Date("2026-11-01T07:30:00Z"), "America/New_York")).toEqual({ date: "2026-11-01", hour: 2 })
  })

  it("follows the clock change (US spring forward, 2026-03-08)", () => {
    expect(localTime(new Date("2026-03-08T06:59:00Z"), "America/New_York")).toEqual({ date: "2026-03-08", hour: 1 })
    expect(localTime(new Date("2026-03-08T07:00:00Z"), "America/New_York")).toEqual({ date: "2026-03-08", hour: 3 })
  })

  it("falls back to UTC for a zone it doesn't know", () => {
    expect(localTime(new Date("2026-11-20T17:30:00Z"), "Mars/Olympus_Mons")).toEqual({ date: "2026-11-20", hour: 17 })
  })

  it("never reports hour 24", () => {
    expect(localTime(new Date("2026-11-20T00:05:00Z"), "UTC").hour).toBe(0)
  })
})

describe("inWindow", () => {
  it("includes the start hour and leaves out the end hour", () => {
    expect(inWindow(8, DAILY_WINDOW)).toBe(true)
    expect(inWindow(22, DAILY_WINDOW)).toBe(true)
    expect(inWindow(23, DAILY_WINDOW)).toBe(false)
    expect(inWindow(7, DAILY_WINDOW)).toBe(false)
    expect(inWindow(17, EVENING_WINDOW)).toBe(true)
    expect(inWindow(18, EVENING_WINDOW)).toBe(true)
    expect(inWindow(19, EVENING_WINDOW)).toBe(false)
  })
})

describe("selectExpiring", () => {
  const today = "2026-11-20"
  it("keeps today through two days out, soonest first", () => {
    const picked = selectExpiring(
      [item("Yogurt", "2026-11-22"), item("Milk", "2026-11-21"), item("Bread", "2026-11-20"), item("Rice", "2026-11-23")],
      today,
    )
    expect(picked.map((p) => [p.name, p.days])).toEqual([
      ["Bread", 0],
      ["Milk", 1],
      ["Yogurt", 2],
    ])
  })

  it("leaves out expired, ran out, staples and undated items", () => {
    const picked = selectExpiring(
      [
        item("Old", "2026-11-19"),
        item("Gone", "2026-11-21", { quantity: 0 }),
        item("Salt", "2026-11-21", { is_staple: true }),
        item("Flour", null),
        item("Untracked", "2026-11-21", { quantity: null }),
      ],
      today,
    )
    expect(picked.map((p) => p.name)).toEqual(["Untracked"])
  })
})

describe("expiringMessage", () => {
  it("says nothing when nothing is expiring", () => {
    expect(expiringMessage([])).toBeNull()
  })

  it("names a single item and when", () => {
    expect(expiringMessage([{ name: "Milk", days: 1 }])?.body).toBe("Milk expires tomorrow")
    expect(expiringMessage([{ name: "Milk", days: 0 }])?.body).toBe("Milk expires today")
    expect(expiringMessage([{ name: "Milk", days: 2 }])?.body).toBe("Milk expires in 2 days")
  })

  it("counts several and opens the pantry", () => {
    const message = expiringMessage([
      { name: "Milk", days: 1 },
      { name: "Eggs", days: 2 },
      { name: "Kale", days: 2 },
    ])
    expect(message).toMatchObject({ body: "3 things in your pantry expire soon", url: "/pantry", kind: "expiring" })
  })
})

describe("planExpiringPushes", () => {
  const items = new Map([
    ["nyc", [item("Milk", "2026-11-21")]],
    ["auckland", [item("Milk", "2026-11-21")]],
    ["samoa", [item("Milk", "2026-11-21")]],
  ])

  it("only sends inside each person's own window (daily run at 17:00 UTC)", () => {
    const now = new Date("2026-11-20T17:00:00Z")
    const plan = planExpiringPushes(
      [
        { userId: "nyc", timezone: "America/New_York" }, // 12:00
        { userId: "auckland", timezone: "Pacific/Auckland" }, // 06:00 tomorrow
        { userId: "samoa", timezone: "Pacific/Pago_Pago" }, // 06:00
      ],
      items,
      now,
      DAILY_WINDOW,
    )
    expect(plan.map((p) => p.userId)).toEqual(["nyc"])
  })

  it("uses the person's local date for the expiry check and the dedupe key", () => {
    // 18:30 UTC is 07:30 on the 21st in Auckland (NZDT, +13), outside 08:00; use a 08:30 local run instead.
    const now = new Date("2026-11-19T19:30:00Z") // Auckland: 2026-11-20 08:30
    const [push] = planExpiringPushes([{ userId: "auckland", timezone: "Pacific/Auckland" }], items, now, DAILY_WINDOW)
    expect(push.dedupeKey).toBe("expiring:2026-11-20")
    // Milk expires on the 21st: tomorrow for Auckland.
    expect(push.message.body).toBe("Milk expires tomorrow")
  })

  it("UTC-11 at the same moment is still on the 19th, so the same milk is 2 days out", () => {
    const now = new Date("2026-11-19T19:30:00Z") // Pago Pago: 2026-11-19 08:30
    const [push] = planExpiringPushes([{ userId: "samoa", timezone: "Pacific/Pago_Pago" }], items, now, DAILY_WINDOW)
    expect(push.dedupeKey).toBe("expiring:2026-11-19")
    expect(push.message.body).toBe("Milk expires in 2 days")
  })

  it("on a clock change day the evening window still matches once", () => {
    // 2026-11-01 17:00 EST is 22:00 UTC. Hour 17 local.
    const now = new Date("2026-11-01T22:00:00Z")
    const plan = planExpiringPushes(
      [{ userId: "nyc", timezone: "America/New_York" }],
      new Map([["nyc", [item("Milk", "2026-11-02")]]]),
      now,
      EVENING_WINDOW,
    )
    expect(plan).toHaveLength(1)
    expect(plan[0].dedupeKey).toBe("expiring:2026-11-01")
  })

  it("one push per person even with several phones, and none when nothing expires", () => {
    const now = new Date("2026-11-20T17:00:00Z")
    const devices = [
      { userId: "nyc", timezone: "America/New_York" },
      { userId: "nyc", timezone: "America/New_York" },
      { userId: "empty", timezone: "America/New_York" },
    ]
    const plan = planExpiringPushes(devices, items, now, DAILY_WINDOW)
    expect(plan.map((p) => p.userId)).toEqual(["nyc"])
  })
})
