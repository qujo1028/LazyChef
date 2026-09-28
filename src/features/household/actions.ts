"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"

import { normalizeInviteCode, PENDING_INVITE_COOKIE } from "@/lib/invite"
import { createClient } from "@/lib/supabase/server"
import { requireViewer } from "./queries"

export type ActionState = { error?: string; saved?: boolean } | undefined

const householdName = z
  .string()
  .trim()
  .min(1, "Give your household a name.")
  .max(60, "Keep it under 60 characters.")
const uuid = z.uuid()

export async function createHousehold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = householdName.safeParse(formData.get("name"))
  if (!name.success) return { error: name.error.issues[0].message }

  await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase.rpc("create_household", { p_name: name.data })
  if (error) return { error: error.message }

  redirect("/household?welcome=1")
}

export async function joinHousehold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const code = normalizeInviteCode(String(formData.get("code") ?? ""))
  if (code.length !== 8) return { error: "Invite codes have 8 letters and numbers, like K7QX-M2PA." }

  await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase.rpc("join_household", { p_code: code })
  if (error) return { error: error.message }

  ;(await cookies()).delete(PENDING_INVITE_COOKIE)
  redirect("/pantry")
}

export async function dismissPendingInvite() {
  ;(await cookies()).delete(PENDING_INVITE_COOKIE)
  revalidatePath("/onboarding")
}

export async function switchHousehold(householdId: string) {
  const viewer = await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .update({ active_household_id: uuid.parse(householdId) })
    .eq("id", viewer.id)
  if (error) throw new Error(error.message)

  revalidatePath("/", "layout")
  redirect("/pantry")
}

export async function renameHousehold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = householdName.safeParse(formData.get("name"))
  if (!name.success) return { error: name.error.issues[0].message }

  await requireViewer()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("households")
    .update({ name: name.data })
    .eq("id", uuid.parse(formData.get("householdId")))
    .select("id")
  if (error) return { error: error.message }
  if (data.length === 0) return { error: "Only the household owner can rename it." }

  revalidatePath("/", "layout")
  return { saved: true }
}

export async function regenerateInviteCode(householdId: string): Promise<ActionState> {
  await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase.rpc("regenerate_invite_code", { p_household_id: uuid.parse(householdId) })
  if (error) return { error: error.message }

  revalidatePath("/household")
  return { saved: true }
}

export async function removeMember(householdId: string, userId: string): Promise<ActionState> {
  await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase.rpc("remove_member", {
    p_household_id: uuid.parse(householdId),
    p_user_id: uuid.parse(userId),
  })
  if (error) return { error: error.message }

  revalidatePath("/household")
  return { saved: true }
}

export async function leaveHousehold(householdId: string): Promise<ActionState> {
  await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase.rpc("leave_household", { p_household_id: uuid.parse(householdId) })
  if (error) return { error: error.message }

  revalidatePath("/", "layout")
  redirect("/")
}

export async function updateDisplayName(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = z
    .string()
    .trim()
    .min(1, "Your name can't be empty.")
    .max(60, "Keep it under 60 characters.")
    .safeParse(formData.get("displayName"))
  if (!name.success) return { error: name.error.issues[0].message }

  const viewer = await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase.from("profiles").update({ display_name: name.data }).eq("id", viewer.id)
  if (error) return { error: error.message }

  revalidatePath("/", "layout")
  return { saved: true }
}
