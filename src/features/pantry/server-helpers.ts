import "server-only"

import type { Category } from "@/lib/ingredients/types"
import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Messages our own SQL functions raise for people to read (see the pantry and list migrations). */
const READABLE_CODES = new Set(["P0001", "P0002"])

/** A database error as something to show: ours as is, anything else logged and replaced. */
export function dbError(action: string, error: { message: string; code?: string }): string {
  if (error.code && READABLE_CODES.has(error.code)) return error.message
  console.error(`${action} failed:`, error.code ?? "", error.message)
  return "That didn't go through. Check your connection and try again."
}

/** Remembers the household's category fixes. Never fails the caller: a missed fix isn't worth it. */
export async function saveCategoryOverrides(
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
  if (error) console.error("Couldn't save category fixes:", error.message)
}
