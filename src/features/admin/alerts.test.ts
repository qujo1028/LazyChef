import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  getDailyCounters: vi.fn(),
  getSpoonacularDaily: vi.fn(),
  getRevenueStats: vi.fn(),
  getRevenueCatRecent: vi.fn(),
  latestProductionDeploy: vi.fn(),
  checkServices: vi.fn(),
}))

vi.mock("@/features/admin/stats", () => ({
  getDailyCounters: mocks.getDailyCounters,
  getSpoonacularDaily: mocks.getSpoonacularDaily,
}))
vi.mock("@/features/admin/overview", () => ({ getRevenueStats: mocks.getRevenueStats }))
vi.mock("@/features/admin/insights", () => ({ getRevenueCatRecent: mocks.getRevenueCatRecent }))
vi.mock("@/features/admin/github-deploys", () => ({ latestProductionDeploy: mocks.latestProductionDeploy }))
vi.mock("@/features/admin/health", () => ({ checkServices: mocks.checkServices }))

import { deliverAlerts, evaluateAlerts, runAlerts, type Alert, type AlertInputs } from "./alerts"

const NOW = new Date("2026-11-17T06:00:00Z")

const base: AlertInputs = {
  today: "2026-11-17",
  yesterday: "2026-11-16",
  counters: [],
  spoonacularYesterdayExhausted: false,
  productionDeployState: "success",
  services: [],
  payingUsers: 0,
  lastWebhookAt: null,
  now: NOW,
}

const keys = (inputs: Partial<AlertInputs>) => evaluateAlerts({ ...base, ...inputs }).map((a) => a.key)

const yesterdayCount = (metric: string, n: number) => ({ day: "2026-11-16", metric, n })
/** A count `daysBack` days before yesterday (2026-11-16). */
const priorCount = (metric: string, n: number, daysBack = 1) => ({
  day: `2026-11-${String(16 - daysBack).padStart(2, "0")}`,
  metric,
  n,
})

