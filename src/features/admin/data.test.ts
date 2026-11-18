import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const rpc = vi.fn()
const limit = vi.fn()
let db: unknown = null
vi.mock("@/lib/supabase/service", () => ({ getServerDb: () => db }))

import { logAdminAction, getRecentAdminActions } from "./audit"
import { groupPopular, groupRetention } from "./insights"
import { MissingServerDbError } from "./load"
import { bumpMetric } from "./metrics"
import { captureSnapshotIfMissing, getProStats, getRevenueStats, getUsageStats, parseByStore } from "./overview"
import { getAiTopHouseholds, getRateLimitStats, getSpoonacularDaily, intervalToSeconds, toNumber } from "./stats"
import { findUserByEmail, grantComp, parseHouseholds, revokeComp } from "./support-db"

beforeEach(() => {
  rpc.mockReset()
  limit.mockReset()
  db = {
    rpc,
    from: () => ({ select: () => ({ order: () => ({ limit }) }) }),
  }
})

describe("toNumber", () => {
  it("converts numeric strings and never returns NaN", () => {
    expect(toNumber("12.50")).toBe(12.5)
    expect(toNumber(7)).toBe(7)
    expect(toNumber(null)).toBe(0)
    expect(toNumber(undefined)).toBe(0)
    expect(toNumber("nope")).toBe(0)
  })
})

describe("intervalToSeconds", () => {
  it("reads Postgres interval text", () => {
    expect(intervalToSeconds("01:00:00")).toBe(3600)
    expect(intervalToSeconds("00:15:00")).toBe(900)
    expect(intervalToSeconds("1 day 00:00:30")).toBe(86430)
    expect(intervalToSeconds("2 days 01:00:00")).toBe(176400)
    expect(intervalToSeconds("garbage")).toBe(0)
    expect(intervalToSeconds(null)).toBe(0)
  })
})

describe("groupPopular", () => {
  it("groups by list, keeps order, converts counts, and always has every list", () => {
    const out = groupPopular([
      { list: "cooked", name: "Pancakes", n: "3" },
      { list: "cooked", name: "Soup", n: 2 },
      { list: "pantry", name: "rice", n: 9 },
      { list: "something_else", name: "ignored", n: 1 },
    ])
    expect(out.cooked).toEqual([
      { name: "Pancakes", n: 3 },
      { name: "Soup", n: 2 },
    ])
    expect(out.pantry).toEqual([{ name: "rice", n: 9 }])
    expect(out.saved).toEqual([])
    expect(Object.keys(out).sort()).toEqual(["cooked", "pantry", "rated_down", "rated_up", "saved", "wasted"])
  })
})

describe("groupRetention", () => {
  it("groups weeks under their cohort, oldest cohort first", () => {
    const out = groupRetention([
      { cohort_week: "2026-11-09", size: 4, week_n: 0, active: 3 },
      { cohort_week: "2026-11-02", size: "5", week_n: "1", active: "2" },
      { cohort_week: "2026-11-02", size: "5", week_n: "0", active: "4" },
    ])
    expect(out).toEqual([
      {
        cohortWeek: "2026-11-02",
        size: 5,
        weeks: [
          { weekN: 0, active: 4 },
          { weekN: 1, active: 2 },
        ],
      },
      { cohortWeek: "2026-11-09", size: 4, weeks: [{ weekN: 0, active: 3 }] },
    ])
  })
})

describe("parseByStore and parseHouseholds", () => {
  it("parse JSON defensively", () => {
    expect(parseByStore({ app_store: 2, play_store: "1" })).toEqual({ app_store: 2, play_store: 1 })
    expect(parseByStore(null)).toEqual({})
    expect(parseByStore([1, 2])).toEqual({})
    expect(parseHouseholds([{ id: "h1", name: "Maple", role: "owner", members: "2" }, { name: "no id" }, null])).toEqual([
      { id: "h1", name: "Maple", role: "owner", members: 2 },
    ])
    expect(parseHouseholds({})).toEqual([])
  })
})

