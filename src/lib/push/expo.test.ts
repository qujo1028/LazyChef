import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { classifyExpo, createExpoSender, EXPO_PUSH_URL } = await import("./expo")

const message = { title: "Shopping list", body: "Sam added Milk", url: "/list", kind: "list" as const }
const TOKEN = "ExponentPushToken[abc123]"

function fetcher(respond: () => Response) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond()
  }) as unknown as typeof fetch
  return { fn, calls }
}

const ticket = (t: unknown) => Response.json({ data: t })

describe("Expo sender", () => {
  it("posts title, body, data and sound to Expo", async () => {
    const { fn, calls } = fetcher(() => ticket({ status: "ok", id: "x" }))
    expect(await createExpoSender(undefined, fn).send(TOKEN, "ios", message)).toEqual({ ok: true })
    expect(calls[0].url).toBe(EXPO_PUSH_URL)
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({
      to: TOKEN,
      title: "Shopping list",
      body: "Sam added Milk",
      data: { url: "/list", kind: "list" },
      sound: "default",
    })
  })

  it("sends the access token when one is set", async () => {
    const { fn, calls } = fetcher(() => ticket([{ status: "ok" }]))
    expect(await createExpoSender("secret", fn).send(TOKEN, "android", message)).toEqual({ ok: true })
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer secret")
  })

  it("flags a device that's gone, without the token in the reason", async () => {
    const { fn } = fetcher(() =>
      ticket({ status: "error", message: `"${TOKEN}" is not a registered push notification recipient`, details: { error: "DeviceNotRegistered" } }),
    )
    const result = await createExpoSender(undefined, fn).send(TOKEN, "ios", message)
    expect(result).toMatchObject({ ok: false, invalidToken: true, retryable: false })
    expect(JSON.stringify(result)).not.toContain("abc123")
  })

  it("turns a network failure into a retryable result instead of throwing", async () => {
    const fn = vi.fn(async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch
    expect(await createExpoSender(undefined, fn).send(TOKEN, "ios", message)).toMatchObject({ ok: false, retryable: true })
  })
})

describe("classifyExpo", () => {
  it("retries rate limits and server errors", () => {
    expect(classifyExpo(200, { data: { status: "error", details: { error: "MessageRateExceeded" } } })).toMatchObject({ retryable: true, invalidToken: false })
    expect(classifyExpo(429, { errors: [{ code: "TOO_MANY_REQUESTS" }] })).toMatchObject({ retryable: true })
    expect(classifyExpo(503, null)).toMatchObject({ retryable: true })
  })

  it("treats other errors as plain failures", () => {
    expect(classifyExpo(200, { data: { status: "error", details: { error: "InvalidCredentials" } } })).toMatchObject({
      ok: false,
      retryable: false,
      invalidToken: false,
      reason: "expo InvalidCredentials",
    })
    expect(classifyExpo(400, { errors: [{ code: "VALIDATION_ERROR" }] })).toMatchObject({ ok: false, retryable: false })
    expect(classifyExpo(200, {})).toMatchObject({ ok: false })
  })
})
