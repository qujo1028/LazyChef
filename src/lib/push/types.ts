export type PushKind = "expiring" | "list" | "joined"
export type PushPlatform = "ios" | "android"

export type PushMessage = {
  title: string
  body: string
  /** Where a tap goes: a same-site path like "/pantry". */
  url: string
  kind: PushKind
}

export type SendResult =
  | { ok: true }
  | {
      ok: false
      /** The phone is gone (app deleted, token replaced): forget this token. */
      invalidToken: boolean
      /** Worth trying again later (provider hiccup, rate limit). */
      retryable: boolean
      /** Short, with no token values or personal details. */
      reason: string
    }

export interface PushSender {
  send(token: string, platform: PushPlatform, message: PushMessage): Promise<SendResult>
}

export const failure = (reason: string, opts: { invalidToken?: boolean; retryable?: boolean } = {}): SendResult => ({
  ok: false,
  invalidToken: opts.invalidToken ?? false,
  retryable: opts.retryable ?? false,
  reason,
})
