import { createBrowserClient } from "@supabase/ssr"

import type { Database } from "@/types/database"
import { getSupabaseConfig } from "./config"

/** Supabase client for Client Components. Returns a shared instance in the browser. */
export function createClient() {
  const { url, publishableKey } = getSupabaseConfig()
  return createBrowserClient<Database>(url, publishableKey)
}
