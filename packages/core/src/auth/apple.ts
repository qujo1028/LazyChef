// Pure helpers for the native Sign in with Apple flow. Same rules as the web app's
// src/features/auth/apple.ts: the name is cut to the profiles.display_name limit of 60.

/**
 * "Given Family" from the name Apple shares (only on the very first sign-in), or null if Apple
 * didn't share one.
 */
export function appleDisplayName(givenName: string | null | undefined, familyName: string | null | undefined) {
  const name = [givenName, familyName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
  return name ? name.slice(0, 60).trim() : null
}

/** Lowercase hex for random bytes. A 32 byte nonce becomes 64 characters. */
export function bytesToHex(bytes: ArrayLike<number>) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Apple is this account's only sign-in, and it was made in the last 10 minutes. */
export function isNewAppleOnlyAccount(
  user: { created_at: string; identities?: { provider: string }[] | null },
  now = Date.now(),
) {
  const providers = (user.identities ?? []).map((identity) => identity.provider)
  const age = now - new Date(user.created_at).getTime()
  return providers.length > 0 && providers.every((provider) => provider === "apple") && age < 10 * 60_000
}
