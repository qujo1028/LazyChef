import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import { FREE_STATUS, type ProStatus } from "@lazychef/core/pro/status"

export type { ProStatus }

/** Pro status for the signed-in person in this household. Deduped per request. */
export const getProStatus = cache(async (householdId: string): Promise<ProStatus> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_pro_status", { p_household_id: householdId })
  const checkedAt = Date.now()
  if (error) {
    // Before the migration is applied (or on a hiccup), everyone is on the free plan.
    console.error("Loading Pro status failed:", error.message)
    return { ...FREE_STATUS, checkedAt }
  }
  const row = data?.[0]
  if (!row) return { ...FREE_STATUS, checkedAt }
  return {
    householdPro: row.household_pro,
    mePro: row.me_pro,
    meSource: row.me_source === "subscription" || row.me_source === "comp" ? row.me_source : null,
    sponsorName: row.sponsor_name,
    expiresAt: row.expires_at,
    willRenew: row.will_renew,
    periodType: row.period_type,
    store: row.store,
    billingIssueAt: row.billing_issue_at,
    managementUrl: row.management_url,
    checkedAt,
  }
})
