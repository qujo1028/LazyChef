import type { EmailOtpType } from "@supabase/supabase-js"
import { after, NextResponse, type NextRequest } from "next/server"

import { storeAppleRefreshToken } from "@/features/auth/apple-tokens"
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
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        // Sign in with Apple's web page: keep Apple's refresh token, when Supabase passes one on,
        // so deleting the account can revoke it. Runs after the redirect is sent.
        if (searchParams.get("provider") === "apple" && data.session?.provider_refresh_token) {
          const { user, provider_refresh_token: token } = data.session
          after(() => storeAppleRefreshToken(user.id, token))
        }
        return NextResponse.redirect(new URL(next, origin))
      }
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
