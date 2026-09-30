// "Add your own recipe": the form's rules, shared by the form (to show problems early) and
// the server action (which checks again). Pure, so it's easy to test. It doesn't load the
// ingredient library (too big for the form); the server adds library ids and name keys.
import { z } from "zod"

import { parseLines } from "@/lib/ingredients/parse-line"

import { MEAL_FILTERS } from "./filters"

export const MAX_INGREDIENTS = 100
export const MAX_STEPS = 60
export const MAX_STEP_LENGTH = 2000
export const MAX_TITLE_LENGTH = 200
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

const MEAL_VALUES = MEAL_FILTERS.map((meal) => meal.value) as [string, ...string[]]

export type OwnIngredient = {
  original: string
  name: string
  quantity: number | null
  unit: string | null
  optional: boolean
}

/** "(optional)", "optional" or "to serve" anywhere in the line. */
const OPTIONAL = /\(\s*optional\s*\)|\boptional\b|\bto serve\b|\bfor garnish\b|\bto garnish\b/i

/**
 * The ingredient box, one ingredient per line ("2 cloves garlic, minced"), read with the
 * pantry's parser. The line is kept as written; the name drops amounts and prep notes.
 * Lines with no name ("2") come back in `problems`.
 */
export function parseIngredientLines(text: string): { lines: OwnIngredient[]; problems: string[] } {
  const lines: OwnIngredient[] = []
  const problems: string[] = []
  for (const raw of text.split(/\r\n?|\n/)) {
    const original = raw.replace(/^\s*(?:[-*•·]|\d{1,3}[.)])\s+/, "").replace(/\s+/g, " ").trim()
    if (!original) continue
    const optional = OPTIONAL.test(original)
    // parseLines drops recipe notes after a comma ("garlic, minced" → garlic).
    const parsed = parseLines(original.replace(OPTIONAL, " "))[0]
    const name = parsed?.name.replace(/[()]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) ?? ""
    if (!name) {
      problems.push(original)
      continue
    }
    const hasAmount = parsed.quantity !== null && parsed.quantity > 0 && parsed.quantity <= 1_000_000
    lines.push({
      original: original.slice(0, 300),
      name,
      quantity: hasAmount ? parsed.quantity : null,
      unit: hasAmount ? parsed.unit.slice(0, 24) : null,
      optional,
    })
  }
  return { lines, problems }
}

/** Blank → null, otherwise a whole number in range. */
function optionalWhole(min: number, max: number, label: string) {
  return z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((value, ctx) => {
      if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null
      const n = typeof value === "number" ? value : Number(value.trim())
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label} should be a whole number from ${min} to ${max}.` })
        return z.NEVER
      }
      return n
    })
}

export const ownRecipeSchema = z.object({
  title: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Give it a name.").max(MAX_TITLE_LENGTH, "That name is too long.")),
  readyInMinutes: optionalWhole(1, 2880, "Time"),
  servings: optionalWhole(1, 100, "Servings"),
  mealTypes: z
    .array(z.enum(MEAL_VALUES))
    .max(8)
    .default([])
    .transform((types) => [...new Set(types)]),
  ingredients: z
    .string()
    .max(20_000, "That's a lot of ingredients. Keep it under 100 lines.")
    .transform((text, ctx) => {
      const { lines, problems } = parseIngredientLines(text)
      if (problems.length > 0) {
        ctx.addIssue({ code: "custom", message: `Couldn't read “${problems[0]}”. Put one ingredient per line, like “2 cloves garlic”.` })
        return z.NEVER
      }
      if (lines.length === 0) {
        ctx.addIssue({ code: "custom", message: "Add at least one ingredient, one per line." })
        return z.NEVER
      }
      if (lines.length > MAX_INGREDIENTS) {
        ctx.addIssue({ code: "custom", message: `Keep it to ${MAX_INGREDIENTS} ingredients.` })
        return z.NEVER
      }
      return lines
    }),
  steps: z
    .array(z.string().max(MAX_STEP_LENGTH, `Keep each step under ${MAX_STEP_LENGTH} characters.`))
    .max(MAX_STEPS, `Keep it to ${MAX_STEPS} steps.`)
    .default([])
    .transform((steps) => steps.map((step) => step.replace(/[ \t]+/g, " ").trim()).filter(Boolean)),
  photoPath: z
    .string()
    .max(200)
    .regex(/^[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,80}\.(?:webp|jpe?g|png)$/, "That photo didn't upload properly. Try it again.")
    .nullable()
    .default(null),
})

export type OwnRecipeInput = z.input<typeof ownRecipeSchema>
export type OwnRecipe = z.output<typeof ownRecipeSchema>

/** The form's values as the user typed them. */
export type OwnRecipeDraft = {
  title: string
  readyInMinutes: string
  servings: string
  mealTypes: string[]
  ingredients: string
  steps: string[]
  photoPath: string | null
}

/** Field → first problem, for showing next to each field. */
export function fieldErrors(error: z.ZodError): Partial<Record<keyof OwnRecipeDraft, string>> {
  const errors: Partial<Record<keyof OwnRecipeDraft, string>> = {}
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof OwnRecipeDraft | undefined
    if (field && !errors[field]) errors[field] = issue.message
  }
  return errors
}

export function validateOwnRecipe(draft: OwnRecipeInput) {
  return ownRecipeSchema.safeParse(draft)
}

/** The recipe row save_household_recipe() takes. */
export function recipePayload(recipe: OwnRecipe) {
  return {
    title: recipe.title,
    meal_types: recipe.mealTypes,
    ready_in_minutes: recipe.readyInMinutes,
    servings: recipe.servings,
    instructions: recipe.steps,
    photo_path: recipe.photoPath,
  }
}

/** Where a household's photo goes: "<household>/<random>.webp". */
export function photoPathFor(householdId: string, id: string, extension = "webp"): string {
  return `${householdId}/${id}.${extension}`
}

/** A photo path is only ever inside the household's own folder. */
export function isHouseholdPhoto(path: string, householdId: string): boolean {
  return path.startsWith(`${householdId}/`) && !path.includes("..") && path.split("/").length === 2
}

/** Fits a photo inside max×max, keeping its shape. Never makes it bigger. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