describe("evaluateAlerts", () => {
  it("is quiet on a healthy day", () => {
    expect(evaluateAlerts(base)).toEqual([])
  })

  it("flags Spoonacular running out of points yesterday", () => {
    const [alert] = evaluateAlerts({ ...base, spoonacularYesterdayExhausted: true })
    expect(alert.key).toBe("spoonacular-exhausted")
    expect(alert.title).toBe("[alert] Spoonacular ran out of points on 2026-11-16")
    expect(alert.body).toContain("Close this issue when it's handled.")
  })

  it("flags a failed production deploy but not a pending one", () => {
    expect(keys({ productionDeployState: "failure" })).toEqual(["deploy-failed"])
    expect(keys({ productionDeployState: "error" })).toEqual(["deploy-failed"])
    expect(keys({ productionDeployState: "pending" })).toEqual([])
    expect(keys({ productionDeployState: null })).toEqual([])
  })

  it("flags stale RevenueCat webhooks only when someone pays", () => {
    expect(keys({ payingUsers: 1, lastWebhookAt: null })).toEqual(["webhook-stale"])
    expect(keys({ payingUsers: 0, lastWebhookAt: null })).toEqual([])
  })

  it("flags a webhook older than 14 days, not one just under", () => {
    const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
    const day = 24 * 60 * 60 * 1000
    expect(keys({ payingUsers: 2, lastWebhookAt: at(14 * day) })).toEqual([])
    expect(keys({ payingUsers: 2, lastWebhookAt: at(14 * day + 60_000) })).toEqual(["webhook-stale"])
    expect(keys({ payingUsers: 2, lastWebhookAt: at(day) })).toEqual([])
  })

  it("flags an AI refusal spike at 20 and 3 times the usual, not just below", () => {
    // Usual is 0: 20 yesterday fires, 19 does not.
    expect(keys({ counters: [yesterdayCount("ai_allowance_denied", 20)] })).toEqual(["ai-denials-spike"])
    expect(keys({ counters: [yesterdayCount("ai_allowance_denied", 19)] })).toEqual([])
  })

  it("compares against the mean of the 7 days before, with missing days counted as 0", () => {
    // One prior day with 21 gives a mean of 3, so 3x is 9 and 20 fires.
    const oneDay = [yesterdayCount("ai_allowance_denied", 20), priorCount("ai_allowance_denied", 21)]
    expect(keys({ counters: oneDay })).toEqual(["ai-denials-spike"])

    // Seven prior days of 20 give a mean of 20, so 3x is 60: 59 stays quiet and 60 fires.
    const prior = (n: number) => [1, 2, 3, 4, 5, 6, 7].map((d) => priorCount("ai_allowance_denied", n, d))
    expect(keys({ counters: [yesterdayCount("ai_allowance_denied", 59), ...prior(20)] })).toEqual([])
    expect(keys({ counters: [yesterdayCount("ai_allowance_denied", 60), ...prior(20)] })).toEqual(["ai-denials-spike"])
  })

  it("applies the same spike rule to rate_limited:ai", () => {
    expect(keys({ counters: [yesterdayCount("rate_limited:ai", 20)] })).toEqual(["ai-rate-limit-spike"])
    expect(keys({ counters: [yesterdayCount("rate_limited:ai", 19)] })).toEqual([])
  })

  it("flags Supabase or Groq only when down", () => {
    const service = (name: string, state: "ok" | "warn" | "down" | "off") => ({ name, state, detail: "x" })
    expect(keys({ services: [service("Supabase", "down")] })).toEqual(["service-down:Supabase"])
    expect(keys({ services: [service("Groq (AI recipes)", "down")] })).toEqual(["service-down:Groq (AI recipes)"])
    expect(keys({ services: [service("Supabase", "warn"), service("Groq (AI recipes)", "off")] })).toEqual([])
    expect(keys({ services: [service("Spoonacular (recipe search)", "down")] })).toEqual([])
  })

  it("flags 10 or more AI errors yesterday, not 9, and lists the codes", () => {
    const errors = (n: number) => [
      yesterdayCount("ai_error:timeout", n - 3),
      yesterdayCount("ai_error:parse", 3),
      { day: "2026-11-15", metric: "ai_error:parse", n: 50 },
    ]
    expect(keys({ counters: errors(9) })).toEqual([])

    const [alert] = evaluateAlerts({ ...base, counters: errors(10) })
    expect(alert.key).toBe("ai-errors")
    expect(alert.title).toBe("[alert] 10 AI errors yesterday")
    expect(alert.body).toContain("- timeout: 7")
    expect(alert.body).toContain("- parse: 3")
  })
})

