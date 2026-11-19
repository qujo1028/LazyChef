import "server-only"

import { failure, type PushMessage, type PushSender, type SendResult } from "./types"

// Expo's push service, for tokens the Expo app registered ("ExponentPushToken[...]"). Expo hands
// the message on to APNs or FCM with its own credentials, so this needs no Apple or Google keys.
// EXPO_ACCESS_TOKEN is optional: set it only if "enhanced push security" is turned on for the
// project at expo.dev (then Expo refuses requests without it).
// https://docs.expo.dev/push-notifications/sending-notifications/

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
const TIMEOUT_MS = 10_000

type Ticket = { status?: string; details?: { error?: string } }
type ExpoResponse = { data?: Ticket | Ticket[]; errors?: { code?: string }[] }

/**
 * What Expo's answer means. Only error codes go into the reason: Expo's messages quote the token.
 * A ticket "ok" means Expo accepted the message, not that the phone got it; receipts aren't checked,
 * so a token that dies later is caught by the next send's DeviceNotRegistered ticket.
 */
export function classifyExpo(status: number, body: unknown): SendResult {
  const json = (body ?? null) as ExpoResponse | null
  const requestError = json?.errors?.[0]?.code
  if (status === 429 || requestError === "TOO_MANY_REQUESTS") return failure(`expo ${status} ${requestError ?? "rate limited"}`, { retryable: true })
  if (status >= 500) return failure(`expo ${status}`, { retryable: true })
  if (status < 200 || status >= 300 || requestError) return failure(`expo ${status}${requestError ? ` ${requestError}` : ""}`)

  const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data
  if (ticket?.status === "ok") return { ok: true }
  const code = ticket?.details?.error
  const why = `expo ${code ?? "no ticket"}`
  if (code === "DeviceNotRegistered") return failure(why, { invalidToken: true })
  if (code === "MessageRateExceeded") return failure(why, { retryable: true })
  return failure(why)
}

export function createExpoSender(accessToken?: string, fetchFn: typeof fetch = fetch): PushSender {
  return {
    async send(token: string, _platform, message: PushMessage): Promise<SendResult> {
      try {
        const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" }
        if (accessToken) headers.authorization = `Bearer ${accessToken}`
        const response = await fetchFn(EXPO_PUSH_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            to: token,
            title: message.title,
            body: message.body,
            data: { url: message.url, kind: message.kind },
            sound: "default",
            priority: "high",
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        const body = await response.json().catch(() => null)
        return classifyExpo(response.status, body)
      } catch (error) {
        return failure(`expo ${error instanceof Error ? error.message : "error"}`, { retryable: true })
      }
    },
  }
}
