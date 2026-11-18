import { beforeEach, describe, expect, it, vi } from "vitest"

import { deliverToUsers, mapLimit } from "./deliver"
import { FakeSender, FakeStore } from "./fakes"
import type { PushMessage } from "./types"

const message: PushMessage = { title: "Shopping list", body: "Sam added Milk", url: "/list", kind: "list" }

let sender: FakeSender
let store: FakeStore

beforeEach(() => {
  sender = new FakeSender()
  store = new FakeStore()
  store.addDevice("a", "tok-a")
  store.addDevice("b", "tok-b")
  store.addDevice("c", "tok-c", "android")
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("deliverToUsers", () => {
  it("sends to every device of every recipient, by platform", async () => {
    const summary = await deliverToUsers(["a", "b", "c"], message, { sender, store })
    expect(summary).toMatchObject({ sent: 3, failed: 0 })
    expect(sender.sent.map((s) => [s.token, s.platform])).toEqual([
      ["tok-a", "ios"],
      ["tok-b", "ios"],
      ["tok-c", "android"],
    ])
  })

  it("skips the person who made the change", async () => {
    await deliverToUsers(["a", "b"], message, { sender, store, actorId: "a" })
    expect(sender.sent.map((s) => s.token)).toEqual(["tok-b"])
  })

  it("skips people who switched this kind off, but not other kinds", async () => {
    store.switchOff("b", "list")
    await deliverToUsers(["a", "b"], message, { sender, store })
    expect(sender.sent.map((s) => s.token)).toEqual(["tok-a"])
    await deliverToUsers(["b"], { ...message, kind: "joined" }, { sender, store })
    expect(sender.sent.map((s) => s.token)).toEqual(["tok-a", "tok-b"])
  })

  it("skips people with no devices without error", async () => {
    const summary = await deliverToUsers(["nobody"], message, { sender, store })
    expect(summary).toMatchObject({ sent: 0, skipped: 1 })
    expect(sender.sent).toEqual([])
  })

  it("deletes tokens the provider says are dead", async () => {
    sender.results.set("tok-b", { ok: false, invalidToken: true, retryable: false, reason: "apns 410 Unregistered" })
    const summary = await deliverToUsers(["a", "b"], message, { sender, store })
    expect(store.forgotten).toEqual(["tok-b"])
    expect(summary).toMatchObject({ sent: 1, failed: 1, removedTokens: 1 })
  })

  it("keeps going when one send fails or throws", async () => {
    sender.results.set("tok-a", "throw")
    sender.results.set("tok-b", { ok: false, invalidToken: false, retryable: true, reason: "apns 503" })
    const summary = await deliverToUsers(["a", "b", "c"], message, { sender, store })
    expect(summary).toMatchObject({ sent: 1, failed: 2 })
    expect(store.forgotten).toEqual([])
  })

  it("sends a push only once per dedupe key", async () => {
    const options = { sender, store, dedupeKey: () => "expiring:2026-11-20" }
    await deliverToUsers(["a"], { ...message, kind: "expiring" }, options)
    const again = await deliverToUsers(["a"], { ...message, kind: "expiring" }, options)
    expect(sender.sent).toHaveLength(1)
    expect(again.skipped).toBe(1)
  })

  it("gives the claim back when nothing got through and a retry could work", async () => {
    sender.results.set("tok-a", { ok: false, invalidToken: false, retryable: true, reason: "apns 503" })
    const options = { sender, store, dedupeKey: () => "k" }
    await deliverToUsers(["a"], message, options)
    sender.results.delete("tok-a")
    await deliverToUsers(["a"], message, options)
    expect(sender.sent).toHaveLength(2)
  })

  it("keeps the claim when the failure isn't worth retrying", async () => {
    sender.results.set("tok-a", { ok: false, invalidToken: false, retryable: false, reason: "apns 400 PayloadEmpty" })
    const options = { sender, store, dedupeKey: () => "k" }
    await deliverToUsers(["a"], message, options)
    await deliverToUsers(["a"], message, options)
    expect(sender.sent).toHaveLength(1)
  })

  it("can personalise the message per recipient", async () => {
    await deliverToUsers(["a", "b"], message, { sender, store, messageFor: (id) => ({ ...message, body: `for ${id}` }) })
    expect(sender.sent.map((s) => s.message.body)).toEqual(["for a", "for b"])
  })

  it("never throws, even when the store does", async () => {
    store.devices = async () => {
      throw new Error("db down")
    }
    await expect(deliverToUsers(["a"], message, { sender, store })).resolves.toMatchObject({ sent: 0 })
  })

  it("never logs token values", async () => {
    sender.results.set("tok-a", { ok: false, invalidToken: false, retryable: true, reason: "apns 503" })
    await deliverToUsers(["a"], message, { sender, store })
    const logged = JSON.stringify([...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls])
    expect(logged).not.toContain("tok-a")
  })
})

describe("mapLimit", () => {
  it("never runs more than the limit at once", async () => {
    let running = 0
    let peak = 0
    await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 1))
      running--
    })
    expect(peak).toBe(3)
  })
})
