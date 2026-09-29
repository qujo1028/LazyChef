// Pure: the edit sheet's form ("fix category/amount", rename, expiry, staple) and
// its "Used some" box.
import type { Category } from "@/lib/ingredients/types"
import { convertQuantity, formatUnit, unitDimension } from "@/lib/units"
import { roundQuantity } from "./merge"
import { formatQuantityInput, parseQuantityInput } from "./review"
import type { PantryItem, PantryItemFields } from "./types"

export type ItemForm = {
  name: string
  /** As typed; "" = on hand, not tracked. */
  quantity: string
  unit: string
  category: Category
  /** YYYY-MM-DD or "". */
  expiresOn: string
  isStaple: boolean
}

export function formFromItem(item: PantryItem): ItemForm {
  return {
    name: item.name,
    quantity: formatQuantityInput(item.quantity),
    unit: item.unit,
    category: item.category,
    expiresOn: item.expires_on ?? "",
    isStaple: item.is_staple,
  }
}

export function itemFormErrors(form: ItemForm): { name?: string; quantity?: string } {
  const errors: { name?: string; quantity?: string } = {}
  const name = form.name.trim()
  if (!name) errors.name = "Give it a name."
  else if (name.length > 80) errors.name = "Keep it under 80 characters."
  if (parseQuantityInput(form.quantity) === undefined) errors.quantity = "Enter an amount like 2, 1.5 or 1/2."
  return errors
}

/**
 * What the user changed since the sheet opened, for updateItem(). Compared with the form
 * as it opened (not the live item), so a housemate's edit to another field isn't undone.
 * Assumes the form is valid (see itemFormErrors).
 */
export function changedFields(initial: ItemForm, form: ItemForm): PantryItemFields {
  const fields: PantryItemFields = {}
  const name = form.name.trim()
  if (name !== initial.name.trim()) fields.name = name
  if (form.quantity.trim() !== initial.quantity.trim()) {
    const quantity = parseQuantityInput(form.quantity)
    if (quantity !== undefined) fields.quantity = quantity
  }
  if (form.unit !== initial.unit) fields.unit = form.unit
  if (form.category !== initial.category) fields.category = form.category
  if (form.expiresOn !== initial.expiresOn) fields.expires_on = form.expiresOn || null
  if (form.isStaple !== initial.isStaple) fields.is_staple = form.isStaple
  return fields
}

function unitPhrase(unit: string): string {
  return unitDimension(unit) === "count" ? "a count" : formatUnit(unit, 2)
}

function convertHint(itemUnit: string): string {
  switch (unitDimension(itemUnit)) {
    case "mass":
      return "Use a weight: lb, oz, g or kg."
    case "volume":
      return "Use a volume like cups, tbsp or ml."
    case "count":
      return "Enter how many you used."
    default:
      return `Enter how many ${formatUnit(itemUnit, 2)} you used.`
  }
}

/**
 * "Used some": `amountText` in `unit`, converted to the item's unit, as the (negative)
 * delta for adjustQuantity(). 8 oz off an item tracked in lb → -0.5.
 */
export function usedAmount(amountText: string, unit: string, itemUnit: string): { delta: number } | { error: string } {
  const amount = parseQuantityInput(amountText)
  if (amount === undefined) return { error: "Enter an amount like 2, 1.5 or 1/2." }
  if (amount === null || amount === 0) return { error: "Enter how much you used." }
  const converted = convertQuantity(amount, unit, itemUnit)
  if (converted === null) {
    return { error: `Can't convert ${unitPhrase(unit)} to ${unitPhrase(itemUnit)}. ${convertHint(itemUnit)}` }
  }
  const delta = roundQuantity(converted)
  if (delta === 0) return { error: "That's too little to take off." }
  return { delta: -delta }
}
