import "server-only"

import { getHouseholdMembers } from "@/features/household/queries"
import { localDateKey } from "@/features/pantry/dates"
import type { ExistingItem } from "@/features/pantry/merge"
import { createClient } from "@/lib/supabase/server"

import type { ListItem } from "./types"

/** What the list page needs: the lines, who's who, the pantry (for put-away hints), and when it was read. */
export async function getListSnapshot(householdId: string): Promise<{
  items: ListItem[]
  members: { userId: string; displayName: string }[]
  pantry: ExistingItem[]
  /** Read time (ms), taken before the queries so rows changed meanwhile count as newer. */
  fetchedAt: number
  today: string
}> {
  const fetchedAt = Date.now()
  const supabase = await createClient()
  const [list, pantry, members] = await Promise.all([
    supabase.from("shopping_list_items").select("*").eq("household_id", householdId).order("created_at"),
    supabase
      .from("pantry_items")
      .select("id, name, quantity, unit, ingredient_id")
      .eq("household_id", householdId)
      .order("created_at"),
    getHouseholdMembers(householdId),
  ])
  if (list.error) throw list.error
  if (pantry.error) throw pantry.error
  return {
    items: list.data,
    members: members.map(({ userId, displayName }) => ({ userId, displayName })),
    pantry: pantry.data.map((item) => ({ ...item, quantity: item.quantity === null ? null : Number(item.quantity) })),
    fetchedAt,
    today: localDateKey(new Date(fetchedAt)),
  }
}
