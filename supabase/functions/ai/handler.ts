// The ai Edge Function's request handling, with every outside dependency passed in (index.ts
// wires Deno, Supabase and Groq), so Vitest can run it end to end. A port of the web's
// getMealIdeas (src/features/recipes/ai-idea/meal-actions.ts), plus the optional hint.
// Contract: supabase/functions/_shared/core/ai-contract.ts (a copy of packages/core's).
import type {
  AiAllowance,
  AiErrorCode,
  AiFailure,
  AiIdea,
  AllowanceResponse,
  IdeasResponse,
} from "../_shared/core/ai-contract.ts"
import { AI_FREE_WEEKLY, limitMessage, type AllowanceRow } from "../_shared/core/ai-allowance-core.ts"
import { cleanNames, missingIngredients, namesForDiet, type AiRecipe } from "../_shared/core/ai-idea.ts"
import {
  buildMealIdeasMessages,
  ideasCacheKeySource,
  keepIdeas,
  MEAL_IDEAS_TTL_SECONDS,
  mealIdeasCacheKey,
  mealIdeasReplySchema,
  readCachedIdeas,
  type CachedIdeas,
  type IdeaMeal,
} from "../_shared/core/ai-meal-ideas.ts"
import type { DietInput } from "../_shared/core/diet.ts"
import { hasRestrictions, preferencesSchema } from "../_shared/core/options.ts"
import { pantrySearchNames, type PantryNameRow } from "../_shared/core/pantry-names.ts"
import { hintRefs, NO_HINTS, tasteHints, type TasteHints, type TasteRating } from "../_shared/core/taste-hints.ts"
import { bearerToken, CORS_HEADERS, json, readJson } from "../_shared/http.ts"
import { extractJson, LlmError, type Llm } from "./groq.ts"
import { parseRequest } from "./validate.ts"

/** The bodies are tiny ({ action, householdId, meal, hint }). */
export const MAX_BODY_BYTES = 4 * 1024

/** Calls to the model per request when its answer can't be used (bad JSON, every idea broke the diet). */
export const MAX_ATTEMPTS = 2

const WEEK_MS = 7 * 86_400_000

/** The caller's user_preferences row, as stored, or null when they haven't set any. */
export type PreferencesRow = { diet: unknown; allergies: unknown }

/** Recipe refs to find titles for: our own recipes (uuids) and Spoonacular ids. */
export type TitleRefs = { local: string[]; spoonacular: number[] }

/**
 * The signed-in person making the request. Every method runs as them (their access token, so
 * RLS applies) and throws on a database error.
 */
export type Caller = {
  isMember(householdId: string): Promise<boolean>
  pantryItems(householdId: string): Promise<PantryNameRow[]>
  preferences(): Promise<PreferencesRow | null>
  ratings(householdId: string): Promise<TasteRating[]>
  /** Titles by ref ("123" or a uuid) for the refs it can find. */
  recipeTitles(householdId: string, refs: TitleRefs): Promise<Map<string, string>>
  /** The cached response under this key, unexpired, or null. */
  cachedIdeas(householdId: string, key: string): Promise<unknown>
  saveIdeas(householdId: string, key: string, response: CachedIdeas, ttlSeconds: number): Promise<void>
  /** take_ai_allowance: null when it returned no row. */
  takeAllowance(householdId: string): Promise<AllowanceRow | null>
  /** Pro status and this week's uses, without taking one. */
  readAllowance(householdId: string): Promise<{ pro: boolean; used: number; oldestUse: string | null }>
  /** take_rate_limit('ai'): false once they're over this hour's limit. */
  takeAiRateLimit(): Promise<boolean>
}

export type HandlerDeps = {
  /** Null when GROQ_API_KEY isn't set. */
  llm: Llm | null
  /** Checks the access token with Supabase Auth: null when it isn't a valid session. Throws when it can't tell. */
  authenticate(token: string): Promise<Caller | null>
  now?: () => Date
  /** Server log. Never given keys, tokens, pantry names, the hint or the model's reply. */
  log?: (message: string) => void
}

const STATUS: Record<AiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  limit_reached: 429,
  rate_limited: 429,
  // Not an error for the app: the sheet asks for a few pantry items first.
  empty_pantry: 200,
  not_configured: 503,
  upstream: 502,
}