describe("wrappers", () => {
  it("throw MissingServerDbError when the secret key isn't set", async () => {
    db = null
    await expect(getRateLimitStats()).rejects.toBeInstanceOf(MissingServerDbError)
    await expect(findUserByEmail("a@b.co")).rejects.toBeInstanceOf(MissingServerDbError)
  })

  it("throw a plain Error with the RPC's message", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied for function admin_user_stats" } })
    await expect(getRevenueStats()).rejects.toThrow("permission denied for function admin_user_stats")
    await expect(getRevenueStats()).rejects.not.toBeInstanceOf(MissingServerDbError)
  })

  it("convert snake_case rows and numeric strings", async () => {
    rpc.mockResolvedValue({
      data: [
        { bucket: "ai", max_hits: 30, window_length: "01:00:00", active_users: 2, users_at_limit: "1", hits_24h: "44" },
      ],
      error: null,
    })
    expect(await getRateLimitStats()).toEqual([
      { bucket: "ai", maxHits: 30, windowSeconds: 3600, activeUsers: 2, usersAtLimit: 1, hits24h: 44 },
    ])
    expect(rpc).toHaveBeenCalledWith("admin_rate_limit_stats")
  })

  it("read one-row functions and convert numerics", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          gross_all_time: "49.97",
          gross_30d: "44.98",
          gross_month: 39.99,
          refunds_30d: "4.99",
          net_30d_est: "27.993",
          mrr_est: "8.3225",
          paying_users: 2,
          trials_started_30d: 1,
          expirations_30d: 0,
          sandbox_events_30d: 1,
        },
      ],
      error: null,
    })
    const stats = await getRevenueStats()
    expect(stats.grossAllTime).toBe(49.97)
    expect(stats.mrrEst).toBe(8.3225)
    expect(stats.payingUsers).toBe(2)
    rpc.mockResolvedValue({ data: [], error: null })
    await expect(getRevenueStats()).rejects.toThrow(/No revenue numbers/)
  })

  it("getProStats parses by_store", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          active_subscriptions: 2,
          trials: 1,
          not_renewing: 1,
          sandbox: 0,
          comps_active: 0,
          pro_households: 2,
          by_store: { app_store: 1, play_store: 1 },
        },
      ],
      error: null,
    })
    expect((await getProStats()).byStore).toEqual({ app_store: 1, play_store: 1 })
  })

  it("getUsageStats keeps null windows null", async () => {
    rpc.mockResolvedValue({
      data: [
        { metric: "pantry_items_now", all_time: "5", d30: null, d7: null },
        { metric: "ai_calls", all_time: 9, d30: "9", d7: 0 },
      ],
      error: null,
    })
    expect(await getUsageStats()).toEqual([
      { metric: "pantry_items_now", allTime: 5, d30: null, d7: null },
      { metric: "ai_calls", allTime: 9, d30: 9, d7: 0 },
    ])
  })

  it("getAiTopHouseholds passes the limit", async () => {
    rpc.mockResolvedValue({
      data: [{ household_id: "h", household_name: "Fern", uses_7d: "10", at_limit: true }],
      error: null,
    })
    expect(await getAiTopHouseholds(3)).toEqual([{ householdId: "h", householdName: "Fern", uses7d: 10, atLimit: true }])
    expect(rpc).toHaveBeenCalledWith("admin_ai_top_households", { p_limit: 3 })
  })

  it("getSpoonacularDaily returns oldest first and flags estimated days", async () => {
    limit.mockResolvedValue({
      data: [
        { day: "2026-11-17", points_used: "12.5", points_left: null, requests: 3, exhausted_at: null },
        { day: "2026-11-16", points_used: 50, points_left: 0, requests: 20, exhausted_at: "2026-11-16T20:00:00Z" },
      ],
      error: null,
    })
    expect(await getSpoonacularDaily(30)).toEqual([
      { day: "2026-11-16", pointsUsed: 50, pointsLeft: 0, requests: 20, estimated: false, exhaustedAt: "2026-11-16T20:00:00Z" },
      { day: "2026-11-17", pointsUsed: 12.5, pointsLeft: null, requests: 3, estimated: true, exhaustedAt: null },
    ])
    expect(limit).toHaveBeenCalledWith(30)
  })

  it("findUserByEmail returns null for no row and a camelCased user otherwise", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await findUserByEmail("x@y.co")).toBeNull()
    rpc.mockResolvedValueOnce({
      data: [
        {
          user_id: "u1",
          email: "a@test.dev",
          display_name: "Alex",
          created_at: "2026-01-01T00:00:00Z",
          last_sign_in_at: null,
          pro_source: "comp",
          comp_expires_at: null,
          comp_note: "friend",
          households: [{ id: "h1", name: "Maple", role: "owner", members: 2 }],
        },
      ],
      error: null,
    })
    const user = await findUserByEmail("a@test.dev")
    expect(user).toMatchObject({ userId: "u1", proSource: "comp", compNote: "friend" })
    expect(user?.households).toEqual([{ id: "h1", name: "Maple", role: "owner", members: 2 }])
    expect(rpc).toHaveBeenLastCalledWith("admin_find_user", { p_email: "a@test.dev" })
  })

  it("grantComp and revokeComp call the right functions", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await grantComp("u1", null, "friend")
    expect(rpc).toHaveBeenLastCalledWith("admin_grant_comp", { p_user_id: "u1", p_expires_at: null, p_note: "friend" })
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await revokeComp("u1")).toBe(true)
    rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await revokeComp("u1")).toBe(false)
    rpc.mockResolvedValueOnce({ data: null, error: { message: "No such user." } })
    await expect(grantComp("nope", null, null)).rejects.toThrow("No such user.")
  })

  it("logAdminAction throws on failure and returns the id on success", async () => {
    rpc.mockResolvedValueOnce({ data: 41, error: null })
    expect(await logAdminAction({ id: "u1", email: "a@test.dev" }, "grant_comp", "u2", { note: "x" })).toBe(41)
    expect(rpc).toHaveBeenLastCalledWith("admin_log_action", {
      p_admin_user_id: "u1",
      p_admin_email: "a@test.dev",
      p_action: "grant_comp",
      p_target: "u2",
      p_details: { note: "x" },
    })
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } })
    await expect(logAdminAction({ id: "u1", email: null }, "a", "b")).rejects.toThrow("boom")
    db = null
    await expect(logAdminAction({ id: "u1", email: null }, "a", "b")).rejects.toBeInstanceOf(MissingServerDbError)
  })

  it("getRecentAdminActions converts rows", async () => {
    rpc.mockResolvedValue({
      data: [
        { id: "7", at: "2026-11-17T00:00:00Z", admin_user_id: "u1", admin_email: null, action: "a", target: "t", details: null },
      ],
      error: null,
    })
    expect(await getRecentAdminActions(5)).toEqual([
      { id: 7, at: "2026-11-17T00:00:00Z", adminUserId: "u1", adminEmail: null, action: "a", target: "t", details: {} },
    ])
  })
})

