"use server"

import { requireViewer } from "@/features/household/queries"
import type { ActionResult } from "@/features/pantry/types"
import { askAiJson } from "@/lib/llm/ai"

import { getHouseholdTaste } from "../taste-queries"
import { loadIdeaPantry } from "./context"
import { missingIngredients, type AiRecipe } from "./idea"
import { getCachedMealIdeas, mealIdeasCacheKey, putCachedMealIdeas } from "./meal-cache"
import { buildMealIdeasMessages, ideaMealSchema, keepIdeas, mealIdeasReplySchema } from "./meal-ideas"

export type MealIdea = { recipe: AiRecipe; missing: string[] }

const withMissing = (recipe: AiRecipe): MealIdea => ({
  recipe,
  missing: missingIngredients(recipe).map((ingredient) => ingredient.name),
})

/**
 * Up to three AI ideas for a meal, from one request. Only called by the browser after the
 * person agreed to send their pantry names (see MealIdeas). The pantry and diet are read here
 * with the viewer's session; only the meal comes from the client. Answers are cached per
 * household, meal, pantry and diet for an hour (ai_idea_cache) and re-checked when read.
 */
export async function getMealIdeas(meal: string): Promise<ActionResult<{ ideas: MealIdea[] }>> {
  await requireViewer()
  const parsedMeal = ideaMealSchema.safeParse(meal)
  if (!parsedMeal.success) return { error: "Pick a meal first." }

  const pantry = await loadIdeaPantry()
  if (pantry.error !== undefined) return { error: pantry.error }
  const { householdId, diet, names } = pantry

  const { hints } = await getHouseholdTaste(householdId)
  const key = mealIdeasCacheKey(parsedMeal.data, names, diet, hints)
  const cached = await getCachedMealIdeas(householdId, key, diet, names)
  if (cached) return { ideas: cached.map(withMissing) }

  const result = await askAiJson(buildMealIdeasMessages(names, parsedMeal.data, diet, hints), mealIdeasReplySchema, {
    maxTokens: 4000,
    temperature: 0.8,
  })
  if (!result.ok) return { error: result.error }

  const ideas = keepIdeas(result.data.ideas, diet, names)
  if (ideas.length === 0) return { error: "No AI ideas fit right now. Try again later." }
  await putCachedMealIdeas(householdId, key, ideas)
  return { ideas: ideas.map(withMissing) }
}
