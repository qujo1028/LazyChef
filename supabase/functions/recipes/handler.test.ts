import { describe, expect, it, vi } from "vitest"

import type { RecipeDetail, RecipeSummary } from "../_shared/core/recipe-shapes.ts"
import { memoryStore, recipeCacheKey, suggestionsCacheKey, type CacheStore } from "./cache.ts"
import { createHandler, MAX_BODY_BYTES, type Caller, type HandlerDeps } from "./handler.ts"
import { SpoonacularError, type Spoonacular } from "./spoonacular.ts"

const HOUSEHOLD = "4f7c2a1e-9b3d-4c5e-8f6a-1b2c3d4e5f60"
const OTHER = "00000000-0000-4000-8000-000000000000"
const TOKEN = "user-jwt"
const NOW = new Date("2026-11-18T15:00:00Z")
const quota = (used: number, left: number) => ({ request: 1, used, left })

const summary = (id: number, extra: Partial<RecipeSummary> = {}): RecipeSummary => ({
  id,
  title: `Recipe ${id}`,
  image: null,
  readyInMinutes: null,
  servings: null,
  used: [],
  missed: [],
  ...extra,
})

const detail = (id: number): RecipeDetail => ({
  id,
  title: `Recipe ${id}`,
  image: null,
  readyInMinutes: 20,
  servings: 2,
  sourceUrl: null,
  sourceName: null,
  summary: null,
  ingredients: [],
  steps: [],
  dishTypes: [],
})

function fakeSpoonacular(): Spoonacular & { [K in keyof Spoonacular]: ReturnType<typeof vi.fn> } {
  return {
    findByIngredients: vi.fn(async () => ({ recipes: [summary(1), summary(2)], quota: quota(1.4, 48.6) })),
    search: vi.fn(async () => ({ recipes: [summary(3, { readyInMinutes: 15 })], quota: quota(2.2, 47.8) })),
    informationBulk: vi.fn(async (ids: readonly number[]) => ({ recipes: ids.map(detail), quota: quota(1, 49) })),
  } as never
}

function setup(overrides: Partial<HandlerDeps> = {}, caller: Partial<Caller> = {}) {
  const spoonacular = fakeSpoonacular()
  const store: CacheStore = memoryStore(() => NOW.getTime())
  const takeRateLimit = vi.fn(async () => true)
  const isMember = vi.fn(async (id: string) => id === HOUSEHOLD)
  const fullCaller: Caller = { isMember, takeRateLimit, ...caller }
  const authenticate = vi.fn(async (token: string) => (token === TOKEN ? fullCaller : null))
  const log = vi.fn()
  const handle = createHandler({ spoonacular, store, authenticate, now: () => NOW, log, ...overrides })
  return { handle, spoonacular, store, takeRateLimit, isMember, authenticate, log }
}

