"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireHousehold } from "@/features/household/queries"
import { categoryOverrides, planAdditions, roundQuantity } from "@/features/pantry/merge"
import { canonicalUnit, category, firstIssue, itemId, name, newItemSchema, quantity } from "@/features/pantry/schemas"
import { dbError, saveCategoryOverrides } from "@/features/pantry/server-helpers"
import type { AddItemsSummary, NewPantryItem } from "@/features/pantry/types"
import { findIngredient, guessCategory, normalizeIngredientName } from "@/lib/ingredients/catalog"
import { parseLines } from "@/lib/ingredients/parse-line"
import type { Category } from "@/lib/ingredients/types"
import { createClient } from "@/lib/supabase/server"
import { convertQuantity } from "@/lib/units"
import type { Database, Json } from "@/types/database"

import { listUnit } from "./display"
import { planListAdditions } from "./plan"
import type { ActionResult, AddToListSummary, ListItem, NewListLine } from "./types"

type Supabase = Awaited<ReturnType<typeof createClient>>

const REMOVED = "Someone already removed that item."
const MAX_LINES = 100

const unit = z.string().trim().max(24).nullable()
const note = z.string().trim().max(200, "Keep notes under 200 characters.").nullable()

const lineSchema = z.object({
  name,
  quantity: quantity.nullable(),
  unit,
  /** Omit to work it out from the household's fixes and the ingredient library. */
  category: category.optional(),
  ingredient_id: z.number().int().positive().nullable().optional(),
  note: note.optional(),
  recipe_id: z.number().int().positive().nullable().optional(),
  recipe_title: z.string().trim().max(200).nullable().optional(),
})

type LineInput = z.infer<typeof lineSchema>

const fieldsSchema = z.strictObject({
  name: name.optional(),
  quantity: quantity.positive("Amounts have to be more than 0.").nullable().optional(),
  unit: unit.optional(),
  category: category.optional(),
  note: note.optional(),
})

/** Categories for names: the household's own fixes first, then the ingredient library, then a guess. */
async function categoriesFor(supabase: Supabase, householdId: string, names: string[]) {
  const keys = names.map((n) => normalizeIngredientName(n).slice(0, 80))
  const wanted = [...new Set(keys.filter(Boolean))]
  const { data } = wanted.length
    ? await supabase.from("category_overrides").select("ingredient_key, category").eq("household_id", householdId).in("ingredient_key", wanted)
    : { data: [] }
  const fixed = new Map(data?.map((o) => [o.ingredient_key, o.category]))
  return names.map((n, i): { category: Category; ingredientId: number | null } => {
    const entry = findIngredient(n)
    return { category: fixed.get(keys[i]) ?? entry?.category ?? guessCategory(n), ingredientId: entry?.id ?? null }
  })
}

/** Plans the lines against what's already on the list and adds them in one call. */
async function addLines(householdId: string, inputs: LineInput[]): Promise<ActionResult<AddToListSummary>> {
  const supabase = await createClient()
  const [known, open] = await Promise.all([
    categoriesFor(
      supabase,
      householdId,
      inputs.map((i) => i.name),
    ),
    supabase
      .from("shopping_list_items")
      .select("id, name, quantity, unit, ingredient_id")
      .eq("household_id", householdId)
      .is("checked_at", null)
      .order("created_at"),
  ])
  if (open.error) return { error: dbError("Loading the list", open.error) }

  const lines: NewListLine[] = inputs.map((input, i) => ({
    name: input.name,
    quantity: input.quantity,
    unit: listUnit(input.unit === null ? null : canonicalUnit(input.unit)),
    category: input.category ?? known[i].category,
    ingredient_id: input.ingredient_id ?? known[i].ingredientId,
    note: input.note ?? null,
    recipe_id: input.recipe_id ?? null,
    recipe_title: input.recipe_title ?? null,
  }))
  const plan = planListAdditions(
    lines,
    open.data.map((line) => ({ ...line, quantity: line.quantity === null ? null : Number(line.quantity) })),
    { normalize: normalizeIngredientName, convert: convertQuantity },
  )

  let ids: string[] = []
  if (plan.entries.length > 0) {
    const { data, error } = await supabase.rpc("add_to_shopping_list", {
      p_household_id: householdId,
      p_items: plan.entries as unknown as Json,
    })
    if (error) return { error: dbError("add_to_shopping_list", error) }
    // In entry order; only the new lines can be undone by deleting them.
    ids = (data ?? []).filter((_, i) => !("merge_into" in plan.entries[i]))
  }

  revalidatePath("/list")
  return { added: plan.added, toppedUp: plan.toppedUp, alreadyOnList: plan.alreadyOnList, ids }
}

/** Typed or pasted text ("2 lbs chicken breast, milk"). Library categories only: no Spoonacular points. */
export async function addListText(text: string): Promise<ActionResult<AddToListSummary>> {
  const parsed = z
    .string()
    .trim()
    .min(1, "Type something to add.")
    .max(5000, "That's a lot at once. Try a shorter list.")
    .safeParse(text)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { household } = await requireHousehold()
  const lines = parseLines(parsed.data)
    .slice(0, MAX_LINES)
    .filter((line) => line.name)
    .map((line) => ({ name: line.name.slice(0, 80), quantity: line.quantity, unit: line.unit }))
  if (lines.length === 0) return { error: "Type something to add, like “2 lbs chicken breast”." }
  return addLines(household.id, lines)
}

