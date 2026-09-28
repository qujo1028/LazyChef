"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"

import { safeNext } from "@/lib/safe-next"
import { createClient } from "@/lib/supabase/server"

export type AuthFormState = { error?: string; notice?: string; email?: string } | undefined

const email = z.email("Enter a valid email address.")
const newPassword = z.string().min(8, "Use at least 8 characters.")

async function siteOrigin() {
  const requestHeaders = await headers()
  return requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
}

function callbackUrl(origin: string, next: string) {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`
}

/** Supabase's messages are written for developers; these are for housemates. */
function friendlyAuthError(message: string) {
  const known: [RegExp, string][] = [
    [/invalid login credentials/i, "That email and password don't match."],
    [/email not confirmed/i, "Confirm your email first. The link is in your inbox."],
    [/already registered|already exists/i, "There's already an account with that email. Try signing in."],
    [/email address not authorized/i, "Couldn't send the confirmation email. Supabase's built-in mailer only reaches your Supabase team (see README → Email)."],
    [/rate limit/i, "Too many attempts. Wait a few minutes and try again."],
    [/password should be/i, "Pick a longer password (at least 8 characters)."],
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

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get("next"))
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(await siteOrigin(), next) },
  })
  if (error || !data.url) {
    const message = error?.message ?? "Google sign-in isn't available right now."
    redirect(`/login?error=${encodeURIComponent(friendlyAuthError(message))}`)
  }
  redirect(data.url)
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
