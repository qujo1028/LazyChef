import "server-only"

import { adminDb, toNumber, unwrap } from "@/features/admin/stats"
import type { Json } from "@/types/database"

// The admin audit log: who did what in the dashboard. Append-only in the database.

/**
 * Records an admin action and returns its id. THROWS if it can't be saved, so call it before
 * the action itself and let the failure stop it (fail closed).
 */
export async function logAdminAction(
  viewer: { id: string; email: string | null },
  action: string,
  target: string,
  details: Record<string, unknown> = {},
): Promise<number> {
  const id = unwrap(
    await adminDb().rpc("admin_log_action", {
      p_admin_user_id: viewer.id,
      p_admin_email: viewer.email,
      p_action: action,
      p_target: target,
      p_details: details as Json,
    }),
  )
  return toNumber(id)
}

export type AdminAction = {
  id: number
  at: string
  adminUserId: string | null
  adminEmail: string | null
  action: string
  target: string
  details: Record<string, unknown>
}

/** The latest audit entries, newest first. */
export async function getRecentAdminActions(limit = 50): Promise<AdminAction[]> {
  const rows = unwrap(await adminDb().rpc("admin_audit_recent", { p_limit: limit })) ?? []
  return rows.map((r) => ({
    id: toNumber(r.id),
    at: r.at,
    adminUserId: r.admin_user_id,
    adminEmail: r.admin_email,
    action: r.action,
    target: r.target,
    details:
      r.details && typeof r.details === "object" && !Array.isArray(r.details) ? (r.details as Record<string, unknown>) : {},
  }))
}