describe("deliverAlerts", () => {
  const alertA: Alert = { key: "a", title: "[alert] Known", body: "Body A" }
  const alertB: Alert = { key: "b", title: "[alert] New", body: "Body B" }

  beforeEach(() => {
    vi.stubEnv("GITHUB_DASHBOARD_TOKEN", "t0k")
    vi.stubEnv("GITHUB_REPO", "acme/app")
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** A fake GitHub that answers by method and path, and records each call. */
  function fakeGitHub(answers: (method: string, path: string, body: unknown) => Response) {
    const calls: { method: string; path: string; body: unknown }[] = []
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const path = url.replace("https://api.github.com/repos/acme/app", "")
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined
      const method = init.method ?? "GET"
      calls.push({ method, path, body })
      return answers(method, path, body)
    })
    vi.stubGlobal("fetch", fetchMock)
    return calls
  }

  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })

  const openIssues = [
    { number: 7, title: "[alert] Known", html_url: "https://github.com/acme/app/issues/7", created_at: "2026-11-15T00:00:00Z" },
  ]

  it("comments on an open issue with the same title and opens one otherwise", async () => {
    const calls = fakeGitHub((method, path) => {
      if (method === "POST" && path === "/labels") return json({}, 201)
      if (method === "GET" && path.startsWith("/issues?")) return json(openIssues)
      return json({}, 201)
    })

    await expect(deliverAlerts([alertA, alertB])).resolves.toEqual({ opened: 1, commented: 1 })

    const comment = calls.find((c) => c.path === "/issues/7/comments")
    expect(comment?.method).toBe("POST")
    expect((comment?.body as { body: string }).body).toMatch(/^Still happening on \d{4}-\d{2}-\d{2}\.\n\nBody A$/)

    const created = calls.find((c) => c.method === "POST" && c.path === "/issues")
    expect(created?.body).toEqual({ title: "[alert] New", body: "Body B", labels: ["alert"] })
  })

  it("ignores a 422 when the alert label already exists", async () => {
    fakeGitHub((method, path) => {
      if (method === "POST" && path === "/labels") return json({ message: "Validation Failed" }, 422)
      if (method === "GET") return json([])
      return json({}, 201)
    })

    await expect(deliverAlerts([alertB])).resolves.toEqual({ opened: 1, commented: 0 })
  })

  it("keeps going when one alert fails", async () => {
    fakeGitHub((method, path, body) => {
      if (method === "POST" && path === "/labels") return json({}, 201)
      if (method === "GET") return json([])
      if (method === "POST" && path === "/issues" && (body as { title: string }).title === "[alert] Known") {
        return json({ message: "Server Error" }, 500)
      }
      return json({}, 201)
    })

    await expect(deliverAlerts([alertA, alertB])).resolves.toEqual({ opened: 1, commented: 0 })
  })

  it("returns zeros and makes no calls without GitHub configured", async () => {
    vi.stubEnv("GITHUB_DASHBOARD_TOKEN", "")
    const calls = fakeGitHub(() => json({}))
    await expect(deliverAlerts([alertA])).resolves.toEqual({ opened: 0, commented: 0 })
    expect(calls).toEqual([])
  })
})

describe("runAlerts", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.getDailyCounters.mockResolvedValue([])
    mocks.getSpoonacularDaily.mockResolvedValue([])
    mocks.getRevenueStats.mockResolvedValue({ payingUsers: 0 })
    mocks.getRevenueCatRecent.mockResolvedValue([])
    mocks.latestProductionDeploy.mockResolvedValue(null)
    mocks.checkServices.mockResolvedValue([])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("reports skipped when GitHub isn't configured, and still lists the alerts", async () => {
    vi.stubEnv("GITHUB_DASHBOARD_TOKEN", "")
    mocks.latestProductionDeploy.mockResolvedValue({ state: "failure" })
    await expect(runAlerts(NOW)).resolves.toEqual({
      alerts: ["deploy-failed"],
      opened: 0,
      commented: 0,
      skipped: "github not configured",
    })
  })

  it("never throws, even when every source fails", async () => {
    const failure = new Error("down")
    mocks.getDailyCounters.mockRejectedValue(failure)
    mocks.getSpoonacularDaily.mockRejectedValue(failure)
    mocks.getRevenueStats.mockRejectedValue(failure)
    mocks.getRevenueCatRecent.mockRejectedValue(failure)
    mocks.latestProductionDeploy.mockRejectedValue(failure)
    mocks.checkServices.mockRejectedValue(failure)

    const result = await runAlerts(NOW)
    expect(result.alerts).toEqual([])
    expect(result.opened).toBe(0)
    expect(result.commented).toBe(0)
  })

  it("never throws when GitHub calls fail after the rules ran", async () => {
    vi.stubEnv("GITHUB_DASHBOARD_TOKEN", "t0k")
    vi.stubEnv("GITHUB_REPO", "acme/app")
    mocks.latestProductionDeploy.mockResolvedValue({ state: "error" })
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")))

    await expect(runAlerts(NOW)).resolves.toEqual({ alerts: [], opened: 0, commented: 0, skipped: "error" })
  })
})
