// Pure: the list line edit sheet's form.
import { formatQuantityInput, parseQuantityInput } from "@/features/pantry/review"
import type { Category } from "@/lib/ingredients/types"

import { listUnit } from "./display"
import type { ListItem, ListItemFields } from "./types"

export type ListItemForm = {
  name: string
  /** As typed; "" = any amount. */
  quantity: string
  /** A unit key; "count" = no unit. */
  unit: string
  category: Category
  note: string
}

export function listFormFromItem(item: ListItem): ListItemForm {
  return {
    name: item.name,
    quantity: formatQuantityInput(item.quantity),
    unit: item.unit ?? "count",
    category: item.category,
    note: item.note ?? "",
  }
}

export function listFormErrors(form: ListItemForm): { name?: string; quantity?: string; note?: string } {
  const errors: { name?: string; quantity?: string; note?: string } = {}
  const name = form.name.trim()
  if (!name) errors.name = "Give it a name."
  else if (name.length > 80) errors.name = "Keep it under 80 characters."
  const quantity = parseQuantityInput(form.quantity)
  if (quantity === undefined) errors.quantity = "Enter an amount like 2, 1.5 or 1/2."
  else if (quantity === 0) errors.quantity = "Leave it empty for any amount."
  if (form.note.trim().length > 200) errors.note = "Keep notes under 200 characters."
  return errors
}

/**
 * What changed since the sheet opened, for updateListItem(). Compared with the form as it
 * opened, so a housemate's edit to another field isn't undone. Assumes the form is valid.
 */
export function listChangedFields(initial: ListItemForm, form: ListItemForm): ListItemFields {
  const fields: ListItemFields = {}
  const name = form.name.trim()
  if (name !== initial.name.trim()) fields.name = name
  if (form.quantity.trim() !== initial.quantity.trim()) {
    const quantity = parseQuantityInput(form.quantity)
    if (quantity !== undefined) fields.quantity = quantity
  }
  if (form.unit !== initial.unit) fields.unit = listUnit(form.unit)
  if (form.category !== initial.category) fields.category = form.category
  if (form.note.trim() !== initial.note.trim()) fields.note = form.note.trim() || null
  return fields
}
