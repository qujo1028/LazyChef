import { generateKeyPairSync } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { createFcmSender, parseServiceAccount } = await import("./fcm")

const message = { title: "t", body: "b", url: "/pantry", kind: "expiring" as const }
const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string
const account = { project_id: "demo", client_email: "svc@demo.iam.gserviceaccount.com", private_key: pem }

function fetcher(sendResponse: () => Response) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).includes("oauth2")) return Response.json({ access_token: "at-1", expires_in: 3600 })
    return sendResponse()
  }) as unknown as typeof fetch
  return { fn, calls }
}

describe("parseServiceAccount", () => {
  it("returns null for missing or broken values", () => {
    expect(parseServiceAccount(undefined)).toBeNull()
    expect(parseServiceAccount("nope")).toBeNull()
    expect(parseServiceAccount(JSON.stringify({ project_id: "x" }))).toBeNull()
    expect(parseServiceAccount(JSON.stringify(account))).toEqual(account)
  })
})

describe("FCM sender", () => {
  it("exchanges a JWT once, caches the access token and posts the message", async () => {
    const { fn, calls } = fetcher(() => Response.json({ name: "m" }))
    const sender = createFcmSender(account, fn)
    expect(await sender.send("device-1", "android", message)).toEqual({ ok: true })
    await sender.send("device-2", "android", message)
    expect(calls.filter((c) => c.url.includes("oauth2"))).toHaveLength(1)
    const post = calls.find((c) => c.url.includes("messages:send"))!
    expect(post.url).toContain("/projects/demo/")
    expect((post.init.headers as Record<string, string>).authorization).toBe("Bearer at-1")
    expect(JSON.parse(post.init.body as string).message).toMatchObject({
      token: "device-1",
      notification: { title: "t", body: "b" },
      data: { url: "/pantry", kind: "expiring" },
    })
  })

  it("flags an unregistered token", async () => {
    const { fn } = fetcher(() => Response.json({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 }))
    expect(await createFcmSender(account, fn).send("gone", "android", message)).toMatchObject({ ok: false, invalidToken: true })
  })

  it("turns a network failure into a retryable result instead of throwing", async () => {
    const fn = vi.fn(async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch
    expect(await createFcmSender(account, fn).send("t", "android", message)).toMatchObject({ ok: false, retryable: true })
  })
})
