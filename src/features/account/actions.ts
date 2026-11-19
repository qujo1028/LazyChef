"use server"

import { redirect } from "next/navigation"

import { requireViewer } from "@/features/household/queries"
import { createClient } from "@/lib/supabase/server"

import { deleteAccountCore } from "./delete"

/**
 * Deletes the signed-in person's account (see deleteAccountCore in ./delete.ts), then signs this
 * browser out and goes to the login page.
 */
export async function deleteAccount(): Promise<{ error: string } | undefined> {
  const viewer = await requireViewer()
  const supabase = await createClient()
  const result = await deleteAccountCore(viewer.id, supabase)
  if (!result.ok) return { error: result.error }

  // The user is gone, so only clear this browser's session cookies.
  await supabase.auth.signOut({ scope: "local" })
  // Apple asks apps to tell people how to remove the app from their Apple ID when it couldn't be
  // revoked for them (TN3194).
  redirect(result.usedApple && !result.appleRevoked ? "/login?deleted=apple" : "/login?deleted=1")
}
