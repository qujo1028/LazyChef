import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { Database } from "@/types/database"
import { getSupabaseConfig } from "./config"

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create a new one per request; it acts as the signed-in user, so RLS applies.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const { url, publishableKey } = getSupabaseConfig()

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components can't set cookies. That's fine: proxy.ts
          // refreshes the session on every request.
        }
      },
    },
  })
}
