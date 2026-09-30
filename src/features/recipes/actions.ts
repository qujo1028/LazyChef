"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/features/pantry/types"
import { requireHousehold } from "@/features/household/queries"
import { dbError } from "@/features/pantry/server-helpers"
import { addListItems } from "@/features/list/actions"
import { categoryFromAisle } from "@/lib/ingredients/aisles"
import { findIngredient, guessCategory } from "@/lib/ingredients/catalog"
import { SpoonacularError } from "@/lib/spoonacular"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

import type { CookResult, Deduction } from "./cook"
import { recipeListLines } from "./list"
import { loadRecipe } from "./queries"
import { parseRecipeRef, type RecipeRef } from "./ref"

/** A recipe's ref (Spoonacular's id or our uuid, see ref.ts), parsed. */
const refSchema = z
  .string()
  .max(40)
  .transform((value, ctx): RecipeRef => {
    const ref = parseRecipeRef(value)
    if (!ref) {
      ctx.addIssue({ code: "custom", message: "That recipe doesn't exist." })
      return z.NEVER
    }
    return ref
  })

const input = z.object({
  ref: refSchema,
  /** Indexes into the recipe's ingredient lines. */
  lines: z.array(z.number().int().nonnegative()).min(1, "Pick something to add.").max(100),
})

export type AddToListSummary = { added: number; toppedUp: number; alreadyOnList: number }

/**
 * Adds some of a recipe's ingredient lines to the shopping list, tagged with the recipe.
 * Ingredients already on the list (and not yet checked off) aren't added twice. The
 * recipe comes from the server's cache, so the client can't make up ingredients.
 */
export async function addRecipeIngredientsToList(ref: string, lines: number[]): Promise<ActionResult<AddToListSummary>> {
  const parsed = input.safeParse({ ref, lines })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Pick something to add." }

  const { household } = await requireHousehold()
  let recipe
  try {
    recipe = await loadRecipe(parsed.data.ref, household.id)
  } catch (error) {
    if (error instanceof SpoonacularError) return { error: error.message }
    console.error("Loading the recipe failed:", error)
    return { error: "Couldn't load that recipe. Try again." }
  }
  if (!recipe) return { error: "That recipe was deleted." }

  const chosen = [...new Set(parsed.data.lines)].flatMap((i) => recipe.ingredients[i] ?? [])
  const listLines = recipeListLines(chosen, {
    category: (ingredient) => {
      const fromCatalog = findIngredient(ingredient.name)?.category
      if (fromCatalog) return fromCatalog
      const fromAisle = categoryFromAisle(ingredient.aisle)
      return fromAisle !== "other" ? fromAisle : guessCategory(ingredient.name)
    },
    // The list keeps Spoonacular's id (their terms allow it); ours are named by title only.
    recipe: { id: recipe.spoonacularId, title: recipe.title },
  })
  // Tops up or skips what's already on the list (see src/features/list/plan.ts).
  const result = await addListItems(listLines)
  if (result.error !== undefined) return result

  revalidatePath("/list")
  revalidatePath(`/recipes/${recipe.ref}`)
  return { added: result.added, toppedUp: result.toppedUp, alreadyOnList: result.alreadyOnList }
}

const deductionsSchema = z
  .array(z.object({ item_id: z.uuid(), amount: z.number().positive().max(1_000_000) }))
  .min(1, "Pick at least one thing to take out of the pantry.")
  .max(100)

const cookInput = z.object({
  ref: refSchema,
  title: z.string().trim().min(1).max(200),
  deductions: deductionsSchema,
})

/**
 * "I cooked this": takes the reviewed amounts out of the pantry in one transaction
 * (cook_recipe), logged as one "cooked <recipe>" activity entry.
 */
