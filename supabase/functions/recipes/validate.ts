// Checks and cleans a request body against the Edge contract. Everything from the app is
// untrusted: anything that doesn't fit is a 400, never passed on to Spoonacular or the database.
import { MAX_INFO_IDS, type EdgeRequest, type SuggestFilters } from "../_shared/core/edge-contract.ts"
import { normalizeIngredientName } from "../_shared/core/normalize.ts"
import { MEAL_TYPES } from "./spoonacular.ts"

/** packages/core/src/recipes/match.ts MAX_QUERY_NAMES (a test keeps them equal). */
export const MAX_QUERY_NAMES = 60
/** Longest pantry name we pass on. */
export const MAX_NAME_LENGTH = 100
/** packages/core/src/recipes/filters.ts MAX_QUERY_LENGTH: longer searches are cut to this. */
export const MAX_QUERY_LENGTH = 80
/** A search longer than this is refused rather than cut. */
const MAX_RAW_QUERY_LENGTH = 500
/** The longest cook time filter we take, in minutes. */
export const MAX_TIME_MINUTES = 24 * 60
/** packages/core/src/recipes/filters.ts LUNCH_MAIN_MINUTES. */
export const LUNCH_MAIN_MINUTES = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEALS: ReadonlySet<string> = new Set(MEAL_TYPES)

export type Parsed = { ok: true; request: EdgeRequest } | { ok: false; error: string }

const fail = (error: string): Parsed => ({ ok: false, error })

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** Control characters out, whitespace single-spaced and trimmed. */
function clean(value: string): string {
  // deno-lint-ignore no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * The names' normalized keys ("Fresh Tomatoes" becomes "tomato"), unique, in order. Spoonacular is
 * asked with exactly these, the same strings the cache key hashes, so whatever a request stores
 * under a key is what any other request with that key would have fetched: one household can't
 * plant results for another. Names with no key (no ASCII letters or digits) are dropped.
 */
function parseNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_QUERY_NAMES) return null
  const names: string[] = []
  for (const item of value) {
    if (typeof item !== "string" || item.length > MAX_NAME_LENGTH) return null
    const key = normalizeIngredientName(clean(item))
    if (key && !names.includes(key)) names.push(key)
  }
  return names
}

function parseFilters(value: unknown): SuggestFilters | null {
  if (value === undefined || value === null) return { type: null, maxTime: null, query: null }
  if (!isRecord(value)) return null

  const { type, maxTime, query } = value
  if (type !== undefined && type !== null && (typeof type !== "string" || (type !== "lunch" && !MEALS.has(type)))) return null
  if (
    maxTime !== undefined &&
    maxTime !== null &&
    (typeof maxTime !== "number" || !Number.isInteger(maxTime) || maxTime < 1 || maxTime > MAX_TIME_MINUTES)
  ) {
    return null
  }
  if (query !== undefined && query !== null && (typeof query !== "string" || query.length > MAX_RAW_QUERY_LENGTH)) return null

  // Lowercase, as the cache key has it, so the words sent are exactly the ones keyed.
  const words = typeof query === "string" ? clean(query).slice(0, MAX_QUERY_LENGTH).trim().toLowerCase() || null : null
  const time = typeof maxTime === "number" ? maxTime : null
  // "Lunch" isn't a Spoonacular type: like the web, ask for a quick main course.
  if (type === "lunch") {
    return { type: "main course", maxTime: time === null ? LUNCH_MAIN_MINUTES : Math.min(time, LUNCH_MAIN_MINUTES), query: words }
  }
  return { type: typeof type === "string" ? type : null, maxTime: time, query: words }
}

function parseIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > MAX_INFO_IDS) return null
  const ids: number[] = []
  for (const item of value) {
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item <= 0) return null
    if (!ids.includes(item)) ids.push(item)
  }
  return ids
}

function parseHousehold(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null
}

/** The request, cleaned, or why it was refused (a short message, safe to show). */
export function parseRequest(body: unknown): Parsed {
  if (!isRecord(body)) return fail("Send a JSON object.")
  switch (body.action) {
    case "quota":
      return { ok: true, request: { action: "quota" } }
    case "suggest": {
      const householdId = parseHousehold(body.householdId)
      if (!householdId) return fail("Pick a household.")
      const names = parseNames(body.names)
      if (!names) return fail(`Send up to ${MAX_QUERY_NAMES} ingredient names.`)
      const filters = parseFilters(body.filters)
      if (!filters) return fail("Those filters don't look right.")
      return { ok: true, request: { action: "suggest", householdId, names, filters } }
    }
    case "info": {
      const householdId = parseHousehold(body.householdId)
      if (!householdId) return fail("Pick a household.")
      const ids = parseIds(body.ids)
      if (!ids) return fail(`Send up to ${MAX_INFO_IDS} recipe ids.`)
      return { ok: true, request: { action: "info", householdId, ids } }
    }
    default:
      return fail("Unknown action.")
  }
}
