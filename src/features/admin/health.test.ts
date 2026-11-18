import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/service", () => ({ getServerDb: vi.fn() }))
vi.mock("@/lib/llm/client", () => ({ isLlmConfigured: vi.fn() }))

import { isLlmConfigured } from "@/lib/llm/client"
import { getServerDb } from "@/lib/supabase/service"

import { ago, agoPhrase, checkServices, envChecklist, revenuecatState, spoonacularState } from "./health"

const NOW = new Date("2026-11-17T12:00:00Z")
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString()

describe("ago", () => {
  it("uses short units", () => {
    expect(ago(minutesAgo(0), NOW)).toBe("just now")
    expect(ago(minutesAgo(0.5), NOW)).toBe("just now")
    expect(ago(minutesAgo(5), NOW)).toBe("5 min")
    expect(ago(minutesAgo(59), NOW)).toBe("59 min")
    expect(ago(minutesAgo(180), NOW)).toBe("3 h")
    expect(ago(minutesAgo(60 * 23), NOW)).toBe("23 h")
    expect(ago(minutesAgo(60 * 47), NOW)).toBe("1 d")
    expect(ago(minutesAgo(60 * 48), NOW)).toBe("2 d")
  })

  it("treats a future or invalid time as just now", () => {
    expect(ago(new Date(NOW.getTime() + 60_000 * 10).toISOString(), NOW)).toBe("just now")
    expect(ago("not a date", NOW)).toBe("just now")
  })

  it("adds 'ago' except for just now", () => {
    expect(agoPhrase(minutesAgo(5), NOW)).toBe("5 min ago")
    expect(agoPhrase(minutesAgo(0), NOW)).toBe("just now")
  })
})

describe("spoonacularState", () => {
  it("is off without a key, whatever the row says", () => {
    expect(spoonacularState(null, false)).toEqual({ state: "off", detail: "SPOONACULAR_API_KEY isn't set" })
    expect(spoonacularState({ points_used: 50, points_left: 0, exhausted_at: "x" }, false).state).toBe("off")
  })

  it("is down once exhausted today", () => {
    expect(spoonacularState({ points_used: 50, points_left: 0, exhausted_at: "2026-11-17T09:00:00Z" }, true)).toEqual({
      state: "down",
      detail: "Out of points today",
    })
  })

  it("is ok with no calls yet today", () => {
    expect(spoonacularState(null, true)).toEqual({ state: "ok", detail: "No calls yet today" })
  })

  it("warns below 10 points left and is ok at 10", () => {
    const row = (points_left: number) => ({ points_used: 50 - points_left, points_left, exhausted_at: null })
    expect(spoonacularState(row(9), true)).toEqual({ state: "warn", detail: "41 of 50 points used, 9 left" })
    expect(spoonacularState(row(10), true)).toEqual({ state: "ok", detail: "40 of 50 points used" })
  })

  it("is ok with usage and no known points left", () => {
    expect(spoonacularState({ points_used: 12, points_left: null, exhausted_at: null }, true)).toEqual({
      state: "ok",
      detail: "12 of 50 points used",
    })
  })
})

describe("revenuecatState", () => {
  it("is off until both keys are configured", () => {
    expect(revenuecatState(null, false, NOW).state).toBe("off")
  })

  it("warns when no webhook has arrived", () => {
    expect(revenuecatState(null, true, NOW)).toEqual({ state: "warn", detail: "No webhooks received yet" })
  })

  it("is ok for a webhook within 14 days", () => {
    expect(revenuecatState(minutesAgo(5), true, NOW)).toEqual({ state: "ok", detail: "Last webhook 5 min ago" })
  })

  it("warns for a webhook older than 14 days", () => {
    const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
    expect(revenuecatState(days(13), true, NOW).state).toBe("ok")
    expect(revenuecatState(days(15), true, NOW)).toEqual({ state: "warn", detail: "Last webhook 15 d ago" })
  })
})

describe("envChecklist", () => {
  it("reports names and booleans, required for the core Supabase vars", () => {
    const list = envChecklist({ SUPABASE_SECRET_KEY: "super-secret-value", GROQ_API_KEY: "  " })
    const byName = Object.fromEntries(list.map((item) => [item.name, item]))

    expect(byName.SUPABASE_SECRET_KEY).toEqual({ name: "SUPABASE_SECRET_KEY", set: true, required: true })
    expect(byName.NEXT_PUBLIC_SUPABASE_URL).toEqual({ name: "NEXT_PUBLIC_SUPABASE_URL", set: false, required: true })
    expect(byName.GROQ_API_KEY).toEqual({ name: "GROQ_API_KEY", set: false, required: false })
    expect(byName.ADMIN_EMAILS.required).toBe(false)
    expect(list).toHaveLength(15)
  })

  it("never includes values", () => {
    const list = envChecklist({ SUPABASE_SECRET_KEY: "super-secret-value", CRON_SECRET: "cron-value-123" })
    const json = JSON.stringify(list)
    expect(json).not.toContain("super-secret-value")
    expect(json).not.toContain("cron-value-123")
  })
})

