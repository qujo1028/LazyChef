import { failure, type SendResult } from "./types"

/** What an APNs response means. https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns */
export function classifyApns(status: number, reason: string | undefined): SendResult {
  if (status === 200) return { ok: true }
  const why = `apns ${status}${reason ? ` ${reason}` : ""}`
  if (status === 410 || (status === 400 && reason === "BadDeviceToken")) return failure(why, { invalidToken: true })
  // An expired provider token is ours to refresh, so the next try works.
  if (status === 403 && reason === "ExpiredProviderToken") return failure(why, { retryable: true })
  if (status === 429 || status >= 500) return failure(why, { retryable: true })
  return failure(why)
}

/** What an FCM HTTP v1 response means. `body` is the parsed JSON error body, if any. */
export function classifyFcm(status: number, body: unknown): SendResult {
  if (status >= 200 && status < 300) return { ok: true }
  const error = (body as { error?: { status?: string; details?: { errorCode?: string }[] } } | null)?.error
  const codes = [error?.status, ...(error?.details?.map((d) => d.errorCode) ?? [])]
  const why = `fcm ${status}${error?.status ? ` ${error.status}` : ""}`
  if (codes.includes("UNREGISTERED") || codes.includes("NOT_FOUND") || status === 404) {
    return failure(why, { invalidToken: true })
  }
  if (status === 429 || status >= 500) return failure(why, { retryable: true })
  return failure(why)
}
