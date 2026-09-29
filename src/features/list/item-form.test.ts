import { describe, expect, it } from "vitest"

import { listChangedFields, listFormErrors, listFormFromItem, type ListItemForm } from "./item-form"
import type { ListItem } from "./types"

const base: ListItemForm = { name: "milk", quantity: "", unit: "count", category: "dairy", note: "" }

describe("list item form", () => {
  it("starts from the line", () => {
    const item = { name: "chicken", quantity: 1.5, unit: "lb", category: "meat", note: "thighs" } as ListItem
    expect(listFormFromItem(item)).toEqual({ name: "chicken", quantity: "1.5", unit: "lb", category: "meat", note: "thighs" })
    expect(listFormFromItem({ ...item, quantity: null, unit: null, note: null }).unit).toBe("count")
  })

  it("checks the fields", () => {
    expect(listFormErrors(base)).toEqual({})
    expect(listFormErrors({ ...base, name: " " }).name).toBeDefined()
    expect(listFormErrors({ ...base, quantity: "lots" }).quantity).toBeDefined()
    expect(listFormErrors({ ...base, quantity: "0" }).quantity).toBe("Leave it empty for any amount.")
    expect(listFormErrors({ ...base, note: "x".repeat(201) }).note).toBeDefined()
  })

  it("sends only what changed", () => {
    expect(listChangedFields(base, base)).toEqual({})
    expect(listChangedFields(base, { ...base, name: " oat milk ", quantity: "2", unit: "l", note: " barista " })).toEqual({
      name: "oat milk",
      quantity: 2,
      unit: "l",
      note: "barista",
    })
    expect(listChangedFields({ ...base, quantity: "2", unit: "l", note: "x" }, { ...base, unit: "count" })).toEqual({
      quantity: null,
      unit: null,
      note: null,
    })
  })
})
