"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireHousehold } from "@/features/household/queries"
import { findIngredient, guessCategory, normalizeIngredientName } from "@/lib/ingredients/catalog"
import { CATEGORIES, type Category } from "@/lib/ingredients/types"
import { createClient } from "@/lib/supabase/server"
import { convertQuantity, normalizeUnit } from "@/lib/units"
import type { Database } from "@/types/database"
import { categoryOverrides, planAdditions, roundQuantity } from "./merge"
import { resolveItems, type ResolveResult } from "./resolve"
import type { ActionResult, AddItemsSummary, NewPantryItem, PantryItem, PantryItemFields } from "./types"

type Supabase = Awaited<ReturnType<typeof createClient>>

const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [Category, ...Category[]]

const itemId = z.uuid("That item doesn't exist anymore.")
const name = z.string().trim().min(1, "Give it a name.").max(80, "Keep names under 80 characters.")
const quantity = z.number().nonnegative("Amounts can't be negative.").max(1_000_000, "That amount looks too big.")
const unit = z.string().trim().min(1, "Pick a unit.").max(24)
const category = z.enum(CATEGORY_VALUES)
const date = z.iso.date("Pick a valid date.")

const newItemSchema = z.object({
  name,
  quantity: quantity.nullable(),
  unit,
  category,
  expires_on: date.nullable(),
  is_staple: z.boolean(),
  ingredient_id: z.number().int().positive().nullable(),
  category_changed: z.boolean(),
})

const fieldsSchema = z.strictObject({
  name: name.optional(),
  quantity: quantity.nullable().optional(),
  unit: unit.optional(),
  category: category.optional(),
  expires_on: date.nullable().optional(),
  is_staple: z.boolean().optional(),
})

const REMOVED = "Someone already removed that item."

/** Messages our own SQL functions raise for people to read (see the pantry migration). */
const READABLE_CODES = new Set(["P0001", "P0002"])

/** A database error as something to show: ours as is, anything else logged and replaced. */
function dbError(action: string, error: { message: string; code?: string }): string {
  if (error.code && READABLE_CODES.has(error.code)) return error.message
  console.error(`${action} failed:`, error.code ?? "", error.message)
  return "That didn't go through. Check your connection and try again."
}

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check what you entered."
}

function canonicalUnit(value: string) {
  return normalizeUnit(value) ?? value
}

async function saveCategoryOverrides(
  supabase: Supabase,
  householdId: string,
  overrides: { ingredient_key: string; category: Category }[],
) {
  if (overrides.length === 0) return
  const updated_at = new Date().toISOString()
  const { error } = await supabase
    .from("category_overrides")
    .upsert(
      overrides.map((o) => ({ household_id: householdId, ...o, updated_at })),
      { onConflict: "household_id,ingredient_key" },
    )
  // The items are saved either way; a missed category fix isn't worth failing over.
  if (error) console.error("Couldn't save category fixes:", error.message)
}

/** Tops up what's already there, inserts the rest, in one transaction. */
async function addToPantry(householdId: string, items: NewPantryItem[]): Promise<ActionResult<AddItemsSummary>> {
  const supabase = await createClient()
  const { data: existing, error: loadError } = await supabase
    .from("pantry_items")
    .select("id, name, quantity, unit, ingredient_id")
    .eq("household_id", householdId)
    .order("created_at")
  if (loadError) return { error: dbError("Loading the pantry", loadError) }

  const plan = planAdditions(items, existing, { normalize: normalizeIngredientName, convert: convertQuantity })
  if (plan.entries.length > 0) {
    const { error } = await supabase.rpc("add_pantry_items", { p_household_id: householdId, p_items: plan.entries })
    if (error) return { error: dbError("add_pantry_items", error) }
  }

  await saveCategoryOverrides(supabase, householdId, categoryOverrides(items, normalizeIngredientName))
  revalidatePath("/pantry")
  return { added: plan.added, toppedUp: plan.toppedUp, alreadyOnHand: plan.alreadyOnHand }
}

/** Parses typed/pasted text into items to review (categories, amounts, ingredient ids). */
export async function previewItems(text: string): Promise<ActionResult<ResolveResult>> {
  const parsed = z
    .string()
    .trim()
    .min(1, "Type something to add.")
    .max(5000, "That's a lot at once. Try a shorter list.")
    .safeParse(text)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { household } = await requireHousehold()
  try {
    const result = await resolveItems(household.id, parsed.data)
    if (result.items.length === 0) return { error: "Type something to add, like “2 lbs chicken breast”." }
    return result
  } catch (error) {
    console.error("previewItems failed:", error)
    return { error: "Couldn't read that list. Try again." }
  }
}

