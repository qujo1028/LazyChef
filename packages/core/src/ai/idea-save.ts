// Pure helpers for turning an AI idea into a saved household recipe (the save_ai_recipe RPC).
// Ports of the web's ownInputFromIdea (src/features/recipes/ai-idea/meal-ideas.ts) and
// ingredientRows (src/features/recipes/own-actions.ts), so the phone saves the same rows.
import { findIngredient, normalizeIngredientName } from "../ingredients/catalog"
import type { OwnRecipe, OwnRecipeInput } from "../recipes/own-recipe"
import type { AiIdeaRecipe, AiIdeaMeal } from "./edge-contract"

/** What the Ideas sheet sends with the pantry. Rewording this asks for consent again. Same text as the web. */
export const MEAL_IDEAS_SENDS =
  "the names of the items in your pantry, your diet and allergies if you've set them, and the meal you're planning"

/** The meal types a saved idea is filed under (so it shows up for that meal next time). */
export function mealTypesFor(meal: AiIdeaMeal): string[] {
  return meal === "any" ? [] : [meal]
}

/** An idea as the recipe form's input, for validateOwnRecipe. */
export function ownInputFromIdea(recipe: AiIdeaRecipe, meal: AiIdeaMeal): OwnRecipeInput {
  return {
    title: recipe.title,
    readyInMinutes: recipe.minutes,
    servings: recipe.servings,
    mealTypes: mealTypesFor(meal) as OwnRecipeInput["mealTypes"],
    ingredients: recipe.ingredients.map((line) => (line.amount ? `${line.amount} ${line.name}` : line.name)).join("\n"),
    steps: recipe.steps,
    photoPath: null,
  }
}

/** The ingredient rows for the RPC: library id and name key worked out from the ingredient library. */
export function ingredientRows(recipe: OwnRecipe) {
  return recipe.ingredients.map((line) => ({
    ...line,
    name_key: normalizeIngredientName(line.name).slice(0, 120),
    ingredient_id: findIngredient(line.name)?.id ?? null,
  }))
}
