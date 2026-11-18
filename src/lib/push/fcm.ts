import "server-only"

import { classifyFcm } from "./classify"
import { signJwt } from "./jwt"
import { failure, type PushMessage, type PushSender, type SendResult } from "./types"

export type FcmServiceAccount = { project_id: string; client_email: string; private_key: string }

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
const TIMEOUT_MS = 10_000

/** Reads FCM_SERVICE_ACCOUNT_JSON; null if it isn't set or isn't a usable service account. */
export function parseServiceAccount(raw: string | undefined): FcmServiceAccount | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as Partial<FcmServiceAccount>
    if (typeof parsed.project_id === "string" && typeof parsed.client_email === "string" && typeof parsed.private_key === "string") {
      return { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key }
    }
  } catch {}
  return null
}

export function createFcmSender(account: FcmServiceAccount, fetchFn: typeof fetch = fetch, now: () => number = Date.now): PushSender {
  let access: { token: string; expiresAt: number } | null = null

  async function accessToken(): Promise<string> {
    if (access && now() < access.expiresAt - 60_000) return access.token
    const issued = Math.floor(now() / 1000)
    const assertion = signJwt(
      "RS256",
      {},
      { iss: account.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: issued, exp: issued + 3600 },
      account.private_key,
    )
    const response = await fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`oauth ${response.status}`)
    const json = (await response.json()) as { access_token?: string; expires_in?: number }
    if (!json.access_token) throw new Error("oauth no token")
    access = { token: json.access_token, expiresAt: now() + (json.expires_in ?? 3600) * 1000 }
    return access.token
  }

  return {
    async send(token: string, _platform, message: PushMessage): Promise<SendResult> {
      try {
        const response = await fetchFn(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken()}` },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: { url: message.url, kind: message.kind },
              android: { priority: "HIGH" },
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (response.status === 401) access = null
        const body = response.ok ? null : await response.json().catch(() => null)
        return classifyFcm(response.status, body)
      } catch (error) {
        return failure(`fcm ${error instanceof Error ? error.message : "error"}`, { retryable: true })
      }
    },
  }
}
