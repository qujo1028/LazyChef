import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const rpc = vi.fn()
let db: { rpc: typeof rpc } | null = { rpc }
vi.mock("@/lib/supabase/service", () => ({ getServerDb: () => db }))

const { GET } = await import("./route")

const request = (auth?: string) =>
  new Request("http://localhost/api/admin/snapshot", { headers: auth ? { authorization: auth } : {} })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  db = { rpc }
})

describe("GET /api/admin/snapshot", () => {
  it("returns 503 when CRON_SECRET isn't set", async () => {
    vi.stubEnv("CRON_SECRET", "")
    const response = await GET(request("Bearer x"))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "CRON_SECRET isn't set." })
  })

  it("returns 401 for a missing or wrong header", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret")
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request("Bearer nope"))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("returns 503 when the database isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret")
    db = null
    expect((await GET(request("Bearer s3cret"))).status).toBe(503)
  })

  it("captures yesterday and today", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret")
    rpc.mockResolvedValue({ error: null })
    const response = await GET(request("Bearer s3cret"))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.captured).toHaveLength(2)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith("admin_capture_daily_snapshot", { p_day: body.captured[0] })
  })
})
