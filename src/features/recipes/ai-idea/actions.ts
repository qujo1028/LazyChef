"use server"

import { requireViewer } from "@/features/household/queries"
import { firstIssue } from "@/features/pantry/schemas"
import type { ActionResult } from "@/features/pantry/types"
import { askAiJson } from "@/lib/llm/ai"

import { getHouseholdTaste } from "../taste-queries"
import { loadIdeaPantry } from "./context"
import { aiRecipeSchema, breaksDiet, buildIdeaMessages, hintSchema, markPantryIngredients, missingIngredients, type AiRecipe } from "./idea"

export type AiIdea = { recipe: AiRecipe; missing: string[] }

/** One retry when the model ignores the diet; after that, ask the person to try again. */
const DIET_ATTEMPTS = 2

/**
 * One recipe idea from the household's pantry. The names are read here with the viewer's
 * session (RLS), never taken from the browser; only the hint comes from the client. The
 * viewer's diet and allergies (if any) are followed: conflicting pantry items aren't sent,
 * the model is told, and its answer is checked.
 */
export async function getAiRecipeIdea(hint: string, avoidTitle?: string): Promise<ActionResult<AiIdea>> {
  await requireViewer()
  const parsedHint = hintSchema.safeParse(typeof hint === "string" ? hint : "")
  if (!parsedHint.success) return { error: firstIssue(parsedHint.error) }
  const avoid = typeof avoidTitle === "string" ? avoidTitle.trim().slice(0, 100) : undefined

  const pantry = await loadIdeaPantry()
  if (pantry.error !== undefined) return { error: pantry.error }
  const { householdId, diet, names } = pantry
  const { hints } = await getHouseholdTaste(householdId)

  for (let attempt = 0; attempt < DIET_ATTEMPTS; attempt++) {
    const result = await askAiJson(buildIdeaMessages(names, parsedHint.data, avoid, diet, hints), aiRecipeSchema, {
      maxTokens: 1500,
      temperature: 0.8,
    })
    if (!result.ok) return { error: result.error }
    if (breaksDiet(result.data, diet)) continue

    const recipe = markPantryIngredients(result.data, names)
    return { recipe, missing: missingIngredients(recipe).map((ingredient) => ingredient.name) }
  }
  return { error: "That idea didn't fit your diet. Try again." }
}