/** Structured lines: from the pantry ("Add to list"), a recipe, or Undo after a delete. */
export async function addListItems(lines: LineInput[]): Promise<ActionResult<AddToListSummary>> {
  const parsed = z.array(lineSchema).min(1, "Nothing to add.").max(MAX_LINES).safeParse(lines)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { household } = await requireHousehold()
  return addLines(household.id, parsed.data)
}

/** Checks a line off (or back on). The database stamps who and when. */
export async function setChecked(id: string, checked: boolean): Promise<ActionResult<{ item: ListItem }>> {
  const parsedId = itemId.safeParse(id)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }
  if (typeof checked !== "boolean") return { error: "Check what you entered." }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("shopping_list_items")
    .update({ checked_at: checked ? new Date().toISOString() : null })
    .eq("id", parsedId.data)
    .eq("household_id", household.id)
    .select()
    .maybeSingle()
  if (error) return { error: dbError("setChecked", error) }
  if (!data) return { error: "Someone already put that away or removed it." }

  revalidatePath("/list")
  return { item: data }
}

/** Edits a line. Only send the fields that changed. A new category is remembered for the household. */
export async function updateListItem(
  id: string,
  fields: z.input<typeof fieldsSchema>,
): Promise<ActionResult<{ item: ListItem }>> {
  const parsedId = itemId.safeParse(id)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }
  const parsed = fieldsSchema.safeParse(fields)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { household } = await requireHousehold()
  const changes: Database["public"]["Tables"]["shopping_list_items"]["Update"] = { ...parsed.data }
  if (parsed.data.unit !== undefined) changes.unit = listUnit(parsed.data.unit === null ? null : canonicalUnit(parsed.data.unit))
  if (parsed.data.quantity != null) changes.quantity = roundQuantity(parsed.data.quantity)
  if (parsed.data.note !== undefined) changes.note = parsed.data.note || null
  // A renamed line may be a different ingredient now.
  if (parsed.data.name !== undefined) changes.ingredient_id = findIngredient(parsed.data.name)?.id ?? null
  if (Object.keys(changes).length === 0) return { error: "Nothing to save." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("shopping_list_items")
    .update(changes)
    .eq("id", parsedId.data)
    .eq("household_id", household.id)
    .select()
    .maybeSingle()
  if (error) return { error: dbError("updateListItem", error) }
  if (!data) return { error: REMOVED }

  if (parsed.data.category !== undefined) {
    const key = normalizeIngredientName(data.name).slice(0, 80)
    if (key) await saveCategoryOverrides(supabase, household.id, [{ ingredient_key: key, category: parsed.data.category }])
  }
  revalidatePath("/list")
  return { item: data }
}

export async function deleteListItems(ids: string[]): Promise<ActionResult> {
  const parsed = z.array(itemId).min(1).max(MAX_LINES).safeParse(ids)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .in("id", parsed.data)
    .eq("household_id", household.id)
  if (error) return { error: dbError("deleteListItems", error) }

  revalidatePath("/list")
  return {}
}

export type PutAwaySummary = AddItemsSummary & { cleared: number }

/**
 * Puts a trip away: takes `listItemIds` off the list and adds `items` to the pantry (topping
 * up what's there) in one transaction. `items` can be empty ("Clear without adding"). If a
 * housemate already put some of these away, nothing changes and the error says so.
 */
export async function putAway(listItemIds: string[], items: NewPantryItem[]): Promise<ActionResult<PutAwaySummary>> {
  const parsedIds = z.array(itemId).min(1, "Nothing to put away.").max(200).safeParse(listItemIds)
  if (!parsedIds.success) return { error: firstIssue(parsedIds.error) }
  const parsedItems = z.array(newItemSchema).max(200, "Put away up to 200 items at a time.").safeParse(items)
  if (!parsedItems.success) return { error: firstIssue(parsedItems.error) }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  const incoming = parsedItems.data.map((item) => ({
    ...item,
    unit: canonicalUnit(item.unit),
    ingredient_id: item.ingredient_id ?? findIngredient(item.name)?.id ?? null,
  }))

  let plan = { entries: [] as unknown[], added: 0, toppedUp: 0, alreadyOnHand: 0 }
  if (incoming.length > 0) {
    const { data: existing, error: loadError } = await supabase
      .from("pantry_items")
      .select("id, name, quantity, unit, ingredient_id")
      .eq("household_id", household.id)
      .order("created_at")
    if (loadError) return { error: dbError("Loading the pantry", loadError) }
    plan = planAdditions(
      incoming,
      existing.map((item) => ({ ...item, quantity: item.quantity === null ? null : Number(item.quantity) })),
      { normalize: normalizeIngredientName, convert: convertQuantity },
    )
  }

  const ids = [...new Set(parsedIds.data)]
  const { error } = await supabase.rpc("complete_shopping_trip", {
    p_household_id: household.id,
    p_list_item_ids: ids,
    p_pantry_items: plan.entries as Json,
  })
  if (error) return { error: dbError("complete_shopping_trip", error) }

  await saveCategoryOverrides(supabase, household.id, categoryOverrides(incoming, normalizeIngredientName))
  revalidatePath("/list")
  revalidatePath("/pantry")
  return { added: plan.added, toppedUp: plan.toppedUp, alreadyOnHand: plan.alreadyOnHand, cleared: ids.length }
}
