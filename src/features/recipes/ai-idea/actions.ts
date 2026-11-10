"use server"

import { requireHousehold, requireViewer } from "@/features/household/queries"
import { localDateKey } from "@/features/pantry/dates"
import { firstIssue } from "@/features/pantry/schemas"
import { getPantryItems } from "@/features/pantry/queries"
import type { ActionResult } from "@/features/pantry/types"
import { askAiJson } from "@/lib/llm/ai"

import { pantrySearchNames } from "../match"
import {
  aiRecipeSchema,
  buildIdeaMessages,
  cleanNames,
  hintSchema,
  markPantryIngredients,
  missingIngredients,
  type AiRecipe,
} from "./idea"

export type AiIdea = { recipe: AiRecipe; missing: string[] }

/**
 * One recipe idea from the household's pantry. The names are read here with the viewer's
 * session (RLS), never taken from the browser; only the hint comes from the client.
 */
export async function getAiRecipeIdea(hint: string, avoidTitle?: string): Promise<ActionResult<AiIdea>> {
  await requireViewer()
  const parsedHint = hintSchema.safeParse(typeof hint === "string" ? hint : "")
  if (!parsedHint.success) return { error: firstIssue(parsedHint.error) }
  const avoid = typeof avoidTitle === "string" ? avoidTitle.trim().slice(0, 100) : undefined

  const { household } = await requireHousehold()
  const items = await getPantryItems(household.id)
  const names = cleanNames(pantrySearchNames(items, localDateKey()))
  if (names.length === 0) return { error: "Add a few things to your pantry first." }

  const result = await askAiJson(buildIdeaMessages(names, parsedHint.data, avoid), aiRecipeSchema, {
    maxTokens: 1500,
    temperature: 0.8,
  })
  if (!result.ok) return { error: result.error }

  const recipe = markPantryIngredients(result.data, names)
  return { recipe, missing: missingIngredients(recipe).map((ingredient) => ingredient.name) }
}
