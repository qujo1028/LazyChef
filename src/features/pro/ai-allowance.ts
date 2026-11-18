import "server-only"

import { createClient } from "@/lib/supabase/server"

import { allowanceResult, type AiLimited } from "./ai-allowance-core"

export type { AiLimited }

/**
 * Takes one of the household's free weekly AI uses (take_ai_allowance). Pro households are
 * never counted. Returns null to go ahead, or the result to return when the allowance is used
 * up. If the check itself fails (say the database is behind a deploy) it lets the call through:
 * the per-person hourly limit still applies. Call once per person-visible action, after cache
 * hits and refusals, never per retry.
 */
export async function takeAiAllowance(householdId: string): Promise<AiLimited | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("take_ai_allowance", { p_household_id: householdId })
    if (error) {
      console.error("[ai-allowance] check failed:", error.message)
      return null
    }
    return allowanceResult(data?.[0])
  } catch (error) {
    console.error("[ai-allowance] check failed:", error)
    return null
  }
}
