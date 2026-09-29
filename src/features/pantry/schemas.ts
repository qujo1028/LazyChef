// Input validation shared by the pantry and shopping list server actions.
import { z } from "zod"

import { CATEGORIES, type Category } from "@/lib/ingredients/types"
import { normalizeUnit } from "@/lib/units"

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [Category, ...Category[]]

export const itemId = z.uuid("That item doesn't exist anymore.")
export const name = z.string().trim().min(1, "Give it a name.").max(80, "Keep names under 80 characters.")
export const quantity = z.number().nonnegative("Amounts can't be negative.").max(1_000_000, "That amount looks too big.")
export const unit = z.string().trim().min(1, "Pick a unit.").max(24)
export const category = z.enum(CATEGORY_VALUES)
export const date = z.iso.date("Pick a valid date.")

export const newItemSchema = z.object({
  name,
  quantity: quantity.nullable(),
  unit,
  category,
  expires_on: date.nullable(),
  is_staple: z.boolean(),
  ingredient_id: z.number().int().positive().nullable(),
  category_changed: z.boolean(),
})

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check what you entered."
}

export function canonicalUnit(value: string) {
  return normalizeUnit(value) ?? value
}
