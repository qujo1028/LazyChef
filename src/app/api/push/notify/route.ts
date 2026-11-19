import "server-only"

import { handleNotify } from "@/features/push/app-notify"
import { methodNotAllowed } from "@/lib/supabase/bearer"

// Pushes a phone action should trigger (APP_API.notify). Bearer auth, no cookies, so it's left out
// of the proxy matcher. No CORS headers: only the native app calls this, never a browser page.
export const dynamic = "force-dynamic"

export function POST(request: Request) {
  return handleNotify(request)
}

export const GET = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
