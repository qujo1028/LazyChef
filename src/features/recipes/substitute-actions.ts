"use server"

import { z } from "zod"

import { requireHousehold, requireViewer } from "@/features/household/queries"
import { localDateKey } from "@/features/pantry/dates"
import { getPantryItems } from "@/features/pantry/queries"

import { buildPantryIndex } from "./match"
import { suggestSwaps, type SwapResult } from "./substitute"

const input = z.object({
  ingredientName: z.string().trim().min(1).max(80),
  recipeTitle: z.string().trim().max(120),
})

/** Swap suggestions for one ingredient of a recipe (vetted table + AI pick; see substitute.ts). */
export async function getSwaps(ingredientName: string, recipeTitle: string): Promise<SwapResult> {
  await requireViewer()
  const parsed = input.safeParse({ ingredientName, recipeTitle })
  if (!parsed.success) return { status: "error", message: "Pick an ingredient to swap." }
  const { household } = await requireHousehold()
  const items = await getPantryItems(household.id)
  return suggestSwaps({ ...parsed.data, pantry: buildPantryIndex(items, localDateKey()) })
}
