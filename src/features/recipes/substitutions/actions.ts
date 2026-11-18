"use server"

import { requireHousehold, requireViewer } from "@/features/household/queries"
import { localDateKey } from "@lazychef/core/dates/days"
import { getPantryItems } from "@/features/pantry/queries"
import { getMyPreferences } from "@/features/preferences/queries"
import type { ActionResult } from "@lazychef/core/pantry/types"
import { takeAiAllowance, type AiLimited } from "@/features/pro/ai-allowance"
import { askAiJson, isAiAvailable } from "@/lib/llm/ai"

import { buildPantryIndex, pantrySearchNames } from "@lazychef/core/recipes/match"
import { loadSubstitutionRecipe } from "./context"
import { recipeLines, substitutionInputSchema, type SubstitutionInput } from "./input"
import { planSubstitution } from "./guards"
import {
  buildSubstitutionMessages,
  buildTableMessages,
  finalizeSubstitutions,
  finalizeTableSwaps,
  substitutionReplySchema,
  tableReplySchema,
  type SubstitutionAnswer,
} from "./prompt"

export type SubstitutionResult = SubstitutionAnswer & { ingredient: string }

/**
 * "What can I use instead?" for one of a recipe's ingredients. The recipe is re-read on the
 * server (see loadSubstitutionRecipe) and the pantry names come from the database; whether a
 * swap is in the pantry is checked here, not taken from the model. Nothing is stored.
 *
 * Guards (see guards.ts): the star of the dish is refused without asking the AI; an ingredient
 * in the vetted table only gets swaps from its entry; anything else keeps the AI's answer only
 * where each swap is plausible; swaps that clash with the viewer's diet or allergies are dropped.
 */
export async function suggestSubstitutions(input: SubstitutionInput): Promise<ActionResult<SubstitutionResult> | AiLimited> {
  await requireViewer()
  if (!isAiAvailable()) return { error: "The AI assistant isn't set up yet." }

  const parsed = substitutionInputSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Couldn't read that request." }

  const { household } = await requireHousehold()
  let recipe
  let items
  let prefs
  try {
    ;[recipe, items, prefs] = await Promise.all([
      loadSubstitutionRecipe(parsed.data.ref, household.id, parsed.data.fallback),
      getPantryItems(household.id),
      getMyPreferences(),
    ])
  } catch (error) {
    console.error("Loading the recipe for substitutions failed:", error)
    return { error: "Couldn't load that recipe. Try again." }
  }
  if (!recipe) return { error: "Couldn't find that recipe. Reload the page and try again." }

  const ingredient = recipe.ingredients[parsed.data.index]
  if (!ingredient) return { error: "That ingredient isn't in this recipe." }

  const name = ingredient.name || ingredient.original
  const plan = planSubstitution(name, recipe.title)
  if (plan.kind === "refuse") return { swaps: [], none: plan.reason, ingredient: name }

  // Refusals above cost nothing; only a real AI request takes one of the free weekly uses.
  const limited = await takeAiAllowance(household.id)
  if (limited) return limited

  const today = localDateKey()
  const pantry = buildPantryIndex(items, today)
  const context = {
    title: recipe.title,
    lines: recipeLines(recipe.ingredients),
    target: ingredient.original || ingredient.name,
    pantry: pantrySearchNames(items, today),
  }

  if (plan.kind === "table") {
    const reply = await askAiJson(buildTableMessages(context, plan.entry, pantry), tableReplySchema, {
      maxTokens: 300,
      temperature: 0.2,
    })
    if (!reply.ok) return { error: reply.error }
    return { ...finalizeTableSwaps(reply.data, { entry: plan.entry, pantry, prefs }), ingredient: name }
  }

  const reply = await askAiJson(buildSubstitutionMessages(context), substitutionReplySchema, {
    maxTokens: 700,
    temperature: 0.4,
  })
  if (!reply.ok) return { error: reply.error }
  return { ...finalizeSubstitutions(reply.data, { target: name, pantry, prefs }), ingredient: name }
}
