import "server-only"

import type { createClient } from "@/lib/supabase/server"

import type { BarcodeMemory } from "./types"

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Saves (or renames) the household's barcodes. Never fails the caller: it's a convenience. */
export async function rememberBarcodes(supabase: Supabase, householdId: string, rows: readonly BarcodeMemory[]) {
  // Last one wins when the same code shows up twice.
  const byCode = new Map(rows.map((row) => [row.code, row]))
  if (byCode.size === 0) return
  const { error } = await supabase
    .from("household_barcodes")
    .upsert(
      [...byCode.values()].map((row) => ({ household_id: householdId, ...row })),
      { onConflict: "household_id,code" },
    )
  if (error) console.error("Remembering barcodes failed:", error.code ?? "", error.message)
}
