import { afterEach, describe, expect, it, vi } from "vitest"

import { FakeSender, FakeStore } from "@/lib/push/fakes"

vi.mock("server-only", () => ({}))

const from = vi.fn()
let db: { from: typeof from } | null = { from }
vi.mock("@/lib/supabase/service", () => ({ getServerDb: () => db }))
const shared = vi.hoisted(() => ({ store: {} as unknown, sender: { send: async () => ({ ok: true }) } as unknown }))
vi.mock("@/lib/push/store", () => ({ getPushStore: () => (db ? shared.store : null) }))
vi.mock("@/lib/push/index", () => ({ getSender: () => shared.sender }))

const { GET } = await import("./route")

const request = (auth?: string, query = "") =>
  new Request(`http://localhost/api/push/expiring${query}`, { headers: auth ? { authorization: auth } : {} })

/** A query builder that answers every chain with one result. */
const result = (value: unknown) => {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "order", "range", "in", "gte", "lte"]) builder[m] = () => builder
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve)
  return builder
}

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
    from.mockReturnValue(result({ data: [], error: null }))
    const response = await GET(request("Bearer s3cret"))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, due: 0, sent: 0 })
  })

  it("answers 500 without leaking details when the database fails", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret")
    vi.spyOn(console, "error").mockImplementation(() => {})
    from.mockReturnValue(result({ data: null, error: { message: "secret detail" } }))
    const response = await GET(request("Bearer s3cret"))
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain("secret detail")
  })

  it("reads every page, not just the first 1000 rows, and sends to everyone due", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret")
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-20T17:00:00Z"))
    try {
      const USERS = 1500
      const ITEMS_EACH = 6
      const rows = {
        device_tokens: Array.from({ length: USERS }, (_, i) => ({ id: i, user_id: `u${i}`, timezone: "UTC" })),
        household_members: Array.from({ length: USERS }, (_, i) => ({ user_id: `u${i}`, household_id: `h${i}` })),
        // 6 items per household: 200 households per chunk is 1200 rows, past one page.
        pantry_items: Array.from({ length: USERS * ITEMS_EACH }, (_, i) => ({
          id: i,
          household_id: `h${Math.floor(i / ITEMS_EACH)}`,
          name: `Item ${i}`,
          expires_on: "2026-11-21",
          quantity: 1,
          is_staple: false,
        })),
      } as Record<string, Record<string, unknown>[]>
      const pageSizes: number[] = []
      const MAX_ROWS = 1000 // what hosted Supabase returns at most, whatever is asked for
      from.mockImplementation((table: string) => {
        const filters: ((r: Record<string, unknown>) => boolean)[] = []
        let range: [number, number] | null = null
        const builder = {
          select: () => builder,
          in: (col: string, values: unknown[]) => (filters.push((r) => values.includes(r[col])), builder),
          gte: (col: string, v: string) => (filters.push((r) => String(r[col]) >= v), builder),
          lte: (col: string, v: string) => (filters.push((r) => String(r[col]) <= v), builder),
          order: () => builder,
          range: (a: number, b: number) => ((range = [a, b]), builder),
          then: (resolve: (v: unknown) => unknown) => {
            const matching = rows[table].filter((r) => filters.every((f) => f(r)))
            const [a, b] = range ?? [0, MAX_ROWS - 1]
            const data = matching.slice(a, Math.min(b + 1, a + MAX_ROWS))
            pageSizes.push(data.length)
            return Promise.resolve({ data, error: null }).then(resolve)
          },
        }
        return builder
      })

      const store = new FakeStore()
      const sender = new FakeSender()
      for (let i = 0; i < USERS; i++) store.addDevice(`u${i}`, `tok-${i}`)
      shared.store = store
      shared.sender = sender

      const response = await GET(request("Bearer s3cret"))
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ ok: true, due: USERS, planned: USERS, sent: USERS, failed: 0 })
      expect(sender.sent).toHaveLength(USERS)
      expect(sender.sent[0].message).toMatchObject({ body: "6 things in your pantry expire soon", url: "/pantry", kind: "expiring" })
      // More than one page was needed for devices and for a pantry chunk.
      expect(pageSizes.filter((n) => n === 1000).length).toBeGreaterThanOrEqual(2)
      // A second run the same day sends nothing new.
      const again = await (await GET(request("Bearer s3cret"))).json()
      expect(again).toMatchObject({ sent: 0 })
    } finally {
      vi.useRealTimers()
    }
  })
})
