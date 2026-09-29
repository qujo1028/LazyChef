// Turns recipe ingredient lines into shopping list rows (the add_to_shopping_list format).
// Pure: the catalog lookups are passed in, so it's easy to test.
import type { Category } from "@/lib/ingredients/types"
import type { RecipeIngredient } from "@/lib/spoonacular/recipe-shapes"
import { normalizeUnit } from "@/lib/units"

export type NewListLine = {
  name: string
  quantity: number | null
  unit: string | null
  category: Category
  ingredient_id: number | null
  note: string | null
  recipe_id: number
  recipe_title: string
}

type Options = {
  normalize: (name: string) => string
  category: (ingredient: RecipeIngredient) => Category
  recipe: { id: number; title: string }
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

/** Amount in one of our units, or none (with the recipe's line kept as a note instead). */
function amountFor(ingredient: RecipeIngredient): { quantity: number | null; unit: string | null } | null {
  if (ingredient.amount === null) return null
  const unit = ingredient.unit.trim()
  if (!unit) return { quantity: round(ingredient.amount), unit: null }
  const known = normalizeUnit(unit)
  return known ? { quantity: round(ingredient.amount), unit: known } : null
}

/**
 * New list lines for `ingredients`, skipping anything already on the list (unchecked)
 * by ingredient id or normalized name. The same ingredient twice in a recipe becomes one
 * line, with the amounts added when the units agree.
 */
export function planListAdditions(
  ingredients: readonly RecipeIngredient[],
  openLines: readonly { name: string; ingredient_id: number | null }[],
  { normalize, category, recipe }: Options,
): { items: NewListLine[]; alreadyOnList: number } {
  const listKeys = new Set(openLines.map((line) => normalize(line.name)))
  const listIds = new Set(openLines.flatMap((line) => (line.ingredient_id === null ? [] : [line.ingredient_id])))
  const byKey = new Map<string, NewListLine>()
  let alreadyOnList = 0

  for (const ingredient of ingredients) {
    const key = normalize(ingredient.name) || ingredient.name
    if ((ingredient.id !== null && listIds.has(ingredient.id)) || listKeys.has(key)) {
      alreadyOnList++
      continue
    }
    const amount = amountFor(ingredient)
    const existing = byKey.get(key)
    if (existing) {
      const sameUnit = amount && existing.quantity !== null && existing.unit === amount.unit
      existing.quantity = sameUnit ? round(existing.quantity! + amount.quantity!) : null
      if (!sameUnit) existing.unit = null
      existing.note = null
      continue
    }
    byKey.set(key, {
      name: ingredient.name.slice(0, 80),
      quantity: amount?.quantity ?? null,
      unit: amount?.unit ?? null,
      category: category(ingredient),
      ingredient_id: ingredient.id,
      note: amount ? null : ingredient.original.slice(0, 200) || null,
      recipe_id: recipe.id,
      recipe_title: recipe.title.slice(0, 200),
    })
  }
  return { items: [...byKey.values()], alreadyOnList }
}
