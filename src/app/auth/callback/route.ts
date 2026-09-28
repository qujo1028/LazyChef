import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { safeNext } from "@/lib/safe-next"
import { createClient } from "@/lib/supabase/server"

/**
 * Where Google sign-in and email links land. Handles both link styles:
 * ?code= (OAuth / default email templates) and ?token_hash=&type= (the
 * email templates in the README, which also work in a different browser).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const next = safeNext(searchParams.get("next"))
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const providerError = searchParams.get("error_description") ?? searchParams.get("error")

  if (!providerError) {
    const supabase = await createClient()
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) return NextResponse.redirect(new URL(next, origin))
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      if (!error) {
        const destination = type === "recovery" ? "/reset-password" : next
        return NextResponse.redirect(new URL(destination, origin))
      }
    }
  }

  const message =
    providerError ??
    "That link didn't work. It may have expired or been opened in a different browser. Try signing in."
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin))
}
