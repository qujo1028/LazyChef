"use client"

import { toast } from "sonner"

import { callAction } from "@/lib/call-action"
import { displayName } from "@/features/pantry/display"
import type { PantryItem } from "@/features/pantry/types"

import { addListItems } from "../actions"

/** Puts a pantry item on the shopping list (any amount) and says what happened. */
export async function addPantryItemToList(item: Pick<PantryItem, "name" | "category" | "ingredient_id">) {
  const result = await callAction(() =>
    addListItems([{ name: item.name, quantity: null, unit: null, category: item.category, ingredient_id: item.ingredient_id }]),
  )
  const name = displayName(item.name).toLowerCase()
  if (result.error !== undefined) toast.error(result.error)
  else if (result.added > 0) toast.success(`Added ${name} to the shopping list`)
  else toast.info(`${displayName(item.name)} is already on the list`)
}
