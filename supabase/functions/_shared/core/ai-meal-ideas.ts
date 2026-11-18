// Generated from packages/core/src/recipes/ai/meal-ideas.ts by scripts/sync-edge-shared.mjs. Edit the source, then rerun it.
// Three AI ideas for one meal in one request: the prompt, the reply check and the cache key.
// Pure, shared by the web's server actions and the `ai` Edge Function (copied to
// supabase/functions/_shared/core by scripts/sync-edge-shared.mjs). The web's labels and
// screen states stay in src/features/recipes/ai-idea/meal-ideas.ts.
import { z } from "zod"

import { normalizeIngredientName } from "./normalize.ts"
import type { DietInput } from "./diet.ts"
import { hintLines, hintsKeySource, NO_HINTS, type TasteHints } from "./taste-hints.ts"
import {
  aiRecipeSchema,
  breaksDiet,
  hintLine,
  markPantryIngredients,
  pantryLines,
  RECIPE_JSON_SHAPE,
  RECIPE_RULES,
  type AiRecipe,
  type ChatMessage,
} from "./ai-idea.ts"

/** How many ideas one request asks for (and the most ever shown). */
export const MEAL_IDEAS_COUNT = 3

/** A cached answer lives this long (Spoonacular-style hourly freshness; the table caps it too). */
export const MEAL_IDEAS_TTL_SECONDS = 60 * 60

/** The meal the ideas are for: one of the meal filters, or any meal (meal-ideas.test.ts checks they match). */
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
] as const
export type IdeaMeal = (typeof IDEA_MEALS)[number]
export const ideaMealSchema = z.enum(IDEA_MEALS)

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

/**
 * The messages for one request of three ideas. Household data (pantry, diet, taste, the hint)
 * goes in the user message, quoted as data, never in the system prompt.
 */
export function buildMealIdeasMessages(
  names: readonly string[],
  meal: IdeaMeal,
  diet: DietInput | null = null,
  taste: TasteHints = NO_HINTS,
  hint = "",
): ChatMessage[] {
  const lines = [
    ...pantryLines(names, diet),
    ...hintLines(taste),
    `Meal: ${MEAL_GUIDANCE[meal]}`,
    ...hintLine(hint),
    `Reply in JSON with exactly ${MEAL_IDEAS_COUNT} ideas.`,
  ]
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
 * the order things expire in doesn't matter), the diet, the household's taste hints and the
 * hint. Hashed by the server (see mealIdeasCacheKey). Without a hint the key is the same one
 * the web has always used, so the web and the phone share answers.
 */
export function ideasCacheKeySource(
  meal: IdeaMeal,
  names: readonly string[],
  diet: DietInput | null,
  taste: TasteHints = NO_HINTS,
  hint = "",
): string {
  const keys = [...new Set(names.map((name) => normalizeIngredientName(name) || name.trim().toLowerCase()))].filter(Boolean).sort()
  const dietPart = diet ? `${diet.diet}:${[...diet.allergies].sort().join(",")}` : "none"
  const parts: unknown[] = ["meal-ideas:v1", meal, dietPart, keys]
  // New ratings change the hints, so ideas refresh within the hour; no ratings keeps the old key.
  const tastePart = hintsKeySource(taste)
  if (tastePart) parts.push(tastePart)
  // An object, so it can never read as the taste part. Case and spacing don't make a new key.
  const hintPart = hint.replace(/\s+/g, " ").trim().toLowerCase()
  if (hintPart) parts.push({ hint: hintPart })
  return JSON.stringify(parts)
}

/** "meal-ideas:v1:main-course:<sha256 hex of the key source>": short, and no pantry names in it. */
export function mealIdeasCacheKey(meal: IdeaMeal, sourceHashHex: string): string {
  return `meal-ideas:v1:${meal.replace(/\s+/g, "-")}:${sourceHashHex}`
}
