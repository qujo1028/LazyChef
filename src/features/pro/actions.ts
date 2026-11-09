"use server"

import { revalidatePath } from "next/cache"

import { requireViewer } from "@/features/household/queries"
import { takeRateLimit } from "@/lib/rate-limit"
import { isProSyncConfigured, syncSubscription } from "./sync"

export type RefreshProResult = { pro: boolean } | { error: string }

/**
 * After a purchase or restore in the app: fetch my state from RevenueCat now instead of
 * waiting for the webhook, and re-render with it.
 */
export async function refreshPro(): Promise<RefreshProResult> {
  const viewer = await requireViewer()
  if (!isProSyncConfigured()) return { error: "Pro will switch on in a moment." }
  if (!(await takeRateLimit("pro_sync"))) return { error: "Pro will switch on in a moment." }
  try {
    const row = await syncSubscription(viewer.id)
    revalidatePath("/", "layout")
    return { pro: Boolean(row?.has_entitlement && (!row.expires_at || Date.parse(row.expires_at) > Date.now())) }
  } catch (error) {
    console.error("Refreshing Pro failed:", error instanceof Error ? error.message : error)
    return { error: "Couldn't check your subscription. Pro will switch on in a moment." }
  }
}
