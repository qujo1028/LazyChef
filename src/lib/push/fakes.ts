// Test doubles for the push code. Only imported by tests.
import type { Device, PushStore } from "./deliver"
import type { PushKind, PushMessage, PushPlatform, PushSender, SendResult } from "./types"

export class FakeSender implements PushSender {
  sent: { token: string; platform: PushPlatform; message: PushMessage }[] = []
  /** Per-token override; default is success. */
  results = new Map<string, SendResult | "throw">()

  async send(token: string, platform: PushPlatform, message: PushMessage): Promise<SendResult> {
    this.sent.push({ token, platform, message })
    const result = this.results.get(token)
    if (result === "throw") throw new Error("boom")
    return result ?? { ok: true }
  }
}

export class FakeStore implements PushStore {
  tokens = new Map<string, Device[]>()
  off = new Map<PushKind, Set<string>>()
  log = new Set<string>()
  forgotten: string[] = []

  addDevice(userId: string, token: string, platform: PushPlatform = "ios") {
    this.tokens.set(userId, [...(this.tokens.get(userId) ?? []), { token, platform }])
  }
  switchOff(userId: string, kind: PushKind) {
    this.off.set(kind, (this.off.get(kind) ?? new Set()).add(userId))
  }
  async devices(userIds: string[]) {
    return new Map(userIds.flatMap((id) => (this.tokens.has(id) ? [[id, this.tokens.get(id)!] as const] : [])))
  }
  async optedOut(userIds: string[], kind: PushKind) {
    return new Set(userIds.filter((id) => this.off.get(kind)?.has(id)))
  }
  async claim(userId: string, kind: PushKind, key: string) {
    const id = `${userId}|${kind}|${key}`
    if (this.log.has(id)) return false
    this.log.add(id)
    return true
  }
  async release(userId: string, kind: PushKind, key: string) {
    this.log.delete(`${userId}|${kind}|${key}`)
  }
  async forgetTokens(tokens: string[]) {
    this.forgotten.push(...tokens)
    for (const [user, list] of this.tokens) this.tokens.set(user, list.filter((d) => !tokens.includes(d.token)))
  }
}
