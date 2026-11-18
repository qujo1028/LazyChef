// The recipes Edge Function's request handling, with every outside dependency passed in
// (index.ts wires Deno, Supabase and Spoonacular), so Vitest can run it end to end.
// Contract: supabase/functions/_shared/core/edge-contract.ts (a copy of packages/core's).
import type {
  EdgeErrorCode,
  EdgeFailure,
  InfoResponse,
  QuotaResponse,
  RecipeQuota,
  SuggestFilters,
  SuggestResponse,
} from "../_shared/core/edge-contract.ts"
import type { RecipeDetail, RecipeSummary } from "../_shared/core/recipe-shapes.ts"
import {
  cachedSpoonacular,
  INFO_RESERVE,
  isResting,
  recipeCacheKey,
  suggestionsCacheKey,
  toRecipeQuota,
  type CacheStore,
  type Usage,
} from "./cache.ts"
import { bulkCost, findCost, searchCost, SpoonacularError, type Spoonacular } from "./spoonacular.ts"
import { parseRequest } from "./validate.ts"

export type RateLimitBucket = "recipe_search" | "recipe_open"

/** The signed-in person making the request. Methods run as them (RLS applies) and throw on database errors. */
export type Caller = {
  isMember(householdId: string): Promise<boolean>
  /** take_rate_limit(bucket): false once they're over this hour's limit. */
  takeRateLimit(bucket: RateLimitBucket): Promise<boolean>
}

export type HandlerDeps = {
  /** Null when SPOONACULAR_API_KEY isn't set. */
  spoonacular: Spoonacular | null
  /** The shared cache and usage (service role). Null when the function can't reach them. */
  store: CacheStore | null
  /** Checks the access token with Supabase Auth: null when it isn't a valid session. Throws when it can't tell. */
  authenticate(token: string): Promise<Caller | null>
  now?: () => Date
  /** Server log. Never given keys, tokens or pantry names. */
  log?: (message: string) => void
}

/** Larger bodies are refused before parsing (60 names of 100 characters fit easily). */
export const MAX_BODY_BYTES = 16 * 1024

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
}

const STATUS: Record<EdgeErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  rate_limited: 429,
  not_configured: 503,
  // Not an error for the app: cached results still come back, new searches wait for the reset.
  resting: 200,
  upstream: 502,
}

const MESSAGES = {
  resting: "We've used today's recipe searches. New ideas are back after the daily reset.",
  rate_limited: "That's a lot of lookups for one hour. Try again in a bit.",
  upstream: "Couldn't load recipe ideas right now. Try again in a bit.",
  not_configured: "Recipe ideas from Spoonacular aren't set up yet.",
  unauthorized: "Sign in again to see recipe ideas.",
  not_member: "You're not in that household.",
} as const

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  })
}

function failure(code: EdgeErrorCode, error: string, quota?: RecipeQuota, status = STATUS[code]): Response {
  const body: EdgeFailure = quota ? { error, code, quota } : { error, code }
  return json(body, status)
}

class RateLimited extends Error {}

/** The bearer token from the Authorization header, or null. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match ? match[1] : null
}

/**
 * Reads the body as JSON, stopping as soon as it passes MAX_BODY_BYTES (a chunked request has no
 * Content-Length, so the stream itself is capped). Undefined when it's too big or isn't JSON.
 */
