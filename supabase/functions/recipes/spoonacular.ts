// Spoonacular calls for the recipes Edge Function, ported from src/lib/spoonacular (client.ts
// and recipes.ts). No Deno globals: the key and fetch are passed in, so Vitest can drive it.
//
// Free plan: 50 points a day (reset at midnight UTC), 60 requests a minute, 2 at a time.
// Terms: responses may be cached for at most 1 hour; only id/title/image may be kept longer.
import { complexSearchCost, findByIngredientsCost, informationBulkCost } from "../_shared/core/cost.ts"
import { toRecipeDetail, toRecipeSummary, type RecipeDetail, type RecipeSummary } from "../_shared/core/recipe-shapes.ts"

export const SPOONACULAR_BASE_URL = "https://api.spoonacular.com"

const TIMEOUT_MS = 10_000
const MAX_CONCURRENT = 2
const MAX_PER_MINUTE = 60

/** How many recipes to ask for (the same sizes as the web app, so the shared cache matches). */
export const FIND_SIZE = 40
export const SEARCH_SIZE = 20

/** complexSearch add-ons: used/missed lists and the cook time for the cards. */
const SEARCH_ADD_ONS = { fillIngredients: true, addRecipeInformation: true } as const

export const findCost = () => findByIngredientsCost(FIND_SIZE)
export const searchCost = () => complexSearchCost(SEARCH_SIZE, SEARCH_ADD_ONS)
export const bulkCost = informationBulkCost

/** Spoonacular's own meal types (the complexSearch `type` parameter). */
export const MEAL_TYPES = [
  "main course",
  "side dish",
  "dessert",
  "appetizer",
  "salad",
  "bread",
  "breakfast",
  "soup",
  "beverage",
  "sauce",
  "marinade",
  "fingerfood",
  "snack",
  "drink",
] as const

/** From the X-API-Quota-* response headers. Points can be fractional. */
export type SpoonacularQuota = { request: number | null; used: number | null; left: number | null }

export type SpoonacularErrorCode = "bad_key" | "quota" | "rate_limit" | "timeout" | "network" | "http" | "bad_response"

/** A failed Spoonacular call. Never carries the key or the request URL. */
export class SpoonacularError extends Error {
  readonly code: SpoonacularErrorCode
  readonly status: number | null
  readonly quota: SpoonacularQuota | null

  constructor(code: SpoonacularErrorCode, options: { status?: number | null; quota?: SpoonacularQuota | null } = {}) {
    super(`Spoonacular: ${code}`)
    this.name = "SpoonacularError"
    this.code = code
    this.status = options.status ?? null
    this.quota = options.quota ?? null
  }
}

