"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { z } from "zod"

import {
  APPLE_SIGN_IN_OFF,
  appleDisplayName,
  appleIdTokenInput,
  isAppleSignInEnabled,
  type AppleIdTokenInput,
} from "@/features/auth/apple"
import { storeAppleAuthorizationCode } from "@/features/auth/apple-tokens"
import { newPassword } from "@/features/auth/schemas"
import { nativeCallbackUrl } from "@/lib/native-callback"
import { safeNext } from "@/lib/safe-next"
import { createClient } from "@/lib/supabase/server"

export type AuthFormState = { error?: string; notice?: string; email?: string } | undefined

const email = z.email("Enter a valid email address.")

/** "https://host[:port]" if `value` is an http(s) URL, else null (e.g. Origin: null). */
function httpOrigin(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null
  } catch {
    return null
  }
}

/**
 * The site's public origin, for links in emails and OAuth redirects. Browsers
 * send Origin with every Server Action (Next.js checks it against the host), so
 * that's used first. Without it, fall back to the host Vercel's proxy forwards,
 * then NEXT_PUBLIC_SITE_URL. Supabase still only redirects to allow-listed URLs.
 */
async function siteOrigin() {
  const requestHeaders = await headers()
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0].trim()
  const host = forwardedHost || requestHeaders.get("host")
  const proto =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim() ||
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https")
  return (
    httpOrigin(requestHeaders.get("origin")) ??
    httpOrigin(host ? `${proto}://${host}` : null) ??
    httpOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    "http://localhost:3000"
  )
}

/** `provider` "apple" lets /auth/callback keep Apple's refresh token for account deletion. */
function callbackUrl(origin: string, next: string, provider?: "apple") {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}${provider ? `&provider=${provider}` : ""}`
}

/** Supabase's messages are written for developers; these are for housemates. */
function friendlyAuthError(message: string) {
  const known: [RegExp, string][] = [
    [/invalid login credentials/i, "That email and password don't match."],
    [/email not confirmed/i, "Confirm your email first. The link is in your inbox."],
    [/already registered|already exists/i, "There's already an account with that email. Try signing in."],
    [/email address not authorized/i, "Couldn't send the confirmation email. Supabase's built-in mailer only reaches your Supabase team (see README → Email)."],
    [/rate limit/i, "Too many attempts. Wait a few minutes and try again."],
    [/password should be at least/i, "Pick a longer password (at least 8 characters)."],
    [/password should contain/i, "Use an uppercase letter, a lowercase letter, a number and a symbol."],
  ]
  return known.find(([pattern]) => pattern.test(message))?.[1] ?? message
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const address = String(formData.get("email") ?? "").trim()
  const parsed = z
    .object({ email, password: z.string().min(1, "Enter your password.") })
    .safeParse({ email: address, password: formData.get("password") })
  if (!parsed.success) return { error: parsed.error.issues[0].message, email: address }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: friendlyAuthError(error.message), email: address }

  redirect(safeNext(formData.get("next")))
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const address = String(formData.get("email") ?? "").trim()
  const parsed = z
    .object({
      displayName: z.string().trim().min(1, "Tell your housemates what to call you.").max(60),
      email,
      password: newPassword,
    })
    .safeParse({
      displayName: formData.get("displayName"),
      email: address,
      password: formData.get("password"),
    })
  if (!parsed.success) return { error: parsed.error.issues[0].message, email: address }

  const next = safeNext(formData.get("next"), "/onboarding")
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: callbackUrl(await siteOrigin(), next),
    },
  })
  if (error) return { error: friendlyAuthError(error.message), email: address }

  // With "Confirm email" on, there's no session until they click the link.
  if (!data.session) {
    return { notice: `Almost there. Open the link we sent to ${address} to finish signing up.`, email: address }
  }
  redirect(next)
}

/**
 * On the website this redirects to Google. In the iOS/Android app (`native` in the form) it
 * returns Google's URL instead, for the app to open in an in-app browser tab, and Supabase
 * sends the user back through the app link (see src/lib/native-callback.ts).
 */
export async function signInWithGoogle(formData: FormData): Promise<{ url?: string; error?: string }> {
  return signInWithOAuthProvider("google", formData)
}

/**
 * Sign in with Apple through Apple's web page: the website, Android, and app builds without
 * the native Apple sheet. Works exactly like Google above. Off unless NEXT_PUBLIC_APPLE_SIGN_IN=1.
 */
export async function signInWithApple(formData: FormData): Promise<{ url?: string; error?: string }> {
  if (!isAppleSignInEnabled()) {
    if (formData.get("native") === "1") return { error: APPLE_SIGN_IN_OFF }
    redirect(`/login?error=${encodeURIComponent(APPLE_SIGN_IN_OFF)}`)
  }
  return signInWithOAuthProvider("apple", formData)
}

async function signInWithOAuthProvider(
  provider: "google" | "apple",
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const next = safeNext(formData.get("next"))
  const native = formData.get("native") === "1"
  const tag = provider === "apple" ? "apple" : undefined
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: native ? nativeCallbackUrl(next, tag) : callbackUrl(await siteOrigin(), next, tag),
    },
  })
  if (error || !data.url) {
    const label = provider === "apple" ? "Apple" : "Google"
    const message = friendlyAuthError(error?.message ?? `${label} sign-in isn't available right now.`)
    if (native) return { error: message }
    redirect(`/login?error=${encodeURIComponent(message)}`)
  }
  if (native) return { url: data.url }
  redirect(data.url)
}