export async function cookRecipe(
  ref: string,
  title: string,
  deductions: Deduction[],
): Promise<ActionResult<{ results: CookResult[] }>> {
  const parsed = cookInput.safeParse({ ref, title, deductions })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the amounts." }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  const { ref: recipe } = parsed.data
  const { data, error } = await supabase.rpc("cook_recipe", {
    p_household_id: household.id,
    p_recipe_id: recipe.kind === "spoonacular" ? recipe.id : null,
    p_local_recipe_id: recipe.kind === "local" ? recipe.id : null,
    p_recipe_title: parsed.data.title,
    p_deductions: parsed.data.deductions as unknown as Json,
  })
  if (error) return { error: dbError("cook_recipe", error) }

  revalidatePath("/pantry")
  revalidatePath("/activity")
  revalidatePath(`/recipes/${ref}`)
  return {
    results: (data ?? []).map((row) => ({
      ...row,
      quantity_before: row.quantity_before === null ? null : Number(row.quantity_before),
      quantity_after: row.quantity_after === null ? null : Number(row.quantity_after),
    })),
  }
}

/** Undo for "I cooked this": puts back what was actually taken, in one transaction. */
export async function undoCook(amounts: Deduction[]): Promise<ActionResult> {
  const parsed = deductionsSchema.safeParse(amounts)
  if (!parsed.success) return { error: "Nothing to put back." }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  // Keep each item's expiry: add_pantry_items gives a ran-out item the date it's sent.
  const { data: items, error: loadError } = await supabase
    .from("pantry_items")
    .select("id, expires_on")
    .eq("household_id", household.id)
    .in(
      "id",
      parsed.data.map((d) => d.item_id),
    )
  if (loadError) return { error: dbError("Loading the pantry", loadError) }
  const expiry = new Map(items.map((item) => [item.id, item.expires_on]))
  const entries = parsed.data
    .filter((d) => expiry.has(d.item_id))
    .map((d) => ({ merge_into: d.item_id, quantity: d.amount, expires_on: expiry.get(d.item_id) ?? null }))
  if (entries.length === 0) return { error: "Those items were removed from the pantry." }

  const { error } = await supabase.rpc("add_pantry_items", { p_household_id: household.id, p_items: entries })
  if (error) return { error: dbError("undoCook", error) }

  revalidatePath("/pantry")
  revalidatePath("/activity")
  return {}
}

/** Spoonacular's photos only: their terms let us keep a recipe's id, title and image. */
const spoonacularImage = z
  .string()
  .max(300)
  .regex(/^https:\/\/([a-z0-9-]+\.)?spoonacular\.com\//i)
  .nullable()

const saveInput = z.object({
  ref: refSchema,
  title: z.string().trim().min(1).max(200),
  image: spoonacularImage.optional(),
})

/**
 * Saves a recipe for the whole household: a bookmark, never a copy. Spoonacular's are kept
 * as id, title and image (all their terms allow); ours by id. Saving twice is fine.
 */
export async function saveRecipe(ref: string, title: string, image: string | null = null): Promise<ActionResult> {
  const parsed = saveInput.safeParse({ ref, title, image })
  if (!parsed.success) return { error: "Couldn't save that recipe." }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  const recipe = parsed.data.ref
  const { error } =
    recipe.kind === "spoonacular"
      ? await supabase.from("saved_recipes").upsert(
          {
            household_id: household.id,
            recipe_id: recipe.id,
            title: parsed.data.title,
            image_url: parsed.data.image ?? null,
          },
          { onConflict: "household_id,recipe_id", ignoreDuplicates: true },
        )
      : await supabase.from("saved_recipes").upsert(
          { household_id: household.id, local_recipe_id: recipe.id, title: parsed.data.title },
          { onConflict: "household_id,local_recipe_id", ignoreDuplicates: true },
        )
  if (error) return { error: dbError("saveRecipe", error) }

  revalidatePath("/recipes", "layout")
  return {}
}

export async function unsaveRecipe(ref: string): Promise<ActionResult> {
  const parsed = refSchema.safeParse(ref)
  if (!parsed.success) return { error: "Couldn't unsave that recipe." }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  const recipe = parsed.data
  const query = supabase.from("saved_recipes").delete().eq("household_id", household.id)
  const { error } = await (recipe.kind === "spoonacular"
    ? query.eq("recipe_id", recipe.id)
    : query.eq("local_recipe_id", recipe.id))
  if (error) return { error: dbError("unsaveRecipe", error) }

  revalidatePath("/recipes", "layout")
  return {}
}
