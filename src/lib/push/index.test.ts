import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const expoSend = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })))
vi.mock("./expo", () => ({ createExpoSender: () => ({ send: expoSend }) }))

const message = { title: "t", body: "b", url: "/pantry", kind: "expiring" as const }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  expoSend.mockClear()
})

describe("getSender", () => {
  it("sends Expo tokens through Expo, and raw tokens to APNs/FCM", async () => {
    vi.stubEnv("APNS_KEY_ID", "")
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", "")
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { getSender } = await import("./index")
    const sender = getSender()
    expect(await sender.send(" ExponentPushToken[abc] ", "ios", message)).toEqual({ ok: true })
    expect(expoSend).toHaveBeenCalledWith("ExponentPushToken[abc]", "ios", message)
    // No APNs keys here, so a raw iPhone token is "not configured", and Expo isn't asked.
    expect(await sender.send("a1b2c3", "ios", message)).toMatchObject({ ok: false, reason: "ios push isn't configured" })
    expect(expoSend).toHaveBeenCalledTimes(1)
  })
})
