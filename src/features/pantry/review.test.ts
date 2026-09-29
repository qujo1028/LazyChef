import { describe, expect, it } from "vitest"

import type { ResolvedItem } from "@/lib/ingredients/types"
import { draftError, draftFromResolved, draftsFromResolved, draftsToItems, draftToItem, parseQuantityInput } from "./review"

const resolved: ResolvedItem = {
  raw: "2 lbs chicken breast",
  amountText: "2 lbs ",
  name: "chicken breast",
  quantity: 2,
  unit: "lb",
  category: "meat",
  categorySource: "catalog",
  ingredientId: 5062,
}

describe("parseQuantityInput", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["2", 2],
    ["1.5", 1.5],
    ["1,5", 1.5],
    [".5", 0.5],
    ["3.", 3],
    ["1/2", 0.5],
    ["1 1/2", 1.5],
    ["0", 0],
    ["1,000", 1000],
    ["12,500.5", 12500.5],
    ["1,25", 1.25],
  ])("%j → %j", (text, expected) => {
    expect(parseQuantityInput(text)).toBe(expected)
  })

  it.each(["abc", "-1", "1/0", "2 lbs", "1e3", "9999999", "1,000,000,000"])("rejects %j", (text) => {
    expect(parseQuantityInput(text)).toBeUndefined()
  })
})

describe("drafts", () => {
  it("starts from the resolved item", () => {
    expect(draftFromResolved(resolved, "k")).toMatchObject({
      key: "k",
      name: "chicken breast",
      quantity: "2",
      unit: "lb",
      category: "meat",
      suggestedCategory: "meat",
      expiresOn: "",
      isStaple: false,
      ingredientId: 5062,
    })
    expect(draftFromResolved({ ...resolved, quantity: null }, "k").quantity).toBe("")
  })

  it("turns into a new item", () => {
    const draft = { ...draftFromResolved(resolved, "k"), expiresOn: "2026-10-01", isStaple: true }
    expect(draftToItem(draft)).toEqual({
      name: "chicken breast",
      quantity: 2,
      unit: "lb",
      category: "meat",
      expires_on: "2026-10-01",
      is_staple: true,
      ingredient_id: 5062,
      category_changed: false,
    })
  })

  it("notes a changed category and drops the ingredient id after a rename", () => {
    const draft = { ...draftFromResolved(resolved, "k"), name: " Tofu ", category: "produce" as const, quantity: "" }
    expect(draftToItem(draft)).toMatchObject({ name: "Tofu", quantity: null, ingredient_id: null, category_changed: true })
    expect(draftToItem({ ...draft, name: "Chicken Breast" })).toMatchObject({ ingredient_id: 5062 })
  })

  it("reports what needs fixing", () => {
    const draft = { ...draftFromResolved(resolved, "k"), name: " ", quantity: "lots" }
    expect(draftError(draft)).toEqual({ name: "Give it a name.", quantity: expect.any(String) })
    expect(draftToItem(draft)).toBeNull()
    expect(draftsToItems([draftFromResolved(resolved, "a"), draft])).toBeNull()
    expect(draftsToItems([draftFromResolved(resolved, "a")])).toHaveLength(1)
  })
})

describe("draftsFromResolved", () => {
  it("keys drafts by batch and position", () => {
    const drafts = draftsFromResolved([resolved, { ...resolved, name: "eggs" }], 3)
    expect(drafts.map((d) => d.key)).toEqual(["3-0", "3-1"])
    expect(drafts[1]).toMatchObject({ name: "eggs", resolvedName: "eggs", quantity: "2", unit: "lb" })
  })
})
