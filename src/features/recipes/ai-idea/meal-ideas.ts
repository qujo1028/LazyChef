// Automatic AI ideas for the meal on screen when the household's own recipes run thin: three
// ideas in one request, cached per household for an hour. Pure (no Node or Next APIs), so the
// browser can use the labels and the rules are easy to test.
import { z } from "zod"

import type { DietInput } from "@/features/preferences/diet"
import type { ChatMessage } from "@/lib/llm/client"
import { normalizeIngredientName } from "@/lib/ingredients/catalog"

import type { MealFilter } from "../filters"
import type { OwnRecipeInput } from "../own-recipe"
import { hintLines, hintsKeySource, NO_HINTS, type TasteHints } from "../taste"
import { aiRecipeSchema, breaksDiet, markPantryIngredients, pantryLines, RECIPE_JSON_SHAPE, RECIPE_RULES, type AiRecipe } from "./idea"

/** How many ideas one request asks for (and the most ever shown). */
export const MEAL_IDEAS_COUNT = 3

/** AI ideas show when Make now + Almost there have fewer recipes than this. */
export const THIN_MEAL_BELOW = 3

/** A cached answer lives this long (Spoonacular-style hourly freshness; the table caps it too). */
export const MEAL_IDEAS_TTL_SECONDS = 60 * 60

/** The meal the ideas are for: one of the meal filters, or any meal. */
export const IDEA_MEALS = [
  "breakfast",
  "lunch",
  "main course",
  "side dish",
  "salad",
  "soup",
  "snack",
  "dessert",
  "any",
] as const satisfies readonly (MealFilter | "any")[]
export type IdeaMeal = (typeof IDEA_MEALS)[number]
export const ideaMealSchema = z.enum(IDEA_MEALS)

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

/** What each meal means to the model. */
const MEAL_GUIDANCE: Record<IdeaMeal, string> = {
  breakfast: "breakfast: breakfast foods such as eggs, oats, toast, pancakes, yogurt bowls or smoothies",
  lunch: "lunch: something light, such as a salad, soup, sandwich, wrap or a quick main of 30 minutes or less",
  "main course": "dinner: a satisfying main course",
  "side dish": "side dishes that go with a main course",
  salad: "salads",
  soup: "soups",
  snack: "snacks: small and quick, 20 minutes or less",
  dessert: "desserts or sweet treats",
  any: "any meal of the day",
}

const SYSTEM_PROMPT = `You are LazyChef's cooking helper. You suggest exactly ${MEAL_IDEAS_COUNT} different simple home recipes for one meal, using what a household already has.

Rules:
${RECIPE_RULES}
- The user message says which meal the recipes are for; all ${MEAL_IDEAS_COUNT} must suit that meal.
- Make the ${MEAL_IDEAS_COUNT} recipes clearly different from each other (not three versions of one dish).

Reply with only a JSON object, no other text, in this shape:
{"ideas": [recipe, recipe, recipe]} where each recipe is:
${RECIPE_JSON_SHAPE}`

/** The messages for one request of three ideas. Household data goes in the user message. */
export function buildMealIdeasMessages(
  names: readonly string[],
  meal: IdeaMeal,
  diet: DietInput | null = null,
  taste: TasteHints = NO_HINTS,
): ChatMessage[] {
  const lines = [...pantryLines(names, diet), ...hintLines(taste), `Meal: ${MEAL_GUIDANCE[meal]}`, `Reply in JSON with exactly ${MEAL_IDEAS_COUNT} ideas.`]
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ]
}

/**
 * The model's reply: an `ideas` array. Each idea is checked on its own (see keepIdeas), so one
 * malformed recipe doesn't throw away the other two.
 */
export const mealIdeasReplySchema = z.object({ ideas: z.array(z.unknown()).min(1).max(10) })

/**
 * Valid ideas only: each parsed with aiRecipeSchema, dropped if it breaks the diet or repeats
 * a title, "have it" re-checked against the pantry, at most MEAL_IDEAS_COUNT.
 */
export function keepIdeas(raw: readonly unknown[], diet: DietInput | null, pantryNames: readonly string[]): AiRecipe[] {
  const seen = new Set<string>()
  const out: AiRecipe[] = []
  for (const item of raw) {
    const parsed = aiRecipeSchema.safeParse(item)
    if (!parsed.success || breaksDiet(parsed.data, diet)) continue
    const key = parsed.data.title.toLowerCase().replace(/\s+/g, " ")
    if (seen.has(key)) continue
    seen.add(key)
    out.push(markPantryIngredients(parsed.data, pantryNames))
    if (out.length === MEAL_IDEAS_COUNT) break
  }
  return out
}

/** What's stored in ai_idea_cache.response. */
export type CachedIdeas = { ideas: AiRecipe[] }

/**
 * Reads a cached answer. Any household member can write that table, so it's never trusted:
 * the JSON is parsed again with the same schemas and the viewer's diet. Null when nothing usable.
 */
export function readCachedIdeas(response: unknown, diet: DietInput | null, pantryNames: readonly string[]): AiRecipe[] | null {
  const parsed = mealIdeasReplySchema.safeParse(response)
  if (!parsed.success) return null
  const ideas = keepIdeas(parsed.data.ideas, diet, pantryNames)
  return ideas.length > 0 ? ideas : null
}

/**
 * The parts of the cache key: the meal, the pantry (normalized, sorted and de-duplicated, so
 * the order things expire in doesn't matter) and the diet and the household's taste hints. Hashed by the server (meal-cache.ts).
 */
export function ideasCacheKeySource(meal: IdeaMeal, names: readonly string[], diet: DietInput | null, taste: TasteHints = NO_HINTS): string {
  const keys = [...new Set(names.map((name) => normalizeIngredientName(name) || name.trim().toLowerCase()))].filter(Boolean).sort()
  const dietPart = diet ? `${diet.diet}:${[...diet.allergies].sort().join(",")}` : "none"
  // New ratings change the hints, so ideas refresh within the hour; no ratings keeps the old key.
  const tastePart = hintsKeySource(taste)
  return JSON.stringify(tastePart ? ["meal-ideas:v1", meal, dietPart, keys, tastePart] : ["meal-ideas:v1", meal, dietPart, keys])
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