/** Adds reviewed items, topping up matching ones. Returns counts for a toast. */
export async function addItems(items: NewPantryItem[]): Promise<ActionResult<AddItemsSummary>> {
  const parsed = z.array(newItemSchema).min(1, "Nothing to add.").max(100, "Add up to 100 items at a time.").safeParse(items)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { household } = await requireHousehold()
  return addToPantry(
    household.id,
    parsed.data.map((item) => ({
      ...item,
      unit: canonicalUnit(item.unit),
      ingredient_id: item.ingredient_id ?? findIngredient(item.name)?.id ?? null,
    })),
  )
}

/** One-tap staples (salt, olive oil, …): always on hand, not tracked. Skips ones you have. */
export async function addStaples(names: string[]): Promise<ActionResult<AddItemsSummary>> {
  const parsed = z.array(name).min(1, "Pick at least one staple.").max(30).safeParse(names)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  const keys = parsed.data.map(normalizeIngredientName)
  const { data: overrides } = await supabase
    .from("category_overrides")
    .select("ingredient_key, category")
    .eq("household_id", household.id)
    .in("ingredient_key", keys)
  const fixed = new Map(overrides?.map((o) => [o.ingredient_key, o.category]))

  return addToPantry(
    household.id,
    parsed.data.map((staple, i) => {
      const entry = findIngredient(staple)
      return {
        name: staple,
        quantity: null,
        unit: "count",
        category: fixed.get(keys[i]) ?? entry?.category ?? guessCategory(staple),
        expires_on: null,
        is_staple: true,
        ingredient_id: entry?.id ?? null,
        category_changed: false,
      }
    }),
  )
}

/** Edits an item. Only send the fields that changed. A new category is remembered for the household. */
export async function updateItem(id: string, fields: PantryItemFields): Promise<ActionResult<{ item: PantryItem }>> {
  const parsedId = itemId.safeParse(id)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }
  const parsed = fieldsSchema.safeParse(fields)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { household } = await requireHousehold()
  const changes: Database["public"]["Tables"]["pantry_items"]["Update"] = { ...parsed.data }
  if (parsed.data.unit !== undefined) changes.unit = canonicalUnit(parsed.data.unit)
  if (parsed.data.quantity != null) changes.quantity = roundQuantity(parsed.data.quantity)
  // A renamed item may be a different ingredient now.
  if (parsed.data.name !== undefined) changes.ingredient_id = findIngredient(parsed.data.name)?.id ?? null
  if (Object.keys(changes).length === 0) return { error: "Nothing to save." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pantry_items")
    .update(changes)
    .eq("id", parsedId.data)
    .eq("household_id", household.id)
    .select()
    .maybeSingle()
  if (error) return { error: dbError("updateItem", error) }
  if (!data) return { error: REMOVED }

  if (parsed.data.category !== undefined) {
    const key = normalizeIngredientName(data.name).slice(0, 80)
    if (key) await saveCategoryOverrides(supabase, household.id, [{ ingredient_key: key, category: parsed.data.category }])
  }
  revalidatePath("/pantry")
  return { item: data }
}

/** Changes the amount relative to what's there now (so housemates' changes compose). Never below 0. */
export async function adjustQuantity(id: string, delta: number): Promise<ActionResult<{ quantity: number }>> {
  const parsedId = itemId.safeParse(id)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }
  const parsedDelta = z
    .number()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((d) => d !== 0, "Enter an amount.")
    .safeParse(delta)
  if (!parsedDelta.success) return { error: firstIssue(parsedDelta.error) }

  await requireHousehold()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("adjust_pantry_quantity", {
    p_item_id: parsedId.data,
    p_delta: parsedDelta.data,
  })
  if (error) return { error: dbError("adjust_pantry_quantity", error) }
  // null when the item is gone (or not visible to us). Numerics can arrive as strings.
  if (data === null || data === undefined) return { error: REMOVED }
  const quantity = Number(data)

  revalidatePath("/pantry")
  return { quantity }
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const parsedId = itemId.safeParse(id)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  const { error } = await supabase
    .from("pantry_items")
    .delete()
    .eq("id", parsedId.data)
    .eq("household_id", household.id)
  if (error) return { error: dbError("deleteItem", error) }

  revalidatePath("/pantry")
  return {}
}