describe("checkServices", () => {
  type Result = { data?: unknown; error?: { message: string } | null; count?: number | null }

  /** A chainable query stub whose awaited result is `result`. */
  function query(result: Result) {
    const builder: Record<string, unknown> = {}
    for (const method of ["select", "eq", "order", "limit"]) builder[method] = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => result)
    builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
    return builder
  }

  function fakeDb(tables: Record<string, Result>) {
    return { from: vi.fn((table: string) => query(tables[table] ?? { data: null, error: null })) }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    vi.mocked(isLlmConfigured).mockReturnValue(false)
    vi.mocked(getServerDb).mockReturnValue(null)
    vi.stubEnv("GROQ_API_KEY", "")
    vi.stubEnv("SPOONACULAR_API_KEY", "")
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "")
    vi.stubEnv("REVENUECAT_WEBHOOK_AUTH", "")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("reports everything off when nothing is configured, and never calls out", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const checks = await checkServices()

    expect(checks.map((c) => [c.name, c.state])).toEqual([
      ["Supabase", "off"],
      ["Groq (AI recipes)", "off"],
      ["Spoonacular (recipe search)", "off"],
      ["RevenueCat (subscriptions)", "off"],
    ])
    expect(checks[0].detail).toBe("SUPABASE_SECRET_KEY isn't set")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reports Supabase users, and down with the error message", async () => {
    vi.mocked(getServerDb).mockReturnValue(
      fakeDb({ profiles: { count: 42, error: null } }) as unknown as ReturnType<typeof getServerDb>,
    )
    const [supabase] = await checkServices()
    expect(supabase).toMatchObject({ name: "Supabase", state: "ok", detail: "42 users" })
    expect(supabase.latencyMs).toEqual(expect.any(Number))

    vi.mocked(getServerDb).mockReturnValue(
      fakeDb({ profiles: { count: null, error: { message: "permission denied" } } }) as unknown as ReturnType<typeof getServerDb>,
    )
    const [failed] = await checkServices()
    expect(failed).toMatchObject({ state: "down", detail: "permission denied" })
  })

  it("reports Groq ok on 200, key rejected on 401, and down on anything else", async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(true)
    vi.stubEnv("GROQ_API_KEY", " gsk_test ")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }))
    const [, ok] = await checkServices()
    expect(ok).toMatchObject({ name: "Groq (AI recipes)", state: "ok", detail: "Reachable" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.groq.com/openai/v1/models")
    expect(init.headers.Authorization).toBe("Bearer gsk_test")
    expect(init.next).toEqual({ revalidate: 300 })

    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }))
    const [, rejected] = await checkServices()
    expect(rejected).toMatchObject({ state: "down", detail: "Key rejected" })

    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }))
    const [, unexpected] = await checkServices()
    expect(unexpected).toMatchObject({ state: "down", detail: "Unexpected answer (HTTP 503)" })

    fetchMock.mockRejectedValueOnce(new TypeError("offline"))
    const [, thrown] = await checkServices()
    expect(thrown).toMatchObject({ state: "down", detail: "Couldn't reach Groq", latencyMs: null })
  })

  it("reads today's Spoonacular usage without calling Spoonacular", async () => {
    vi.stubEnv("SPOONACULAR_API_KEY", "sp-key")
    const db = fakeDb({
      spoonacular_usage: { data: { points_used: 45, points_left: 5, exhausted_at: null }, error: null },
    })
    vi.mocked(getServerDb).mockReturnValue(db as unknown as ReturnType<typeof getServerDb>)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const checks = await checkServices()
    const spoonacular = checks[2]

    expect(spoonacular).toMatchObject({ name: "Spoonacular (recipe search)", state: "warn", detail: "45 of 50 points used, 5 left" })
    expect(spoonacular.latencyMs).toEqual(expect.any(Number))
    expect(db.from).toHaveBeenCalledWith("spoonacular_usage")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reports RevenueCat from the newest received webhook", async () => {
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "rc-secret")
    vi.stubEnv("REVENUECAT_WEBHOOK_AUTH", "rc-auth")
    const db = fakeDb({ revenuecat_events: { data: { received_at: minutesAgo(180) }, error: null } })
    vi.mocked(getServerDb).mockReturnValue(db as unknown as ReturnType<typeof getServerDb>)

    const checks = await checkServices()

    expect(checks[3]).toMatchObject({ name: "RevenueCat (subscriptions)", state: "ok", detail: "Last webhook 3 h ago", latencyMs: null })
  })
})
