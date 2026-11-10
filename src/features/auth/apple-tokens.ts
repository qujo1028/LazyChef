import "server-only"

import { createPrivateKey, sign } from "node:crypto"

import { getAdminClient } from "@/lib/supabase/admin"

// Sign in with Apple token revocation (App Store guideline 5.1.1(v)): when someone who
// signed in with Apple deletes their account, the app must revoke their Apple tokens.
// Supabase Auth keeps no Apple refresh token, so after a native Apple sign-in the server
// trades the one-time authorization code for one and keeps it in
// public.apple_refresh_tokens (secret key only); deleteAccount revokes it.
//
// Dormant until APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 file's contents)
// and APPLE_CLIENT_ID (the bundle ID, app.lazychef, for native sign-ins) are all set.
// APPLE_SERVICES_ID (web sign-ins) is optional: tokens from Apple's web page were issued to it.
// None of these functions ever throws: signing in and deleting an account must not fail over this.

const APPLE = "https://appleid.apple.com"
const TIMEOUT_MS = 10_000
/** Each request signs a fresh client secret; Apple allows up to 6 months. */
const CLIENT_SECRET_TTL_SECONDS = 10 * 60

export type AppleConfig = { teamId: string; keyId: string; privateKey: string; clientId: string; servicesId?: string }

/** Apple settings from the environment, or null unless all four are set. */
export function getAppleConfig(env: Record<string, string | undefined> = process.env): AppleConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim()
  const keyId = env.APPLE_KEY_ID?.trim()
  const clientId = env.APPLE_CLIENT_ID?.trim()
  // Hosting dashboards often store a multi-line key with literal "\n"s.
  const privateKey = env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim()
  if (!teamId || !keyId || !clientId || !privateKey) return null
  const servicesId = env.APPLE_SERVICES_ID?.trim() || undefined
  return { teamId, keyId, privateKey, clientId, ...(servicesId ? { servicesId } : {}) }
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url")

