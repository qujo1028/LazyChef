import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { revokeAppleTokens } from "@/features/auth/apple-tokens"
import { PHOTO_BUCKET } from "@/features/recipes/local"
import { getAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/types/database"

// The account deletion both the web (deleteAccount server action) and the app
// (POST /api/account/delete) run. The caller has already checked who's asking.

export const DELETE_FAILED = "Couldn't delete your account. Try again in a minute."
export const DELETE_NOT_CONFIGURED = "Deleting accounts isn't set up on this server yet (SUPABASE_SECRET_KEY is missing)."

export type DeleteAccountResult =
  | { ok: true; usedApple: boolean; appleRevoked: boolean }
  | { ok: false; code: "not_configured" | "failed"; error: string }

export type DeleteAccountDeps = {
  admin?: SupabaseClient<Database> | null
  revokeApple?: (userId: string) => Promise<{ usedApple: boolean; revoked: boolean }>
}

/**
 * Deletes `userId`'s account (App Store guideline 5.1.1(v)). `supabase` acts as that person, so the
 * household list is read under RLS. Deleting the auth user does the rest in the database
 * (supabase/migrations/*_account_deletion.sql): households they were alone in are deleted, shared ones
 * pass to the next owner and keep their data with the person's name taken off. Then this removes the
 * deleted households' recipe photos, which live in Storage. Apple tokens are revoked first.
 */
export async function deleteAccountCore(
  userId: string,
  supabase: SupabaseClient<Database>,
  deps: DeleteAccountDeps = {},
): Promise<DeleteAccountResult> {
  const admin = deps.admin === undefined ? getAdminClient() : deps.admin
  if (!admin) return { ok: false, code: "not_configured", error: DELETE_NOT_CONFIGURED }

  const { data: memberships, error: listError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
  if (listError) {
    console.error("deleteAccount: listing households failed", listError.message)
    return { ok: false, code: "failed", error: DELETE_FAILED }
  }

  // Apple requires revoking Sign in with Apple tokens. The stored token is deleted with
  // the user, so this goes first; it never fails the deletion.
  const apple = await (deps.revokeApple ?? revokeAppleTokens)(userId)

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    console.error("deleteAccount: deleting the auth user failed", error.message)
    return { ok: false, code: "failed", error: DELETE_FAILED }
  }

  await removeDeletedHouseholdPhotos(
    admin,
    memberships.map((m) => m.household_id),
  )
  return { ok: true, usedApple: apple.usedApple, appleRevoked: apple.revoked }
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