const MESSAGES = {
  unauthorized: "Sign in again to get AI ideas.",
  not_member: "You're not in that household.",
  not_configured: "AI ideas aren't set up yet.",
  empty_pantry: "Add a few things to your pantry first.",
  empty_for_diet: "Nothing in your pantry fits your diet yet. Add a few things first.",
  rate_limited: "That's a lot of AI help for one hour. Try again in a bit.",
  upstream: "Couldn't get AI ideas right now. Try again in a bit.",
  busy: "The AI helper is busy right now. Try again in a minute.",
  slow: "The AI helper took too long to answer. Try again.",
  no_fit: "No AI ideas fit right now. Try again later.",
} as const

function failure(code: AiErrorCode, error: string, allowance?: AiAllowance, status = STATUS[code]): Response {
  const body: AiFailure = allowance ? { error, code, allowance } : { error, code }
  return json(body, status)
}

/** Lowercase hex SHA-256 (Web Crypto, in Deno and Node alike). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** The same key the web's mealIdeasCacheKey makes (byte for byte without a hint), so both share answers. */
export async function ideasCacheKey(
  meal: IdeaMeal,
  names: readonly string[],
  diet: DietInput | null,
  taste: TasteHints,
  hint: string,
): Promise<string> {
  return mealIdeasCacheKey(meal, await sha256Hex(ideasCacheKeySource(meal, names, diet, taste, hint)))
}

/** take_ai_allowance's row as the app shows it. */
export function allowanceFromRow(row: AllowanceRow): AiAllowance {
  return {
    pro: row.pro,
    used: row.pro ? 0 : Number(row.used),
    limit: Number(row.lim),
    resetsAt: row.pro ? null : (row.resets_at ?? null),
  }
}

/** The allowance from a read (no use taken): the oldest use in the last 7 days drops out a week after it. */
export function allowanceFromRead(read: { pro: boolean; used: number; oldestUse: string | null }): AiAllowance {
  if (read.pro) return { pro: true, used: 0, limit: AI_FREE_WEEKLY, resetsAt: null }
  const oldest = read.oldestUse ? Date.parse(read.oldestUse) : NaN
  return {
    pro: false,
    used: read.used,
    limit: AI_FREE_WEEKLY,
    resetsAt: Number.isFinite(oldest) && read.used > 0 ? new Date(oldest + WEEK_MS).toISOString() : null,
  }
}

const withMissing = (recipe: AiRecipe): AiIdea => ({
  recipe,
  missing: missingIngredients(recipe).map((ingredient) => ingredient.name),
})

/** Today as YYYY-MM-DD in UTC (only orders the pantry by expiry). */
const utcDateKey = (date: Date) => date.toISOString().slice(0, 10)