/** The client_secret Apple's token endpoints want: an ES256 JWT signed with the .p8 key. */
export function buildAppleClientSecret(
  config: AppleConfig,
  now: Date = new Date(),
  clientId: string = config.clientId,
): string {
  const iat = Math.floor(now.getTime() / 1000)
  const header = { alg: "ES256", kid: config.keyId }
  const claims = { iss: config.teamId, iat, exp: iat + CLIENT_SECRET_TTL_SECONDS, aud: APPLE, sub: clientId }
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`
  const key = createPrivateKey(
    config.privateKey.includes("-----BEGIN")
      ? config.privateKey
      : `-----BEGIN PRIVATE KEY-----\n${config.privateKey}\n-----END PRIVATE KEY-----`,
  )
  // JWTs use the raw r||s signature, not DER.
  const signature = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" })
  return `${input}.${base64url(signature)}`
}

/** The `sub` claim of a JWT (Apple's id_token), without verifying it. */
export function jwtSubject(token: unknown): string | null {
  if (typeof token !== "string") return null
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"))
    return typeof payload?.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}

async function postToApple(path: string, params: Record<string, string>): Promise<Response> {
  return fetch(`${APPLE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * After a native Sign in with Apple: trades the authorization code (single use, valid for
 * 5 minutes) for a refresh token and stores it so deleteAccount can revoke it.
 * Does nothing unless Apple is configured. Never throws.
 */
export async function storeAppleAuthorizationCode(userId: string, code: string): Promise<void> {
  try {
    const config = getAppleConfig()
    if (!config || !userId || !code) return
    const admin = getAdminClient()
    if (!admin) {
      console.error("storeAppleAuthorizationCode: SUPABASE_SECRET_KEY is missing; token not stored")
      return
    }

    const response = await postToApple("/auth/token", {
      client_id: config.clientId,
      client_secret: buildAppleClientSecret(config),
      code,
      grant_type: "authorization_code",
    })
    const body = (await response.json().catch(() => null)) as {
      refresh_token?: unknown
      id_token?: unknown
      error?: unknown
    } | null
    if (!response.ok || typeof body?.refresh_token !== "string" || !body.refresh_token) {
      console.error("storeAppleAuthorizationCode: Apple's token exchange failed", response.status, body?.error)
      return
    }

    // The code comes from the client, so only keep tokens for the Apple account this user signed in with.
    const { data, error: userError } = await admin.auth.admin.getUserById(userId)
    if (userError || !data.user) {
      console.error("storeAppleAuthorizationCode: looking up the user failed", userError?.message)
      return
    }
    const appleSubs = (data.user.identities ?? [])
      .filter((identity) => identity.provider === "apple")
      .map((identity) => (typeof identity.identity_data?.sub === "string" ? identity.identity_data.sub : identity.id))
    const sub = jwtSubject(body.id_token)
    if (!sub || !appleSubs.includes(sub)) {
      console.error("storeAppleAuthorizationCode: the code is for a different Apple account; token not stored")
      return
    }

    await saveRefreshToken(admin, userId, body.refresh_token)
  } catch (error) {
    console.error("storeAppleAuthorizationCode: failed", message(error))
  }
}

async function saveRefreshToken(admin: NonNullable<ReturnType<typeof getAdminClient>>, userId: string, token: string) {
  const { error } = await admin
    .from("apple_refresh_tokens")
    .upsert({ user_id: userId, refresh_token: token, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (error) console.error("apple-tokens: saving the token failed", error.message)
}

/**
 * After Sign in with Apple through Apple's web page: keeps the Apple refresh token Supabase
 * handed back with the session (provider_refresh_token), when it did. It came from Supabase's
 * own code exchange on the server, so it's trusted as is. Never throws.
 */
export async function storeAppleRefreshToken(userId: string, refreshToken: string | null | undefined): Promise<void> {
  try {
    if (!getAppleConfig() || !userId || !refreshToken || refreshToken.length > 2000) return
    const admin = getAdminClient()
    if (admin) await saveRefreshToken(admin, userId, refreshToken)
  } catch (error) {
    console.error("storeAppleRefreshToken: failed", message(error))
  }
}

/** What revokeAppleTokens managed: `usedApple` is false for people who never signed in with Apple. */
export type AppleRevokeResult = { usedApple: boolean; revoked: boolean }

/**
 * On account deletion: revokes the person's stored Apple refresh token, trying each Apple client
 * that could have issued it (the bundle ID for the app's sheet, the Services ID for the web page).
 * Call it before deleting the auth user (the stored token goes with the user). When nothing could
 * be revoked for someone who used Apple, the caller tells them how to remove LazyChef from their
 * Apple ID themselves (Apple TN3194). Never throws, so it never blocks the deletion.
 */
export async function revokeAppleTokens(userId: string): Promise<AppleRevokeResult> {
  const result: AppleRevokeResult = { usedApple: false, revoked: false }
  try {
    const admin = getAdminClient()
    if (!admin || !userId) return result
    const { data: userData } = await admin.auth.admin.getUserById(userId)
    result.usedApple = (userData?.user?.identities ?? []).some((identity) => identity.provider === "apple")
    const config = getAppleConfig()
    if (!result.usedApple || !config) return result

    const { data, error } = await admin
      .from("apple_refresh_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle()
    if (error) {
      console.error("revokeAppleTokens: reading the token failed", error.message)
      return result
    }
    if (!data) return result

    for (const clientId of [config.clientId, config.servicesId].filter((id): id is string => !!id)) {
      const response = await postToApple("/auth/revoke", {
        client_id: clientId,
        client_secret: buildAppleClientSecret(config, new Date(), clientId),
        token: data.refresh_token,
        token_type_hint: "refresh_token",
      })
      if (response.ok) {
        result.revoked = true
        return result
      }
      const body = (await response.json().catch(() => null)) as { error?: unknown } | null
      console.error("revokeAppleTokens: Apple refused the revocation", clientId, response.status, body?.error)
    }
  } catch (error) {
    console.error("revokeAppleTokens: failed", message(error))
  }
  return result
}
