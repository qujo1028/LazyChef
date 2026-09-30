import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { PENDING_INVITE_COOKIE } from "@/lib/invite"
import { RATE_LIMITED_CODE } from "@/lib/rate-limit"
import { createClient } from "@/lib/supabase/server"
import type { Enums } from "@/types/database"

export type HouseholdRole = Enums<"household_role">

export type Membership = {
  role: HouseholdRole
  joinedAt: string
  household: { id: string; name: string; inviteCode: string }
}

/** The signed-in user, verified from the session JWT. Deduped per request. */
export const getViewer = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) return null
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null }
})

export const requireViewer = cache(async () => {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  return viewer
})

export const getHouseholdContext = cache(async () => {
  const viewer = await requireViewer()
  const supabase = await createClient()
  const [profile, memberships] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url, active_household_id")
      .eq("id", viewer.id)
      .maybeSingle(),
    supabase
      .from("household_members")
      .select("role, joined_at, household:households(id, name, invite_code)")
      .eq("user_id", viewer.id)
      .order("joined_at"),
  ])
  if (profile.error) throw profile.error
  if (memberships.error) throw memberships.error

  return {
    viewer,
    profile: profile.data,
    memberships: memberships.data.flatMap<Membership>(({ role, joined_at, household }) =>
      household
        ? [{ role, joinedAt: joined_at, household: { id: household.id, name: household.name, inviteCode: household.invite_code } }]
        : [],
    ),
  }
})

/** For pages inside the tab bar: the active household, or off to onboarding. */
export const requireHousehold = cache(async () => {
  const context = await getHouseholdContext()
  const active =
    context.memberships.find((m) => m.household.id === context.profile?.active_household_id) ??
    context.memberships[0]
  if (!active) redirect("/onboarding")
  return { ...context, household: active.household, role: active.role }
})

export async function getHouseholdMembers(householdId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("household_members")
    .select("user_id, role, joined_at, profile:profiles(display_name, avatar_url)")
    .eq("household_id", householdId)
    .order("joined_at")
  if (error) throw error
  return data.map((m) => ({
    userId: m.user_id,
    role: m.role,
    joinedAt: m.joined_at,
    displayName: m.profile?.display_name ?? "Housemate",
    avatarUrl: m.profile?.avatar_url ?? null,
  }))
}

/** The household behind an invite code, null for a wrong code, or "limited" after too many wrong ones. */
export async function getInvitePreview(code: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_invite_preview", { p_code: code })
  if (error?.code === RATE_LIMITED_CODE) return "limited" as const
  if (error) throw error
  return data[0] ?? null
}

/** An invite link opened before signing up (remembered in a cookie by the proxy). */
export async function getPendingInvite() {
  const code = (await cookies()).get(PENDING_INVITE_COOKIE)?.value
  if (!code) return null
  const preview = await getInvitePreview(code)
  return preview && preview !== "limited" && !preview.is_member ? { code, ...preview } : null
}
