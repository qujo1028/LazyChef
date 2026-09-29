// Pure: which pantry item each recipe line comes out of when you cook it, and how much,
// converted to that item's unit. When the units don't convert (a clove against a head of
// garlic, cups against pounds) it says "check this" instead of guessing. Server-side only
// in practice: it uses the ingredient library (see cook.ts for the client half).
import { roundQuantity } from "@/features/pantry/merge"
import { formatQuantityInput } from "@/features/pantry/review"
import type { RecipeIngredient } from "@/lib/spoonacular/recipe-shapes"
import { convertQuantity, formatUnit, normalizeUnit } from "@/lib/units"

import type { CookLine, CookPantryItem } from "./cook"
import { buildPantryIndex, findInPantry, isBasic } from "./match"

/** A recipe unit as one of ours: "" → count, "cups" → cup; null when we don't know it ("inches sheets"). */
function recipeUnit(unit: string): string | null {
  const trimmed = unit.trim()
  if (!trimmed) return "count"
  return normalizeUnit(trimmed)
}

function checkReason(ingredient: RecipeIngredient, itemUnit: string): string {
  if (ingredient.amount === null) return "The recipe doesn't say how much."
  const unit = ingredient.unit.trim()
  const said = unit ? `${formatQuantityInput(ingredient.amount)} ${unit}` : formatQuantityInput(ingredient.amount)
  return `The recipe says ${said}; the pantry counts ${formatUnit(itemUnit, 2) || "items"}.`
}

/** One line per recipe ingredient, in recipe order (`index` = position in the recipe). */
export function planCook(
  ingredients: readonly RecipeIngredient[],
  pantry: readonly CookPantryItem[],
  today: string,
): CookLine[] {
  const index = buildPantryIndex(pantry, today)
  return ingredients.map((ingredient, i): CookLine => {
    const base = { index: i, original: ingredient.original, name: ingredient.name }
    const item = findInPantry(index, ingredient)
    if (!item) return isBasic(ingredient) ? { ...base, kind: "basic" } : { ...base, kind: "missing" }
    if (item.is_staple || item.quantity === null) return { ...base, kind: "untracked", itemName: item.name }

    const target = { itemId: item.id, itemName: item.name, itemUnit: item.unit, have: item.quantity }
    const from = recipeUnit(ingredient.unit)
    const amount = ingredient.amount !== null && from ? convertQuantity(ingredient.amount, from, item.unit) : null
    if (amount === null || !(amount > 0)) return { ...base, kind: "check", ...target, reason: checkReason(ingredient, item.unit) }
    return { ...base, kind: "deduct", ...target, amount: roundQuantity(amount) }
  })
}

