import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import type { PantryItem } from "./types"

/** Everything in a household's pantry (RLS limits it to households you belong to). */
export const getPantryItems = cache(async (householdId: string): Promise<PantryItem[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pantry_items")
    .select("*")
    .eq("household_id", householdId)
    .order("name")
  if (error) throw error
  return data
})
