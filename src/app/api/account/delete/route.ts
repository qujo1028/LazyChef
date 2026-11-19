import "server-only"

import { handleDeleteAccount } from "@/features/account/api"
import { methodNotAllowed } from "@/lib/supabase/bearer"

// Account deletion for the Expo app (APP_API.deleteAccount). Bearer auth, no cookies, so it's left
// out of the proxy matcher. No CORS headers: only the native app calls this, never a browser page.
export const dynamic = "force-dynamic"

export function POST(request: Request) {
  return handleDeleteAccount(request)
}

export const GET = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
