import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

// Supabase with SUPABASE_SECRET_KEY: bypasses every access rule and can manage auth users.
// Only for what a signed-in user can't do for themselves (deleting their own account).
// Never import this from a client component, and re-check who's asking before using it.

let client: SupabaseClient<Database> | null | undefined

/** The admin client, or null when the secret key (or URL) isn't set. */
export function getAdminClient(): SupabaseClient<Database> | null {
  if (client !== undefined) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  client =
    url && secret
      ? createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      : null
  return client
}
