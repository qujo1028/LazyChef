// Pure: turns recipe ingredient lines into shopping list lines. The list's own planner
// (src/features/list/plan.ts) then tops up or skips what's already on the list.
import type { NewListLine } from "@/features/list/types"
import type { Category } from "@/lib/ingredients/types"
import type { RecipeIngredient } from "@/lib/spoonacular/recipe-shapes"
import { normalizeUnit } from "@/lib/units"

type Options = {
  category: (ingredient: RecipeIngredient) => Category
  /** Spoonacular's id (null for our own recipes) and the title. */
  recipe: { id: number | null; title: string }
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

export function recipeListLines(ingredients: readonly RecipeIngredient[], { category, recipe }: Options): NewListLine[] {
  return ingredients.map((ingredient) => {
    const amount = amountFor(ingredient)
    return {
      name: ingredient.name.slice(0, 80),
      quantity: amount?.quantity ?? null,
      unit: amount?.unit ?? null,
      category: category(ingredient),
      ingredient_id: ingredient.id,
      note: amount ? null : ingredient.original.slice(0, 200) || null,
      recipe_id: recipe.id,
      recipe_title: recipe.title.slice(0, 200),
    }
  })
}