const isSpoonRef = (ref: string) => /^\d+$/.test(ref)

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? ((message: string) => console.warn(message))

  function describe(error: unknown): string {
    if (error instanceof LlmError) return `groq ${error.code}${error.status ? ` (${error.status})` : ""}`
    return error instanceof Error ? error.name : "unknown error"
  }

  /** The diet to cook for, or null with no restrictions. Unknown stored values are dropped, as on the web. */
  async function loadDiet(caller: Caller): Promise<DietInput | null> {
    const row = await caller.preferences()
    if (!row) return null
    const prefs = preferencesSchema.parse({ diet: row.diet, allergies: row.allergies, cuisines: [], worldRecipes: false })
    return hasRestrictions(prefs) ? { diet: prefs.diet, allergies: prefs.allergies } : null
  }

  /** The liked and disliked titles for the prompt. Optional context: any hiccup means no hints. */
  async function loadTaste(caller: Caller, householdId: string): Promise<TasteHints> {
    try {
      const ratings = await caller.ratings(householdId)
      if (ratings.length === 0) return NO_HINTS
      const refs = hintRefs(ratings)
      const wanted = [...new Set([...refs.liked, ...refs.disliked])]
      if (wanted.length === 0) return NO_HINTS
      const titles = await caller.recipeTitles(householdId, {
        local: wanted.filter((ref) => !isSpoonRef(ref)),
        spoonacular: wanted.filter(isSpoonRef).map(Number),
      })
      return tasteHints(ratings, titles)
    } catch (error) {
      log(`[ai] loading taste failed: ${describe(error)}`)
      return NO_HINTS
    }
  }

  /** A fresh cached answer, re-checked against this caller's diet and pantry. A failed read is a miss. */
  async function cached(caller: Caller, householdId: string, key: string, diet: DietInput | null, names: string[]) {
    try {
      const response = await caller.cachedIdeas(householdId, key)
      return response === null || response === undefined ? null : readCachedIdeas(response, diet, names)
    } catch (error) {
      log(`[ai] reading the cache failed: ${describe(error)}`)
      return null
    }
  }

  /** Asks the model, retrying once when nothing in its answer can be used. LlmError is thrown as is. */
  async function generate(llm: Llm, meal: IdeaMeal, names: string[], diet: DietInput | null, taste: TasteHints, hint: string) {
    const messages = buildMealIdeasMessages(names, meal, diet, taste, hint)
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const reply = await llm.chat(messages, { maxTokens: 4000, temperature: 0.8, json: true })
      let raw: unknown
      try {
        raw = extractJson(reply)
      } catch {
        log(`[ai] reply had no JSON (attempt ${attempt})`)
        continue
      }
      const parsed = mealIdeasReplySchema.safeParse(raw)
      if (!parsed.success) {
        log(`[ai] reply didn't match the schema (attempt ${attempt})`)
        continue
      }
      const ideas = keepIdeas(parsed.data.ideas, diet, names)
      if (ideas.length > 0) return ideas
      log(`[ai] no usable ideas in the reply (attempt ${attempt})`)
    }
    return []
  }

  async function ideas(llm: Llm, caller: Caller, householdId: string, meal: IdeaMeal, hint: string): Promise<Response> {
    // The pantry and diet are read here as the caller, never taken from the app.
    // Taste is read alongside (it doesn't depend on them); an empty pantry wastes that read.
    const [items, diet, taste] = await Promise.all([caller.pantryItems(householdId), loadDiet(caller), loadTaste(caller, householdId)])
    const names = cleanNames(namesForDiet(pantrySearchNames(items, utcDateKey(now())), diet))
    if (names.length === 0) return failure("empty_pantry", diet ? MESSAGES.empty_for_diet : MESSAGES.empty_pantry)

    const key = await ideasCacheKey(meal, names, diet, taste, hint)
    const hit = await cached(caller, householdId, key, diet, names)
    if (hit) {
      // A cache hit costs nothing: the allowance is only read.
      const allowance = allowanceFromRead(await caller.readAllowance(householdId))
      const body: IdeasResponse = { ideas: hit.map(withMissing), cached: true, allowance }
      return json(body)
    }

    // The hourly limit first, so a refusal never costs one of the household's free uses
    // (CLAUDE.md: take the allowance after cache hits and refusals). Then one use per request,
    // however many attempts the model needs. Fails closed: a failed check throws, and the
    // catch-all answers upstream without calling the model.
    if (!(await caller.takeAiRateLimit())) {
      return failure("rate_limited", MESSAGES.rate_limited, allowanceFromRead(await caller.readAllowance(householdId)))
    }
    const row = await caller.takeAllowance(householdId)
    if (!row) throw new Error("take_ai_allowance returned no row")
    const allowance = allowanceFromRow(row)
    if (!row.allowed) return failure("limit_reached", limitMessage(row.resets_at, now()), allowance)

    let fresh: AiRecipe[]
    try {
      fresh = await generate(llm, meal, names, diet, taste, hint)
    } catch (error) {
      if (!(error instanceof LlmError)) throw error
      log(`[ai] ideas failed: ${describe(error)}`)
      const message = error.code === "rate_limit" ? MESSAGES.busy : error.code === "timeout" ? MESSAGES.slow : MESSAGES.upstream
      return failure("upstream", message, allowance)
    }
    if (fresh.length === 0) return failure("upstream", MESSAGES.no_fit, allowance)

    try {
      await caller.saveIdeas(householdId, key, { ideas: fresh }, MEAL_IDEAS_TTL_SECONDS)
    } catch (error) {
      // Only costs a fresh request next time.
      log(`[ai] saving to the cache failed: ${describe(error)}`)
    }
    const body: IdeasResponse = { ideas: fresh.map(withMissing), cached: false, allowance }
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

      const parsed = parseRequest(await readJson(req, MAX_BODY_BYTES))
      if (!parsed.ok) return failure("bad_request", parsed.error)
      if (!deps.llm) return failure("not_configured", MESSAGES.not_configured)

      const request = parsed.request
      if (!(await caller.isMember(request.householdId))) return failure("unauthorized", MESSAGES.not_member, undefined, 403)
      if (request.action === "allowance") {
        const body: AllowanceResponse = { allowance: allowanceFromRead(await caller.readAllowance(request.householdId)) }
        return json(body)
      }
      return await ideas(deps.llm, caller, request.householdId, request.meal, request.hint)
    } catch (error) {
      // Auth, membership, pantry, diet, allowance or rate limit failures: fail closed (no model call).
      log(`[ai] request failed: ${describe(error)}`)
      return failure("upstream", MESSAGES.upstream)
    }
  }
}
