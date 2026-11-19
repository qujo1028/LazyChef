// Automatic AI ideas for the meal on screen when the household's own recipes run thin: three
// ideas in one request, cached per household for an hour. The prompt, the reply check and the
// cache key live in packages/core (shared with the `ai` Edge Function) and are re-exported
// here; this file adds the web's labels and screen states. Pure, so the browser can use it.
import type { MealFilter } from "@lazychef/core/recipes/filters"
import type { OwnRecipeInput } from "@lazychef/core/recipes/own-recipe"
import type { AiRecipe } from "@lazychef/core/recipes/ai/idea"
import type { IdeaMeal } from "@lazychef/core/recipes/ai/meal-ideas"

export {
  buildMealIdeasMessages,
  IDEA_MEALS,
  ideaMealSchema,
  ideasCacheKeySource,
  keepIdeas,
  MEAL_IDEAS_COUNT,
  MEAL_IDEAS_TTL_SECONDS,
  mealIdeasReplySchema,
  readCachedIdeas,
  type CachedIdeas,
  type IdeaMeal,
} from "@lazychef/core/recipes/ai/meal-ideas"

/** AI ideas show when Make now + Almost there have fewer recipes than this. */
export const THIN_MEAL_BELOW = 3

/** What's sent with the pantry. Rewording this asks for consent again (see useAiConsent). */
export const MEAL_IDEAS_SENDS = "the names of the items in your pantry, your diet and allergies if you've set them, and the meal you're planning"

/**
 * The meal on screen (see resolveMeals): the first of the resolved meals, so late-night Auto
 * ("dessert" then "snack") asks for dessert; null (Any meal, or an unknown clock) is any meal.
 */
export function ideaMealFor(meals: readonly MealFilter[] | null): IdeaMeal {
  return meals?.[0] ?? "any"
}

/** "Get AI ideas for dinner". */
export function mealPhrase(meal: IdeaMeal): string {
  switch (meal) {
    case "main course":
      return "dinner"
    case "side dish":
      return "sides"
    case "snack":
      return "a snack"
    case "any":
      return "a meal"
    default:
      return meal
  }
}

/** The meal types a saved idea is filed under (so it shows up for that meal next time). */
export function mealTypesFor(meal: IdeaMeal): MealFilter[] {
  return meal === "any" ? [] : [meal]
}

/** An idea as the "Add your own recipe" form's input, for save_ai_recipe. */
export function ownInputFromIdea(recipe: AiRecipe, meal: IdeaMeal): OwnRecipeInput {
  return {
    title: recipe.title,
    readyInMinutes: recipe.minutes,
    servings: recipe.servings,
    mealTypes: mealTypesFor(meal),
    ingredients: recipe.ingredients.map((line) => (line.amount ? `${line.amount} ${line.name}` : line.name)).join("\n"),
    steps: recipe.steps,
    photoPath: null,
  }
}

/** The looping gradient border on AI idea tiles (globals.css; static with reduced motion). */
export const AI_BORDER_CLASS = "ai-border"
/** The shimmer on the "Get AI ideas" tile (globals.css; static with reduced motion). */
export const AI_SHIMMER_CLASS = "ai-shimmer"

// ── The area's states (consent first, then loading) ─────────────────────────

export type MealIdeasState<Idea = AiRecipe> =
  | { status: "offer" }
  | { status: "loading" }
  | { status: "ready"; ideas: Idea[] }
  | { status: "note"; message: string; limit?: boolean }

/**
 * Where the area starts. With consent already given on this device it fetches straight away;
 * without it, it only offers (one tap, then the consent question). Nothing is ever sent before.
 */
export function initialMealIdeasState(hasConsent: boolean): MealIdeasState<never> {
  return hasConsent ? { status: "loading" } : { status: "offer" }
}