describe("bumpMetric", () => {
  it("never throws, whatever goes wrong", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Unknown metric." } })
    await expect(bumpMetric("foo")).resolves.toBeUndefined()
    rpc.mockRejectedValueOnce(new Error("network"))
    await expect(bumpMetric("ai_error:timeout")).resolves.toBeUndefined()
    db = null
    await expect(bumpMetric("ai_error:timeout")).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(2)
    log.mockRestore()
  })

  it("counts through bump_daily_metric", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await bumpMetric("spoonacular_cache:hit")
    expect(rpc).toHaveBeenCalledWith("bump_daily_metric", { p_metric: "spoonacular_cache:hit" })
  })
})

describe("captureSnapshotIfMissing", () => {
  it("does nothing when today's snapshot exists", async () => {
    rpc.mockResolvedValueOnce({ data: [{ day: "x" }], error: null })
    await captureSnapshotIfMissing()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it("captures when it is missing", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: null, error: null })
    await captureSnapshotIfMissing()
    expect(rpc).toHaveBeenLastCalledWith("admin_capture_daily_snapshot", { p_day: new Date().toISOString().slice(0, 10) })
  })

  it("never throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } })
    await expect(captureSnapshotIfMissing()).resolves.toBeUndefined()
    db = null
    await expect(captureSnapshotIfMissing()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(2)
    log.mockRestore()
  })
})
