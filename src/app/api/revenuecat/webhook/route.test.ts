import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const upsert = vi.fn()
const syncSubscription = vi.fn()
let configured = true

vi.mock("@/lib/supabase/service", () => ({
  getServerDb: () => ({ from: () => ({ upsert }) }),
}))
vi.mock("@/features/pro/sync", () => ({
  isProSyncConfigured: () => configured,
  syncSubscription: (id: string) => syncSubscription(id),
}))

const { POST } = await import("./route")

const AUTH = "Bearer test-secret"
const ALEX = "8b7a3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"

function post(body: unknown, authorization: string | null = AUTH) {
  const headers = new Headers({ "content-type": "application/json" })
  if (authorization) headers.set("authorization", authorization)
  return POST(new Request("http://localhost/api/revenuecat/webhook", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }))
}

const purchase = { api_version: "1.0", event: { id: "evt_1", type: "INITIAL_PURCHASE", app_user_id: ALEX, event_timestamp_ms: 1 } }

describe("POST /api/revenuecat/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("REVENUECAT_WEBHOOK_AUTH", AUTH)
    configured = true
    upsert.mockReset().mockResolvedValue({ error: null })
    syncSubscription.mockReset().mockResolvedValue({ user_id: ALEX })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("answers 503 until it's set up", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_AUTH", "")
    expect((await post(purchase)).status).toBe(503)
    vi.stubEnv("REVENUECAT_WEBHOOK_AUTH", AUTH)
    configured = false
    expect((await post(purchase)).status).toBe(503)
    expect(syncSubscription).not.toHaveBeenCalled()
  })

  it("rejects a missing or wrong Authorization header", async () => {
    expect((await post(purchase, null)).status).toBe(401)
    expect((await post(purchase, "Bearer nope")).status).toBe(401)
    expect(upsert).not.toHaveBeenCalled()
  })

  it("rejects bodies that aren't events", async () => {
    expect((await post("not json")).status).toBe(400)
    expect((await post({ hello: "world" })).status).toBe(400)
  })

  it("logs the event once and syncs the customer", async () => {
    const response = await post(purchase)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, synced: 1 })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt_1", type: "INITIAL_PURCHASE", app_user_id: ALEX }),
      { onConflict: "id", ignoreDuplicates: true },
    )
    expect(syncSubscription).toHaveBeenCalledWith(ALEX)
  })

  it("logs a dashboard test event without syncing anyone", async () => {
    const response = await post({ event: { ...purchase.event, id: "evt_test", type: "TEST" } })
    expect(await response.json()).toEqual({ ok: true, test: true })
    expect(syncSubscription).not.toHaveBeenCalled()
  })

  it("answers 500 (so RevenueCat retries) when saving or syncing fails", async () => {
    upsert.mockResolvedValueOnce({ error: { message: "db down" } })
    expect((await post(purchase)).status).toBe(500)
    syncSubscription.mockRejectedValueOnce(new Error("RevenueCat answered 503."))
    expect((await post(purchase)).status).toBe(500)
  })
})
