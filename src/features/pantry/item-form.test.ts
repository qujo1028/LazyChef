import { describe, expect, it } from "vitest"

import { changedFields, formFromItem, itemFormErrors, usedAmount, type ItemForm } from "./item-form"
import type { PantryItem } from "./types"

const milk: PantryItem = {
  id: "i1",
  household_id: "h1",
  name: "milk",
  quantity: 1.5,
  unit: "cup",
  category: "dairy",
  expires_on: "2026-10-01",
  is_staple: false,
  ingredient_id: 1077,
  created_by: "u1",
  updated_by: "u1",
  created_at: "2026-09-26T10:00:00+00:00",
  updated_at: "2026-09-26T10:00:00+00:00",
}

describe("formFromItem", () => {
  it("fills the form from the item", () => {
    expect(formFromItem(milk)).toEqual({
      name: "milk",
      quantity: "1.5",
      unit: "cup",
      category: "dairy",
      expiresOn: "2026-10-01",
      isStaple: false,
    })
    expect(formFromItem({ ...milk, quantity: null, expires_on: null })).toMatchObject({ quantity: "", expiresOn: "" })
  })
})

describe("changedFields", () => {
  const initial = formFromItem(milk)
  const edit = (patch: Partial<ItemForm>) => changedFields(initial, { ...initial, ...patch })

  it("is empty when nothing changed", () => {
    expect(edit({})).toEqual({})
    expect(edit({ name: " milk " })).toEqual({})
  })

  it("sends only what changed", () => {
    expect(edit({ name: " Oat milk " })).toEqual({ name: "Oat milk" })
    expect(edit({ quantity: "2" })).toEqual({ quantity: 2 })
    expect(edit({ quantity: "1 1/2 " })).toEqual({ quantity: 1.5 })
    expect(edit({ quantity: "" })).toEqual({ quantity: null })
    expect(edit({ unit: "l", category: "beverages" })).toEqual({ unit: "l", category: "beverages" })
    expect(edit({ expiresOn: "" })).toEqual({ expires_on: null })
    expect(edit({ expiresOn: "2026-10-03" })).toEqual({ expires_on: "2026-10-03" })
    expect(edit({ isStaple: true })).toEqual({ is_staple: true })
  })

  it("leaves a long decimal alone unless it was edited", () => {
    const third = formFromItem({ ...milk, quantity: 1 / 3 })
    expect(third.quantity).toBe("0.333")
    expect(changedFields(third, { ...third, category: "beverages" })).toEqual({ category: "beverages" })
  })
})

describe("itemFormErrors", () => {
  const form = formFromItem(milk)
  it("checks the name and amount", () => {
    expect(itemFormErrors(form)).toEqual({})
    expect(itemFormErrors({ ...form, name: "  ", quantity: "lots" })).toEqual({
      name: "Give it a name.",
      quantity: "Enter an amount like 2, 1.5 or 1/2.",
    })
    expect(itemFormErrors({ ...form, name: "x".repeat(81) }).name).toBe("Keep it under 80 characters.")
  })
})

describe("usedAmount", () => {
  it("converts to the item's unit", () => {
    expect(usedAmount("8", "oz", "lb")).toEqual({ delta: -0.5 })
    expect(usedAmount("1/2", "cup", "tbsp")).toEqual({ delta: -8 })
    expect(usedAmount("2", "count", "count")).toEqual({ delta: -2 })
    expect(usedAmount("1", "can", "can")).toEqual({ delta: -1 })
  })

  it("explains units that don't convert", () => {
    expect(usedAmount("1", "cup", "lb")).toEqual({ error: "Can't convert cups to lb. Use a weight: lb, oz, g or kg." })
    expect(usedAmount("1", "lb", "cup")).toEqual({
      error: "Can't convert lb to cups. Use a volume like cups, tbsp or ml.",
    })
    expect(usedAmount("1", "cup", "count")).toEqual({ error: "Can't convert cups to a count. Enter how many you used." })
    expect(usedAmount("1", "count", "can")).toEqual({
      error: "Can't convert a count to cans. Enter how many cans you used.",
    })
  })

  it("needs an amount", () => {
    expect(usedAmount("", "lb", "lb")).toEqual({ error: "Enter how much you used." })
    expect(usedAmount("0", "lb", "lb")).toEqual({ error: "Enter how much you used." })
    expect(usedAmount("lots", "lb", "lb")).toEqual({ error: "Enter an amount like 2, 1.5 or 1/2." })
  })
})
