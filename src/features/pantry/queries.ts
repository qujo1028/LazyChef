import "server-only"

import { cache } from "react"

import { getHouseholdMembers } from "@/features/household/queries"
import { createClient } from "@/lib/supabase/server"
import { localDateKey } from "./dates"
import type { PantryItem, PantryMember } from "./types"

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

/** What the pantry page needs: the items, who's who, and when/what day it was read. */
export async function getPantrySnapshot(householdId: string): Promise<{
  items: PantryItem[]
  members: PantryMember[]
  /** Read time (ms), taken before the query so rows changed meanwhile count as newer. */
  fetchedAt: number
  /** The server's date; the browser switches to its own after hydrating. */
  today: string
}> {
  const fetchedAt = Date.now()
  const [items, members] = await Promise.all([getPantryItems(householdId), getHouseholdMembers(householdId)])
  return {
    items,
    members: members.map(({ userId, displayName }) => ({ userId, displayName })),
    fetchedAt,
    today: localDateKey(new Date(fetchedAt)),
  }
}