function post(body: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  return new Request("http://localhost/functions/v1/recipes", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function read(response: Response) {
  return { status: response.status, body: await response.json() }
}

const suggest = (names: string[] = ["eggs", "rice"], filters = { type: null, maxTime: null, query: null }) => ({
  action: "suggest",
  householdId: HOUSEHOLD,
  names,
  filters,
})

describe("recipes handler: transport and auth", () => {
  it("answers CORS preflight", async () => {
    const { handle } = setup()
    const response = await handle(new Request("http://localhost/", { method: "OPTIONS" }))
    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("authorization")
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("apikey")
  })

  it("only takes POST", async () => {
    const { handle } = setup()
    expect((await read(await handle(new Request("http://localhost/", { method: "GET" })))).status).toBe(405)
  })

  it("needs a valid token", async () => {
    const { handle, spoonacular } = setup()
    expect(await read(await handle(post(suggest(), null)))).toMatchObject({ status: 401, body: { code: "unauthorized" } })
    expect(await read(await handle(post(suggest(), "forged")))).toMatchObject({ status: 401, body: { code: "unauthorized" } })
    expect(spoonacular.findByIngredients).not.toHaveBeenCalled()
  })

  it("refuses bad bodies before checking anything else", async () => {
    const { handle, authenticate } = setup()
    expect(await read(await handle(post("{not json")))).toMatchObject({ status: 400, body: { code: "bad_request" } })
    expect(await read(await handle(post({ action: "suggest", householdId: "nope", names: [] })))).toMatchObject({ status: 400 })
    const big = { action: "quota", pad: "x".repeat(MAX_BODY_BYTES) }
    expect(await read(await handle(post(big)))).toMatchObject({ status: 400 })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it("is not_configured without a Spoonacular key, after auth", async () => {
    const { handle } = setup({ spoonacular: null })
    expect(await read(await handle(post({ action: "quota" })))).toMatchObject({ status: 503, body: { code: "not_configured" } })
    expect(await read(await handle(post({ action: "quota" }, "forged")))).toMatchObject({ status: 401 })
  })

  it("only serves members of the household", async () => {
    const { handle, spoonacular } = setup()
    const response = await read(await handle(post({ ...suggest(), householdId: OTHER })))
    expect(response).toMatchObject({ status: 403, body: { code: "unauthorized" } })
    const info = await read(await handle(post({ action: "info", householdId: OTHER, ids: [1] })))
    expect(info.status).toBe(403)
    expect(spoonacular.findByIngredients).not.toHaveBeenCalled()
    expect(spoonacular.informationBulk).not.toHaveBeenCalled()
  })

  it("fails closed when auth or the database can't answer", async () => {
    const { handle, spoonacular, log } = setup({}, {
      takeRateLimit: async () => {
        throw new Error("db down")
      },
    })
    expect(await read(await handle(post(suggest())))).toMatchObject({ status: 502, body: { code: "upstream" } })
    expect(spoonacular.findByIngredients).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN)

    const broken = setup({
      authenticate: async () => {
        throw new Error("auth down")
      },
    })
    expect(await read(await broken.handle(post(suggest())))).toMatchObject({ status: 502 })
  })
})

describe("recipes handler: quota", () => {
  it("returns today's quota", async () => {
    const { handle, store } = setup()
    expect(await read(await handle(post({ action: "quota" })))).toEqual({
      status: 200,
      body: { quota: { pointsLeft: null, resetsAt: "2026-11-19T00:00:00.000Z", resting: false } },
    })
    await store.record({ quota: quota(48, 2) })
    expect((await read(await handle(post({ action: "quota" })))).body.quota).toMatchObject({ pointsLeft: 2, resting: true })
  })
})

describe("recipes handler: suggest", () => {
  it("calls findByIngredients once, then serves the cache to anyone", async () => {
    const { handle, spoonacular, takeRateLimit } = setup()
    const first = await read(await handle(post(suggest())))
    expect(first).toMatchObject({ status: 200, body: { cached: false, quota: { pointsLeft: 48.6, resting: false } } })
    expect(first.body.recipes.map((r: RecipeSummary) => r.id)).toEqual([1, 2])
    const second = await read(await handle(post(suggest(["Rice", "egg"]))))
    expect(second.body).toMatchObject({ cached: true })
    expect(spoonacular.findByIngredients).toHaveBeenCalledTimes(1)
    expect(takeRateLimit).toHaveBeenCalledTimes(1)
    expect(takeRateLimit).toHaveBeenCalledWith("recipe_search")
  })

  it("uses complexSearch when a filter is on", async () => {
    const { handle, spoonacular } = setup()
    const filters = { type: "breakfast", maxTime: 15, query: null }
    const response = await read(await handle(post(suggest(["oats"], filters as never))))
    expect(response.body.recipes[0]).toMatchObject({ id: 3 })
    expect(spoonacular.search).toHaveBeenCalledWith({ names: ["oats"], type: "breakfast", maxTime: 15, query: null })
    expect(spoonacular.findByIngredients).not.toHaveBeenCalled()
  })

  it("returns nothing, for free, with no names and no words", async () => {
    const { handle, spoonacular, takeRateLimit } = setup()
    expect((await read(await handle(post(suggest([]))))).body).toMatchObject({ recipes: [], cached: false })
    expect(spoonacular.findByIngredients).not.toHaveBeenCalled()
    expect(takeRateLimit).not.toHaveBeenCalled()
  })

  it("fills in cook times from cached recipe details", async () => {
    const { handle, store } = setup()
    await store.put(recipeCacheKey(2), detail(2))
    const response = await read(await handle(post(suggest())))
    expect(response.body.recipes.map((r: RecipeSummary) => r.readyInMinutes)).toEqual([null, 20])
  })

  it("is rate_limited when the person is over the hour's limit", async () => {
    const { handle, spoonacular } = setup({}, { takeRateLimit: async () => false })
    expect(await read(await handle(post(suggest())))).toMatchObject({ status: 429, body: { code: "rate_limited", quota: {} } })
    expect(spoonacular.findByIngredients).not.toHaveBeenCalled()
  })

  it("rests (200) under the reserve, but still serves cached results", async () => {
    const { handle, store, spoonacular } = setup()
    const key = await suggestionsCacheKey(["eggs"], { type: null, maxTime: null, query: null })
    await store.put(key, [summary(9)])
    await store.record({ quota: quota(48, 2) })
    const cached = await read(await handle(post(suggest(["eggs"]))))
    expect(cached).toMatchObject({ status: 200, body: { cached: true, quota: { resting: true } } })
    const fresh = await read(await handle(post(suggest(["milk"]))))
    expect(fresh).toMatchObject({ status: 200, body: { code: "resting", quota: { resting: true, pointsLeft: 2 } } })
    expect(spoonacular.findByIngredients).not.toHaveBeenCalled()
  })

  it("rests after Spoonacular says 402", async () => {
    const { handle, spoonacular, store } = setup()
    spoonacular.findByIngredients.mockRejectedValueOnce(new SpoonacularError("quota", { status: 402, quota: quota(50, 0) }))
    expect(await read(await handle(post(suggest())))).toMatchObject({ status: 200, body: { code: "resting", quota: { resting: true, pointsLeft: 0 } } })
    expect(await store.usage()).toMatchObject({ exhausted: true })
  })

  it("is upstream (502) when Spoonacular fails", async () => {
    const { handle, spoonacular, log } = setup()
    spoonacular.findByIngredients.mockRejectedValueOnce(new SpoonacularError("http", { status: 500 }))
    expect(await read(await handle(post(suggest())))).toMatchObject({ status: 502, body: { code: "upstream" } })
    expect(log.mock.calls[0][0]).toContain("http (500)")
  })
})

describe("recipes handler: info", () => {
  const info = (ids: number[]) => ({ action: "info", householdId: HOUSEHOLD, ids })

  it("serves cached recipes free and bulk-loads the rest, in the order asked", async () => {
    const { handle, store, spoonacular, takeRateLimit } = setup()
    await store.put(recipeCacheKey(7), detail(7))
    const response = await read(await handle(post(info([8, 7, 9]))))
    expect(response.status).toBe(200)
    expect(response.body.recipes.map((r: RecipeDetail) => r.id)).toEqual([8, 7, 9])
    expect(spoonacular.informationBulk).toHaveBeenCalledWith([8, 9])
    expect(takeRateLimit).toHaveBeenCalledTimes(2)
    expect(takeRateLimit).toHaveBeenCalledWith("recipe_open")
    // Now cached for the next person.
    await read(await handle(post(info([8, 9]))))
    expect(spoonacular.informationBulk).toHaveBeenCalledTimes(1)
  })

  it("only fetches as many uncached recipes as the rate limit allows", async () => {
    let left = 1
    const { handle, spoonacular } = setup({}, { takeRateLimit: async () => left-- > 0 })
    const response = await read(await handle(post(info([1, 2, 3]))))
    expect(response).toMatchObject({ status: 200 })
    expect(response.body.recipes.map((r: RecipeDetail) => r.id)).toEqual([1])
    expect(spoonacular.informationBulk).toHaveBeenCalledWith([1])
  })

  it("is rate_limited when nothing can be shown", async () => {
    const { handle } = setup({}, { takeRateLimit: async () => false })
    expect(await read(await handle(post(info([1]))))).toMatchObject({ status: 429, body: { code: "rate_limited" } })
  })

  it("rests when out of points, but cached recipes still come back", async () => {
    const { handle, store, spoonacular } = setup()
    await store.record({ quota: quota(50, 0.5) })
    expect(await read(await handle(post(info([1]))))).toMatchObject({ status: 200, body: { code: "resting" } })
    await store.put(recipeCacheKey(1), detail(1))
    const partial = await read(await handle(post(info([1, 2]))))
    expect(partial).toMatchObject({ status: 200, body: { quota: { resting: true } } })
    expect(partial.body.recipes.map((r: RecipeDetail) => r.id)).toEqual([1])
    expect(spoonacular.informationBulk).not.toHaveBeenCalled()
  })

  it("ignores recipes Spoonacular sends back that weren't asked for", async () => {
    const { handle, spoonacular } = setup()
    spoonacular.informationBulk.mockResolvedValueOnce({ recipes: [detail(1), detail(99)], quota: quota(1, 49) })
    const response = await read(await handle(post(info([1]))))
    expect(response.body.recipes.map((r: RecipeDetail) => r.id)).toEqual([1])
  })

  it("is upstream (502) when Spoonacular fails and nothing is cached", async () => {
    const { handle, spoonacular } = setup()
    spoonacular.informationBulk.mockRejectedValueOnce(new SpoonacularError("timeout"))
    expect(await read(await handle(post(info([1]))))).toMatchObject({ status: 502, body: { code: "upstream" } })
  })
})
