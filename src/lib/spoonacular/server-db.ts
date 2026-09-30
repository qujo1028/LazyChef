import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

// The Spoonacular cache and usage tables are closed to every signed-in user. Only
// the server reaches them, with the secret key (service_role, bypasses RLS). Never
// import this from a client component, and never use it for household data.

let client: SupabaseClient<Database> | null | undefined

/** A Supabase client with SUPABASE_SECRET_KEY, or null when the key (or URL) isn't set. */
export function getServerDb(): SupabaseClient<Database> | null {
  if (client !== undefined) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  client =
    url && secret
      ? createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      : null
  return client
}
