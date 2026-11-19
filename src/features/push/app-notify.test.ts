import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { handleNotify, JOIN_WINDOW_MS } = await import("./app-notify")

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111"
const now = Date.UTC(2026, 10, 20, 17, 0, 0)

type Result = { data: unknown; error: { message: string } | null }

/** A Supabase stand-in: each table answers every query chain with one result, and records filters. */
function fakeDb(tables: Record<string, Result>) {
  const calls: { table: string; filters: unknown[][] }[] = []
  const from = (table: string) => {
    const call = { table, filters: [] as unknown[][] }
    calls.push(call)
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "gte", "order", "limit"]) {
      builder[m] = (...args: unknown[]) => {
        call.filters.push([m, ...args])
        return builder
      }
    }
    builder.maybeSingle = async () => tables[table] ?? { data: null, error: null }
    return builder
  }
  return { client: { from } as never, calls }
}

const request = (body: unknown, type = "application/json") =>
  new Request("http://localhost/api/push/notify", {
    method: "POST",
    headers: { "content-type": type, authorization: "Bearer t" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

let notifyListAdded: ReturnType<typeof vi.fn>
let notifyJoined: ReturnType<typeof vi.fn>
const defer = vi.fn()

function deps(tables: Record<string, Result>, opts: { authed?: boolean } = {}) {
  const db = fakeDb(tables)
  return {
    db,
    deps: {
      authenticate: async () =>
        opts.authed === false
          ? Response.json({ ok: false, code: "unauthorized", error: "x" }, { status: 401 })
          : { user: { id: "me" } as never, supabase: db.client },
      notifyListAdded: notifyListAdded as never,
      notifyJoined: notifyJoined as never,
      defer,
      now: () => now,
    },
  }
}

const member = (joinedAgoMs = 30 * 24 * 3600_000, role = "member"): Result => ({
  data: { joined_at: new Date(now - joinedAgoMs).toISOString(), role },
  error: null,
})

beforeEach(() => {
  notifyListAdded = vi.fn(async () => true)
  notifyJoined = vi.fn(async () => true)
  defer.mockClear()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/push/notify", () => {
  it("passes an auth failure straight through", async () => {
    const { deps: d } = deps({}, { authed: false })
    const response = await handleNotify(request({ event: "joined", householdId: HOUSEHOLD }), d)
    expect(response.status).toBe(401)
  })

  it("refuses a bad body", async () => {
    const { deps: d, db } = deps({ household_members: member() })
    for (const body of [{ event: "nope", householdId: HOUSEHOLD }, { event: "joined", householdId: "x" }, { event: "joined", householdId: HOUSEHOLD, name: "Pwned" }, "{"]) {
      const response = await handleNotify(request(body), d)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ ok: false, code: "bad_request" })
    }
    expect((await handleNotify(request({}, "text/plain"), d)).status).toBe(415)
    expect(db.calls).toHaveLength(0)
  })

  it("is 403 for someone outside the household", async () => {
    const { deps: d } = deps({ household_members: { data: null, error: null } })
    const response = await handleNotify(request({ event: "list_added", householdId: HOUSEHOLD }), d)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ ok: false, code: "forbidden" })
    expect(notifyListAdded).not.toHaveBeenCalled()
  })

  it("is 500 when the membership check fails", async () => {
    const { deps: d } = deps({ household_members: { data: null, error: { message: "db down" } } })
    expect((await handleNotify(request({ event: "joined", householdId: HOUSEHOLD }), d)).status).toBe(500)
  })

  describe("list_added", () => {
    it("names the caller's newest recent line, read from the database", async () => {
      const { deps: d, db } = deps({
        household_members: member(),
        shopping_list_items: { data: { name: "Milk", created_at: new Date(now - 10_000).toISOString() }, error: null },
      })
      const response = await handleNotify(request({ event: "list_added", householdId: HOUSEHOLD }), d)
      expect(await response.json()).toEqual({ ok: true, sent: true })
      const [household, who, name, options] = notifyListAdded.mock.calls[0]
      expect([household, who, name]).toEqual([HOUSEHOLD, "me", "Milk"])
      expect(options.defer).toBe(defer)
      // Keyed on the line's time, so a retry for the same line lands in the same slot.
      expect(options.now()).toBe(now - 10_000)
      const list = db.calls.find((c) => c.table === "shopping_list_items")!
      expect(list.filters).toContainEqual(["eq", "added_by", "me"])
      expect(list.filters).toContainEqual(["eq", "household_id", HOUSEHOLD])
      expect(list.filters).toContainEqual(["gte", "created_at", new Date(now - 5 * 60_000).toISOString()])
    })

    it("sends nothing without a recent line", async () => {
      const { deps: d } = deps({ household_members: member(), shopping_list_items: { data: null, error: null } })
      const response = await handleNotify(request({ event: "list_added", householdId: HOUSEHOLD }), d)
      expect(await response.json()).toEqual({ ok: true, sent: false })
      expect(notifyListAdded).not.toHaveBeenCalled()
    })

    it("reports sent false when the slot was already used", async () => {
      notifyListAdded.mockResolvedValue(false)
      const { deps: d } = deps({ household_members: member(), shopping_list_items: { data: { name: "Milk", created_at: new Date(now).toISOString() }, error: null } })
      expect(await (await handleNotify(request({ event: "list_added", householdId: HOUSEHOLD }), d)).json()).toEqual({ ok: true, sent: false })
    })
  })

  describe("joined", () => {
    it("tells housemates about a new membership, keyed on the join time", async () => {
      const { deps: d } = deps({ household_members: member(60_000) })
      const response = await handleNotify(request({ event: "joined", householdId: HOUSEHOLD }), d)
      expect(await response.json()).toEqual({ ok: true, sent: true })
      expect(notifyJoined).toHaveBeenCalledTimes(1)
      const [household, who, options] = notifyJoined.mock.calls[0]
      expect([household, who]).toEqual([HOUSEHOLD, "me"])
      expect(options.defer).toBe(defer)
      expect(options.now()).toBe(now - 60_000)
    })

    it("sends nothing for the owner's own row (creating a household isn't a join)", async () => {
      const { deps: d } = deps({ household_members: member(60_000, "owner") })
      expect(await (await handleNotify(request({ event: "joined", householdId: HOUSEHOLD }), d)).json()).toEqual({ ok: true, sent: false })
      expect(notifyJoined).not.toHaveBeenCalled()
    })

    it("sends nothing for an old membership", async () => {
      const { deps: d } = deps({ household_members: member(JOIN_WINDOW_MS + 1000) })
      expect(await (await handleNotify(request({ event: "joined", householdId: HOUSEHOLD }), d)).json()).toEqual({ ok: true, sent: false })
      expect(notifyJoined).not.toHaveBeenCalled()
    })
  })
})