export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("Content-Length"))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return undefined
  if (!req.body) return undefined
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      return undefined
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return undefined
  }
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? ((message: string) => console.warn(message))

  function describe(error: unknown): string {
    if (error instanceof SpoonacularError) return `spoonacular ${error.code}${error.status ? ` (${error.status})` : ""}`
    return error instanceof Error ? error.name : "unknown error"
  }

  async function currentQuota(store: CacheStore): Promise<RecipeQuota> {
    return toRecipeQuota(await store.usage(), now())
  }

  /** findByIngredients doesn't say how long a recipe takes: fill it in from recipes cached in the last hour. */
  async function withCachedTimes(store: CacheStore, recipes: RecipeSummary[]): Promise<RecipeSummary[]> {
    const missing = recipes.filter((recipe) => recipe.readyInMinutes === null)
    if (missing.length === 0) return recipes
    const found = await store.getMany(missing.map((recipe) => recipeCacheKey(recipe.id)))
    if (found.size === 0) return recipes
    return recipes.map((recipe) => {
      const detail = found.get(recipeCacheKey(recipe.id)) as Partial<RecipeDetail> | undefined
      return detail && recipe.readyInMinutes === null && typeof detail.readyInMinutes === "number"
        ? { ...recipe, readyInMinutes: detail.readyInMinutes }
        : recipe
    })
  }

  async function suggest(
    caller: Caller,
    spoonacular: Spoonacular,
    store: CacheStore,
    names: string[],
    filters: SuggestFilters,
  ): Promise<Response> {
    if (names.length === 0 && filters.query === null) {
      const body: SuggestResponse = { recipes: [], cached: false, quota: await currentQuota(store) }
      return json(body)
    }
    // findByIngredients can't filter, so any filter makes it a complexSearch (as on the web).
    const filtered = filters.type !== null || filters.maxTime !== null || filters.query !== null
    const key = await suggestionsCacheKey(names, filters)
    try {
      const result = await cachedSpoonacular<RecipeSummary[]>(
        store,
        key,
        async () => {
          const { recipes, quota } = filtered
            ? await spoonacular.search({ names, ...filters })
            : await spoonacular.findByIngredients(names)
          return { value: recipes, quota }
        },
        {
          cost: filtered ? searchCost() : findCost(),
          beforeSpend: async () => {
            if (!(await caller.takeRateLimit("recipe_search"))) throw new RateLimited()
          },
        },
      )
      const recipes = await withCachedTimes(store, Array.isArray(result.value) ? result.value : [])
      const body: SuggestResponse = { recipes, cached: result.fromCache, quota: toRecipeQuota(result.usage, now()) }
      return json(body)
    } catch (error) {
      if (error instanceof RateLimited) return failure("rate_limited", MESSAGES.rate_limited, await currentQuota(store))
      if (error instanceof SpoonacularError && error.code === "quota") {
        return failure("resting", MESSAGES.resting, await currentQuota(store))
      }
      if (!(error instanceof SpoonacularError)) throw error
      log(`[recipes] suggest failed: ${describe(error)}`)
      return failure("upstream", MESSAGES.upstream, await currentQuota(store))
    }
  }

  /**
   * Full recipes: whatever's cached, plus one informationBulk call for the rest. When the rest
   * can't be fetched (resting, rate limited, Spoonacular failed), the cached ones still come
   * back, in the order asked; the failure is returned only when there's nothing to show.
   */
  async function info(caller: Caller, spoonacular: Spoonacular, store: CacheStore, ids: number[]): Promise<Response> {
    const [hits, usage] = await Promise.all([store.getMany(ids.map(recipeCacheKey)), store.usage()])
    const details = new Map<number, RecipeDetail>()
    for (const value of hits.values()) {
      const recipe = value as RecipeDetail | null
      if (recipe && typeof recipe.id === "number" && ids.includes(recipe.id)) details.set(recipe.id, recipe)
    }

    let latest: Usage | null = usage
    let problem: EdgeErrorCode | null = null
    const missing = ids.filter((id) => !details.has(id))
    // As many of the missing ones as today's points cover (keeping INFO_RESERVE back).
    let affordable = missing.length
    while (affordable > 0 && isResting(usage, bulkCost(affordable), INFO_RESERVE)) affordable--
    if (affordable < missing.length) problem = "resting"
    if (affordable > 0) {
      // One hit per uncached recipe (each costs points), so random ids can't drain the day.
      const granted = await Promise.allSettled(missing.slice(0, affordable).map(() => caller.takeRateLimit("recipe_open")))
      const allowed = granted.filter((result) => result.status === "fulfilled" && result.value).length
      if (allowed === 0 && granted.some((result) => result.status === "rejected")) throw new Error("Rate limit check failed")
      const toFetch = missing.slice(0, allowed)
      if (allowed < affordable) problem ??= "rate_limited"
      if (toFetch.length > 0) {
        const cost = bulkCost(toFetch.length)
        try {
          const { recipes, quota } = await spoonacular.informationBulk(toFetch)
          const fetched = recipes.filter((recipe) => toFetch.includes(recipe.id))
          for (const recipe of fetched) details.set(recipe.id, recipe)
          const [fresh] = await Promise.all([
            store.record({ quota, estimate: cost }),
            ...fetched.map((recipe) => store.put(recipeCacheKey(recipe.id), recipe)),
          ])
          latest = fresh ?? latest
        } catch (error) {
          if (!(error instanceof SpoonacularError)) throw error
          if (error.code === "quota") {
            latest = (await store.record({ quota: error.quota, exhausted: true })) ?? latest
            problem = "resting"
          } else {
            log(`[recipes] info failed: ${describe(error)}`)
            problem = "upstream"
          }
        }
      }
    }

    const recipes = ids.flatMap((id) => details.get(id) ?? [])
    const quota = toRecipeQuota(latest, now())
    if (problem && recipes.length === 0) return failure(problem, MESSAGES[problem], quota)
    const body: InfoResponse = { recipes, quota }
    return json(body)
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS })
    if (req.method !== "POST") return failure("bad_request", "Use POST.", undefined, 405)

    const token = bearerToken(req.headers.get("Authorization"))
    if (!token) return failure("unauthorized", MESSAGES.unauthorized)

    try {
      // Who's asking first, so a stranger's body is never read.
      const caller = await deps.authenticate(token)
      if (!caller) return failure("unauthorized", MESSAGES.unauthorized)

      const parsed = parseRequest(await readJson(req))
      if (!parsed.ok) return failure("bad_request", parsed.error)

      const { spoonacular, store } = deps
      if (!spoonacular || !store) return failure("not_configured", MESSAGES.not_configured)

      const request = parsed.request
      if (request.action === "quota") {
        const body: QuotaResponse = { quota: await currentQuota(store) }
        return json(body)
      }
      if (!(await caller.isMember(request.householdId))) return failure("unauthorized", MESSAGES.not_member, undefined, 403)
      if (request.action === "suggest") return await suggest(caller, spoonacular, store, request.names, request.filters)
      return await info(caller, spoonacular, store, request.ids)
    } catch (error) {
      // Auth, membership, rate limit or cache failures: fail closed (no Spoonacular call).
      log(`[recipes] request failed: ${describe(error)}`)
      return failure("upstream", MESSAGES.upstream)
    }
  }
}
