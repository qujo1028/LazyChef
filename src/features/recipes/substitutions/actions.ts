"use server"

import { requireHousehold, requireViewer } from "@/features/household/queries"
import { localDateKey } from "@/features/pantry/dates"
import { getPantryItems } from "@/features/pantry/queries"
import type { ActionResult } from "@/features/pantry/types"
import { askAiJson, isAiAvailable } from "@/lib/llm/ai"

import { buildPantryIndex, pantrySearchNames } from "../match"
import { loadSubstitutionRecipe } from "./context"
import { recipeLines, substitutionInputSchema, type SubstitutionInput } from "./input"
import {
  buildSubstitutionMessages,
  finalizeSubstitutions,
  substitutionReplySchema,
  type SubstitutionAnswer,
} from "./prompt"

export type SubstitutionResult = SubstitutionAnswer & { ingredient: string }

/**
 * "What can I use instead?" for one of a recipe's ingredients. The recipe is re-read on the
 * server (see loadSubstitutionRecipe) and the pantry names come from the database; whether a
 * swap is in the pantry is checked here, not taken from the model. Nothing is stored.
 */
export async function suggestSubstitutions(input: SubstitutionInput): Promise<ActionResult<SubstitutionResult>> {
  await requireViewer()
  if (!isAiAvailable()) return { error: "The AI assistant isn't set up yet." }

  const parsed = substitutionInputSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Couldn't read that request." }

  const { household } = await requireHousehold()
  let recipe
  let items
  try {
    ;[recipe, items] = await Promise.all([
      loadSubstitutionRecipe(parsed.data.ref, household.id, parsed.data.fallback),
      getPantryItems(household.id),
    ])
  } catch (error) {
    console.error("Loading the recipe for substitutions failed:", error)
    return { error: "Couldn't load that recipe. Try again." }
  }
  if (!recipe) return { error: "Couldn't find that recipe. Reload the page and try again." }

  const ingredient = recipe.ingredients[parsed.data.index]
  if (!ingredient) return { error: "That ingredient isn't in this recipe." }

  const today = localDateKey()
  const messages = buildSubstitutionMessages({
    title: recipe.title,
    lines: recipeLines(recipe.ingredients),
    target: ingredient.original || ingredient.name,
    pantry: pantrySearchNames(items, today),
  })
  const reply = await askAiJson(messages, substitutionReplySchema, { maxTokens: 700, temperature: 0.4 })
  if (!reply.ok) return { error: reply.error }

  const answer = finalizeSubstitutions(reply.data, {
    target: ingredient.name || ingredient.original,
    pantry: buildPantryIndex(items, today),
  })
  return { ...answer, ingredient: ingredient.name || ingredient.original }
}
