// What the "What can I use instead?" action accepts. Pure, shared by the action and its tests.
import { z } from "zod"

import { parseRecipeRef, type RecipeRef } from "../ref"
import { MAX_LINE_LENGTH, MAX_RECIPE_LINES, MAX_TITLE_LENGTH } from "./prompt"

/** One recipe line as the page shows it. Long ones are cut, not rejected. */
const line = z
  .string()
  .max(1000)
  .transform((value) => value.replace(/\s+/g, " ").trim().slice(0, MAX_LINE_LENGTH))

/**
 * The page's copy of the recipe. Only used for a Spoonacular recipe that has dropped out of the
 * hour-long cache (re-fetching it would spend a point); ours always come from the database.
 */
const fallbackSchema = z.object({
  title: z
    .string()
    .max(1000)
    .transform((value) => value.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH))
    .pipe(z.string().min(1)),
  /** Per ingredient: the recipe's line and the plain name ("1 cup buttermilk", "buttermilk"). */
  ingredients: z
    .array(z.object({ original: line, name: line }))
    .min(1)
    .max(100),
})

export type SubstitutionFallback = z.input<typeof fallbackSchema>

export const substitutionInputSchema = z.object({
  ref: z
    .string()
    .max(40)
    .transform((value, ctx): RecipeRef => {
      const ref = parseRecipeRef(value)
      if (!ref) {
        ctx.addIssue({ code: "custom", message: "That recipe doesn't exist." })
        return z.NEVER
      }
      return ref
    }),
  /** Position of the ingredient in the recipe's list. */
  index: z.number().int().nonnegative().max(200),
  fallback: fallbackSchema.optional(),
})

export type SubstitutionInput = z.input<typeof substitutionInputSchema>

/** Recipe lines for the prompt (capped), from whichever copy the server settled on. */
export function recipeLines(ingredients: readonly { original: string; name: string }[]): string[] {
  return ingredients
    .slice(0, MAX_RECIPE_LINES)
    .map((ingredient) => (ingredient.original || ingredient.name).slice(0, MAX_LINE_LENGTH))
}
