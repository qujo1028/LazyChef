import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const from = vi.fn()
let db: { from: typeof from } | null = { from }
vi.mock("@/lib/supabase/service", () => ({ getServerDb: () => db }))
vi.mock("@/lib/push/store", () => ({ getPushStore: () => (db ? {} : null) }))
vi.mock("@/lib/push/index", () => ({ getSender: () => ({ send: vi.fn() }) }))

const { GET } = await import("./route")

const request = (auth?: string, query = "") =>
  new Request(`http://localhost/api/push/expiring${query}`, { headers: auth ? { authorization: auth } : {} })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  db = { from }
})

describe("GET /api/push/expiring", () => {
  it("returns 503 when CRON_SECRET isn't set", async () => {
    vi.stubEnv("CRON_SECRET", "")
    expect((await GET(request("Bearer x"))).status).toBe(503)
  })

  it("rejects a missing or wrong secret without touching the database", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret")
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request("Bearer nope"))).status).toBe(401)
    expect((await GET(request("s3cret"))).status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it("returns 503 when the database isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret")
    db = null
    expect((await GET(request("Bearer s3cret"))).status).toBe(503)
  })

  it("does nothing when nobody has a device", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret")
    from.mockReturnValue({ select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) })
    const response = await GET(request("Bearer s3cret"))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, due: 0, sent: 0 })
  })

  it("answers 500 without leaking details when the database fails", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret")
    vi.spyOn(console, "error").mockImplementation(() => {})
    from.mockReturnValue({ select: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: "secret detail" } }) }) }) })
    const response = await GET(request("Bearer s3cret"))
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain("secret detail")
  })
})
