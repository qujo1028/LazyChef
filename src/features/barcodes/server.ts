import "server-only"

import type { createClient } from "@/lib/supabase/server"

import type { BarcodeMemory } from "./types"

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Saves (or renames) the household's barcodes. Never fails the caller: it's a convenience.
 * New codes are inserted and known ones updated separately, because members may only
 * change a code's name and amount (an upsert would also try to set household_id and code).
 */
export async function rememberBarcodes(supabase: Supabase, householdId: string, rows: readonly BarcodeMemory[]) {
  // Last one wins when the same code shows up twice.
  const byCode = new Map(rows.map((row) => [row.code, row]))
  if (byCode.size === 0) return

  const { data: known, error: readError } = await supabase
    .from("household_barcodes")
    .select("code")
    .eq("household_id", householdId)
    .in("code", [...byCode.keys()])
  if (readError) {
    console.error("Remembering barcodes failed:", readError.code ?? "", readError.message)
    return
  }
  const existing = new Set(known.map((row) => row.code))

  const fresh = [...byCode.values()].filter((row) => !existing.has(row.code))
  const writes = [
    fresh.length > 0
      ? supabase.from("household_barcodes").insert(fresh.map((row) => ({ household_id: householdId, ...row })))
      : null,
    ...[...byCode.values()]
      .filter((row) => existing.has(row.code))
      .map(({ code, name, quantity, unit }) =>
        supabase.from("household_barcodes").update({ name, quantity, unit }).eq("household_id", householdId).eq("code", code),
      ),
  ]
  for (const { error } of await Promise.all(writes.filter((write) => write !== null))) {
    // 23505: a housemate saved the same code a moment ago; theirs stands.
    if (error && error.code !== "23505") console.error("Remembering barcodes failed:", error.code ?? "", error.message)
  }
}
