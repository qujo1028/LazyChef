"use server"

import type { SupabaseClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

import { requireViewer } from "@/features/household/queries"
import { PHOTO_BUCKET } from "@/features/recipes/local"
import { getAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

const FAILED = "Couldn't delete your account. Try again in a minute."

/**
 * Deletes the signed-in person's account (App Store guideline 5.1.1(v)). Deleting the
 * auth user does the rest in the database (supabase/migrations/*_account_deletion.sql):
 * households they were alone in are deleted, shared ones pass to the next owner and keep
 * their data with the person's name taken off. Then this removes the deleted households'
 * recipe photos, which live in Storage, and signs out.
 */
export async function deleteAccount(): Promise<{ error: string } | undefined> {
  const viewer = await requireViewer()
  const admin = getAdminClient()
  if (!admin) return { error: "Deleting accounts isn't set up on this server yet (SUPABASE_SECRET_KEY is missing)." }

  const supabase = await createClient()
  const { data: memberships, error: listError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", viewer.id)
  if (listError) {
    console.error("deleteAccount: listing households failed", listError.message)
    return { error: FAILED }
  }

  const { error } = await admin.auth.admin.deleteUser(viewer.id)
  if (error) {
    console.error("deleteAccount: deleting the auth user failed", error.message)
    return { error: FAILED }
  }

  await removeDeletedHouseholdPhotos(
    admin,
    memberships.map((m) => m.household_id),
  )
  // The user is gone, so only clear this browser's session cookies.
  await supabase.auth.signOut({ scope: "local" })
  redirect("/login?deleted=1")
}

/** Photos are stored as "<household id>/<file>". Only households that no longer exist lose theirs. */
async function removeDeletedHouseholdPhotos(admin: SupabaseClient<Database>, householdIds: string[]) {
  if (householdIds.length === 0) return
  const { data: remaining, error } = await admin.from("households").select("id").in("id", householdIds)
  if (error) {
    console.error("deleteAccount: checking households failed; photos left in place", error.message)
    return
  }
  const kept = new Set(remaining.map((h) => h.id))
  const bucket = admin.storage.from(PHOTO_BUCKET)

  for (const householdId of householdIds.filter((id) => !kept.has(id))) {
    // Remove in pages until the folder is empty (capped, in case removal keeps failing quietly).
    for (let page = 0; page < 20; page++) {
      const { data: files, error: listError } = await bucket.list(householdId, { limit: 1000 })
      if (listError || !files?.length) {
        if (listError) console.error("deleteAccount: listing photos failed", householdId, listError.message)
        break
      }
      const { error: removeError } = await bucket.remove(files.map((file) => `${householdId}/${file.name}`))
      if (removeError) {
        console.error("deleteAccount: removing photos failed", householdId, removeError.message)
        break
      }
    }
  }
}
