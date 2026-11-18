import type { PushKind, PushMessage, PushPlatform, PushSender } from "./types"

export type Device = { token: string; platform: PushPlatform }

/** The database side of delivery, so the logic here can run against a fake in tests. */
export interface PushStore {
  /** Devices per user. Users with none are left out. */
  devices(userIds: string[]): Promise<Map<string, Device[]>>
  /** Users who switched this kind off. Missing settings mean on. */
  optedOut(userIds: string[], kind: PushKind): Promise<Set<string>>
  /** true if this push is new for the user, false if the key was already used. */
  claim(userId: string, kind: PushKind, key: string): Promise<boolean>
  /** Gives a claim back, so a push that never reached the phone can be tried again. */
  release(userId: string, kind: PushKind, key: string): Promise<void>
  forgetTokens(tokens: string[]): Promise<void>
}

export type DeliverOptions = {
  sender: PushSender
  store: PushStore
  /** The person who made the change; never notified. */
  actorId?: string | null
  /** Per recipient: skip anyone who already got this key. */
  dedupeKey?: (userId: string) => string
  /** Pushes in flight at once. */
  concurrency?: number
  /** Overrides the message per recipient (the expiring push is personal). */
  messageFor?: (userId: string) => PushMessage
}

export type DeliverSummary = { sent: number; failed: number; skipped: number; removedTokens: number }

const NONE: DeliverSummary = { sent: 0, failed: 0, skipped: 0, removedTokens: 0 }

/** Runs `fn` over `items` with at most `limit` at a time. Never rejects if `fn` doesn't. */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) await fn(items[next++])
  })
  await Promise.all(workers)
}

/**
 * Sends `message` to every device of `userIds`, minus the actor and anyone who switched this kind
 * off. Dead tokens are deleted. This never throws: a push problem must not fail the action that
 * caused it. Failures are logged by reason only (no tokens, no emails).
 */
export async function deliverToUsers(userIds: string[], message: PushMessage, options: DeliverOptions): Promise<DeliverSummary> {
  try {
    return await deliver(userIds, message, options)
  } catch (error) {
    console.error("[push] delivery failed:", error instanceof Error ? error.message : "unknown error")
    return { ...NONE }
  }
}

async function deliver(userIds: string[], message: PushMessage, options: DeliverOptions): Promise<DeliverSummary> {
  const { sender, store, actorId, dedupeKey, concurrency = 5, messageFor } = options
  const summary = { ...NONE }
  const recipients = [...new Set(userIds)].filter((id) => id !== actorId)
  if (recipients.length === 0) return summary

  const [devices, off] = await Promise.all([store.devices(recipients), store.optedOut(recipients, message.kind)])
  const wanted = recipients.filter((id) => !off.has(id) && (devices.get(id)?.length ?? 0) > 0)
  summary.skipped += recipients.length - wanted.length

  const dead = new Set<string>()
  const reasons = new Map<string, number>()

  await mapLimit(wanted, concurrency, async (userId) => {
    try {
      const key = dedupeKey?.(userId)
      if (key && !(await store.claim(userId, message.kind, key))) {
        summary.skipped++
        return
      }
      const body = messageFor?.(userId) ?? message
      let delivered = false
      let retryable = false
      for (const device of devices.get(userId) ?? []) {
        let result
        try {
          result = await sender.send(device.token, device.platform, body)
        } catch (error) {
          result = { ok: false as const, invalidToken: false, retryable: true, reason: error instanceof Error ? error.message : "send threw" }
        }
        if (result.ok) {
          delivered = true
          summary.sent++
          continue
        }
        summary.failed++
        reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1)
        if (result.invalidToken) dead.add(device.token)
        if (result.retryable) retryable = true
      }
      // Nothing reached this person and trying again could work: hand the claim back.
      if (key && !delivered && retryable) await store.release(userId, message.kind, key).catch(() => {})
    } catch (error) {
      summary.failed++
      reasons.set(error instanceof Error ? error.message : "error", (reasons.get("error") ?? 0) + 1)
    }
  })

  if (dead.size > 0) {
    await store.forgetTokens([...dead]).catch((error: unknown) => {
      console.error("[push] removing dead tokens failed:", error instanceof Error ? error.message : "unknown error")
    })
    summary.removedTokens = dead.size
  }
  if (reasons.size > 0) console.warn("[push] some sends failed:", Object.fromEntries(reasons))
  return summary
}
