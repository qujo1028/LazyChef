import { describe, expect, it } from "vitest"

import {
  addedByLabel,
  amountLabel,
  canUseOne,
  categoryLabel,
  displayName,
  pantrySummary,
  remainingMessage,
  shortDate,
  unitOptions,
} from "./display"

describe("displayName / amountLabel", () => {
  it("capitalizes and formats amounts", () => {
    expect(displayName(" chicken breast ")).toBe("Chicken breast")
    expect(amountLabel({ quantity: null, unit: "count" })).toBe("On hand")
    expect(amountLabel({ quantity: 0, unit: "lb" })).toBe("Ran out")
    expect(amountLabel({ quantity: 1.5, unit: "cup" })).toBe("1½ cups")
    expect(amountLabel({ quantity: 12, unit: "count" })).toBe("12")
  })
})

describe("canUseOne", () => {
  it("is for counted things that are tracked and in stock", () => {
    expect(canUseOne({ quantity: 6, unit: "count", is_staple: false })).toBe(true)
    expect(canUseOne({ quantity: 2, unit: "can", is_staple: false })).toBe(true)
    expect(canUseOne({ quantity: 2, unit: "lb", is_staple: false })).toBe(false)
    expect(canUseOne({ quantity: null, unit: "count", is_staple: false })).toBe(false)
    expect(canUseOne({ quantity: 0, unit: "count", is_staple: false })).toBe(false)
    expect(canUseOne({ quantity: 3, unit: "count", is_staple: true })).toBe(false)
  })
})

describe("addedByLabel", () => {
  const members = [{ userId: "u2", displayName: "Sam" }]
  it("names who added it", () => {
    expect(addedByLabel("u1", members, "u1")).toBe("Added by you")
    expect(addedByLabel("u2", members, "u1")).toBe("Added by Sam")
    expect(addedByLabel("u3", members, "u1")).toBe("Added by a former member")
    expect(addedByLabel(null, members, "u1")).toBe("Added")
  })
})

describe("small labels", () => {
  it("formats dates, categories and the summary", () => {
    expect(shortDate("2026-10-05")).toBe("Oct 5")
    expect(categoryLabel("dairy")).toBe("🥛 Dairy & eggs")
    expect(pantrySummary(0, 0)).toBe("Everything your household has on hand.")
    expect(pantrySummary(1, 0)).toBe("1 item")
    expect(pantrySummary(12, 2)).toBe("12 items · 2 expiring soon")
  })

  it("says what's left after using some", () => {
    expect(remainingMessage("eggs", 5, "count")).toBe("Eggs: 5 left")
    expect(remainingMessage("chicken breast", 1.5, "lb")).toBe("Chicken breast: 1½ lb left")
    expect(remainingMessage("eggs", 0, "count")).toBe("Ran out of eggs")
  })

  it("keeps an unknown unit selectable", () => {
    expect(unitOptions("lb").some((o) => o.value === "lb")).toBe(true)
    expect(unitOptions("lb")).toHaveLength(unitOptions("count").length)
    expect(unitOptions("sprig").at(-1)).toEqual({ value: "sprig", label: "sprig" })
  })
})
