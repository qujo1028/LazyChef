import "server-only"

import { adminDb, toNumber, unwrap } from "@/features/admin/stats"

// Server-only wrappers for looking someone up and giving or taking away free Pro (a comp).
// Call them after requireAdmin(), and write an audit entry for each (see audit.ts).

export type SupportHousehold = { id: string; name: string; role: string; members: number }

export type SupportUser = {
  userId: string
  email: string
  displayName: string | null
  createdAt: string | null
  lastSignInAt: string | null
  /** Where their Pro comes from: their own subscription, a comp, a housemate, or none. */
  proSource: "subscription" | "comp" | "household" | null
  compExpiresAt: string | null
  compNote: string | null
  households: SupportHousehold[]
}

export function parseHouseholds(value: unknown): SupportHousehold[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((h) => {
    if (!h || typeof h !== "object") return []
    const o = h as Record<string, unknown>
    if (typeof o.id !== "string") return []
    return [
      {
        id: o.id,
        name: typeof o.name === "string" ? o.name : "",
        role: typeof o.role === "string" ? o.role : "member",
        members: toNumber(o.members as number | string | null),
      },
    ]
  })
}

function parseProSource(value: string | null): SupportUser["proSource"] {
  return value === "subscription" || value === "comp" || value === "household" ? value : null
}

/** The one person with exactly this email (any case), or null. Throws on input that isn't an email. */
export async function findUserByEmail(email: string): Promise<SupportUser | null> {
  const rows = unwrap(await adminDb().rpc("admin_find_user", { p_email: email })) ?? []
  const r = rows[0]
  if (!r) return null
  return {
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    createdAt: r.created_at,
    lastSignInAt: r.last_sign_in_at,
    proSource: parseProSource(r.pro_source),
    compExpiresAt: r.comp_expires_at,
    compNote: r.comp_note,
    households: parseHouseholds(r.households),
  }
}

/** Gives free Pro. `expiresAt` is an ISO timestamp in the future, or null for no end date. */
export async function grantComp(userId: string, expiresAt: string | null, note: string | null): Promise<void> {
  unwrap(await adminDb().rpc("admin_grant_comp", { p_user_id: userId, p_expires_at: expiresAt, p_note: note }))
}

/** Takes a comp away. True when there was one. */
export async function revokeComp(userId: string): Promise<boolean> {
  return unwrap(await adminDb().rpc("admin_revoke_comp", { p_user_id: userId })) === true
}