function readNumber(headers: Headers, name: string): number | null {
  const value = headers.get(name)
  if (value === null || value.trim() === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function readQuota(headers: Headers): SpoonacularQuota {
  return {
    request: readNumber(headers, "X-API-Quota-Request"),
    used: readNumber(headers, "X-API-Quota-Used"),
    left: readNumber(headers, "X-API-Quota-Left"),
  }
}

function errorForStatus(status: number): SpoonacularErrorCode {
  if (status === 401 || status === 403) return "bad_key"
  if (status === 402) return "quota"
  if (status === 429) return "rate_limit"
  return "http"
}

function nextUtcMidnight(now: number): number {
  const date = new Date(now)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
}

export type RecipeList = { recipes: RecipeSummary[]; quota: SpoonacularQuota }

export type Spoonacular = {
  findByIngredients(names: readonly string[]): Promise<RecipeList>
  search(options: { names: readonly string[]; type: string | null; maxTime: number | null; query: string | null }): Promise<RecipeList>
  informationBulk(ids: readonly number[]): Promise<{ recipes: RecipeDetail[]; quota: SpoonacularQuota }>
}

/**
 * A Spoonacular client for one key. Its guards (stop after a 402 until midnight UTC, after a
 * 429 for Retry-After, at most 2 calls at a time and 60 a minute) are per instance: create one
 * per isolate, not per request. The key only ever goes in the x-api-key header.
 */
export function createSpoonacular(
  apiKey: string,
  { fetch: fetchImpl = fetch, now = Date.now }: { fetch?: typeof fetch; now?: () => number } = {},
): Spoonacular {
  let blocked: { code: "quota" | "rate_limit"; until: number } | null = null
  const recentStarts: number[] = []
  let active = 0
  const waiting: (() => void)[] = []

  function checkGuards(at: number) {
    if (blocked && blocked.until > at) throw new SpoonacularError(blocked.code)
    blocked = null
    while (recentStarts.length > 0 && recentStarts[0] <= at - 60_000) recentStarts.shift()
    if (recentStarts.length >= MAX_PER_MINUTE) throw new SpoonacularError("rate_limit")
    recentStarts.push(at)
  }

  async function acquireSlot() {
    if (active < MAX_CONCURRENT) {
      active++
      return
    }
    // releaseSlot() hands its slot straight to us, so `active` stays the same.
    await new Promise<void>((resolve) => waiting.push(resolve))
  }

  function releaseSlot() {
    const next = waiting.shift()
    if (next) next()
    else active--
  }

  async function get(path: string, query: Record<string, string | number | boolean>) {
    const url = new URL(path, SPOONACULAR_BASE_URL)
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value))

    checkGuards(now())
    await acquireSlot()
    try {
      let response: Response
      try {
        response = await fetchImpl(url, {
          headers: { "x-api-key": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (cause) {
        const name = cause instanceof Error ? cause.name : ""
        throw new SpoonacularError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network")
      }

      const quota = readQuota(response.headers)
      if (!response.ok) {
        const code = errorForStatus(response.status)
        if (code === "quota") {
          blocked = { code, until: nextUtcMidnight(now()) }
        } else if (code === "rate_limit") {
          const retryAfter = Number(response.headers.get("Retry-After"))
          const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) : 10
          blocked = { code, until: now() + seconds * 1000 }
        }
        await response.body?.cancel().catch(() => {})
        throw new SpoonacularError(code, { status: response.status, quota })
      }

      try {
        return { data: (await response.json()) as unknown, quota }
      } catch {
        throw new SpoonacularError("bad_response", { status: response.status, quota })
      }
    } finally {
      releaseSlot()
    }
  }

  return {
    async findByIngredients(names) {
      const { data, quota } = await get("/recipes/findByIngredients", {
        ingredients: names.join(","),
        number: FIND_SIZE,
        ranking: 2,
        ignorePantry: true,
      })
      if (!Array.isArray(data)) throw new SpoonacularError("bad_response", { quota })
      return { recipes: data.flatMap((raw) => toRecipeSummary(raw) ?? []), quota }
    },

    async search({ names, type, maxTime, query: words }) {
      const query: Record<string, string | number | boolean> = {
        ...SEARCH_ADD_ONS,
        ignorePantry: true,
        sort: "min-missing-ingredients",
        number: SEARCH_SIZE,
      }
      if (names.length > 0) query.includeIngredients = names.join(",")
      if (type) query.type = type
      if (maxTime) query.maxReadyTime = maxTime
      if (words) query.query = words
      const { data, quota } = await get("/recipes/complexSearch", query)
      const results = data !== null && typeof data === "object" ? (data as { results?: unknown }).results : undefined
      if (!Array.isArray(results)) throw new SpoonacularError("bad_response", { quota })
      return { recipes: results.flatMap((raw) => toRecipeSummary(raw) ?? []), quota }
    },

    async informationBulk(ids) {
      const { data, quota } = await get("/recipes/informationBulk", { ids: ids.join(","), includeNutrition: false })
      if (!Array.isArray(data)) throw new SpoonacularError("bad_response", { quota })
      return { recipes: data.flatMap((raw) => toRecipeDetail(raw) ?? []), quota }
    },
  }
}