/** Apple is this account's only sign-in, and it was made in the last 10 minutes. */
function isNewAppleOnlyAccount(user: { created_at: string; identities?: { provider: string }[] }) {
  const providers = (user.identities ?? []).map((identity) => identity.provider)
  const age = Date.now() - new Date(user.created_at).getTime()
  return providers.length > 0 && providers.every((provider) => provider === "apple") && age < 10 * 60_000
}

/**
 * Finishes the native Apple sheet in the iOS app: the app sends Apple's ID token and the raw
 * nonce (Apple saw only its SHA-256), and Supabase checks both and starts the session here,
 * in the web view's cookies. Returns where to go next; the client navigates there.
 */
export async function signInWithAppleIdToken(input: AppleIdTokenInput): Promise<{ next?: string; error?: string }> {
  if (!isAppleSignInEnabled()) return { error: APPLE_SIGN_IN_OFF }
  const parsed = appleIdTokenInput.safeParse(input)
  if (!parsed.success) return { error: "Apple sign-in didn't come through. Try again." }
  const { identityToken, rawNonce, authorizationCode, givenName, familyName } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
    nonce: rawNonce,
  })
  if (error || !data.user) {
    return { error: friendlyAuthError(error?.message ?? "Apple sign-in isn't available right now.") }
  }
  const user = data.user

  // Apple shares the name only on the very first sign-in, after the profile row was already
  // made (from the email, or "Cook" for a hidden email). Save it like the signup form does
  // (user metadata display_name) and onto the profile, but only for an account Apple just
  // created: an existing account (linked by email) keeps the name its owner chose.
  const displayName = appleDisplayName(givenName, familyName)
  if (displayName && isNewAppleOnlyAccount(user)) {
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { display_name: displayName, full_name: displayName },
    })
    if (metadataError) console.error("Saving the Apple name to user metadata failed", metadataError)
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", user.id)
    if (profileError) console.error("Saving the Apple name to the profile failed", profileError)
  }

  // Kept so the Apple link can be revoked when the account is deleted (guideline 5.1.1(v)).
  // It calls Apple, so it runs after the response instead of holding up sign-in.
  if (authorizationCode) after(() => storeAppleAuthorizationCode(user.id, authorizationCode))

  return { next: safeNext(parsed.data.next) }
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const address = String(formData.get("email") ?? "").trim()
  const parsed = email.safeParse(address)
  if (!parsed.success) return { error: parsed.error.issues[0].message, email: address }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: callbackUrl(await siteOrigin(), "/reset-password"),
  })
  if (error) return { error: friendlyAuthError(error.message), email: address }

  return { notice: "If that email has an account, a reset link is on its way.", email: address }
}

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = newPassword.safeParse(formData.get("password"))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) return { error: friendlyAuthError(error.message) }

  redirect("/")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
