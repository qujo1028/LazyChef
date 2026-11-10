import { z } from "zod"

/**
 * Sign in with Apple stays hidden and inert until the owner sets it up (see
 * docs/mobile-apps.md → "Turning on Sign in with Apple"). NEXT_PUBLIC_ variables are
 * inlined at build time, so this reads the same on the server and in the browser.
 */
export function isAppleSignInEnabled(value: string | undefined = process.env.NEXT_PUBLIC_APPLE_SIGN_IN) {
  return value?.trim() === "1"
}

export const APPLE_SIGN_IN_OFF = "Sign in with Apple isn't available yet. Use Google or your email instead."

const optionalName = z
  .string()
  .max(200)
  .nullish()
  .transform((value) => value?.trim() || null)

/** What the iOS app sends after the native Apple sheet succeeds. */
export const appleIdTokenInput = z.object({
  identityToken: z.string().min(1).max(10_000),
  rawNonce: z.string().min(16).max(256),
  authorizationCode: z
    .string()
    .max(2_000)
    .nullish()
    .transform((value) => value?.trim() || null),
  givenName: optionalName,
  familyName: optionalName,
  next: z.string().max(2_000).nullish(),
})

export type AppleIdTokenInput = z.input<typeof appleIdTokenInput>

/**
 * "Given Family" from the name Apple shares (only on the first sign-in), cut to the
 * profiles.display_name limit of 60 characters, or null if Apple didn't share one.
 */
export function appleDisplayName(givenName: string | null | undefined, familyName: string | null | undefined) {
  const name = [givenName, familyName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
  return name ? name.slice(0, 60).trim() : null
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** A fresh random nonce (64 hex characters). Supabase gets this one. */
export function randomNonce() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

/** SHA-256 of `value` as lowercase hex. Apple gets the hashed nonce and puts it in the ID token. */
export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return toHex(new Uint8Array(digest))
}
