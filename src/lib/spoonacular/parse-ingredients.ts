import "server-only"

import { SpoonacularError, spoonacularFetch, type SpoonacularQuota } from "./client"

/** One line as Spoonacular understood it. */
export type SpoonacularIngredient = {
  /** Spoonacular ingredient id; null when it didn't recognize the ingredient. */
  id: number | null
  /** Spoonacular's name for it, lowercase: "chicken breast". */
  name: string
  /** Supermarket aisle, e.g. "Milk, Eggs, Other Dairy" or "Baking;Spices and Seasonings"; null if unknown. */
  aisle: string | null
  amount: number | null
  /** As Spoonacular wrote it ("lbs", "cups", "" for none); not one of our unit keys. */
  unit: string
  possibleUnits: string[]
}

export type ParseIngredientsResult = {
  /** One per input line, in order; null for blank lines or lines Spoonacular skipped. */
  ingredients: (SpoonacularIngredient | null)[]
  /** Quota headers from the request, or null when no request was needed (all blank or cached). */
  quota: SpoonacularQuota | null
  /** How many distinct lines were sent (each costs 1 point). */
  sent: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // the terms allow at most 1 hour
const CACHE_MAX_ENTRIES = 1000

/** Short-lived, in-memory, per server instance. Keyed by the line, lowercased. */
const cache = new Map<string, { value: SpoonacularIngredient | null; expires: number }>()

function readCache(key: string, now: number) {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (hit.expires <= now) {
    cache.delete(key)
    return undefined
  }
  return hit.value
}

function writeCache(key: string, value: SpoonacularIngredient | null, now: number) {
  cache.delete(key)
  cache.set(key, { value, expires: now + CACHE_TTL_MS })
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** One line of the request body: no line breaks inside, trimmed. */
function cleanLine(line: string): string {
  return line.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()
}

function lineKey(line: string): string {
  return line.toLowerCase()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** Validates one element of the parseIngredients response. */
export function toSpoonacularIngredient(value: unknown): SpoonacularIngredient | null {
  const raw = asRecord(value)
  if (!raw) return null
  const name = typeof raw.name === "string" ? raw.name.trim() : ""
  const id = typeof raw.id === "number" && Number.isInteger(raw.id) && raw.id > 0 ? raw.id : null
  const aisle = typeof raw.aisle === "string" && raw.aisle.trim() && raw.aisle.trim() !== "?" ? raw.aisle.trim() : null
  if (!name && id === null) return null
  return {
    id,
    name,
    aisle,
    amount: typeof raw.amount === "number" && Number.isFinite(raw.amount) ? raw.amount : null,
    unit: typeof raw.unit === "string" ? raw.unit : "",
    possibleUnits: Array.isArray(raw.possibleUnits)
      ? raw.possibleUnits.filter((unit): unit is string => typeof unit === "string")
      : [],
  }
}

/**
 * Pairs response elements with the lines we sent. Spoonacular echoes each line
 * as `original`; when it doesn't (or drops a line), fall back to position only
 * if the counts match.
 */
export function alignParsed(sent: string[], response: unknown[]): (SpoonacularIngredient | null)[] {
  const byOriginal = new Map<string, unknown>()
  for (const element of response) {
    const original = asRecord(element)?.original
    if (typeof original === "string") {
      const key = lineKey(cleanLine(original))
      if (!byOriginal.has(key)) byOriginal.set(key, element)
    }
  }
  const sameLength = response.length === sent.length
  return sent.map((line, index) => {
    const element = byOriginal.get(lineKey(line)) ?? (sameLength ? response[index] : undefined)
    return element === undefined ? null : toSpoonacularIngredient(element)
  })
}

/**
 * POST /recipes/parseIngredients. COSTS 1 POINT PER LINE SENT, so callers should
 * send only names they can't place otherwise. Duplicate lines are sent once, and
 * lines seen in the last hour are answered from memory without spending points.
 * Throws SpoonacularError (see client.ts).
 */
export async function parseIngredients(lines: string[]): Promise<ParseIngredientsResult> {
  const now = Date.now()
  const cleaned = lines.map(cleanLine)
  const results = new Map<string, SpoonacularIngredient | null>()
  const toSend: string[] = []
  const queued = new Set<string>()

  for (const line of cleaned) {
    const key = lineKey(line)
    if (!line || results.has(key) || queued.has(key)) continue
    const cached = readCache(key, now)
    if (cached !== undefined) {
      results.set(key, cached)
    } else {
      queued.add(key)
      toSend.push(line)
    }
  }

  let quota: SpoonacularQuota | null = null
  if (toSend.length > 0) {
    const response = await spoonacularFetch<unknown>("/recipes/parseIngredients", {
      method: "POST",
      form: { ingredientList: toSend.join("\n"), servings: 1, includeNutrition: false },
    })
    quota = response.quota
    if (!Array.isArray(response.data)) throw new SpoonacularError("bad_response", { quota })
    const parsed = alignParsed(toSend, response.data)
    toSend.forEach((line, index) => {
      results.set(lineKey(line), parsed[index])
      writeCache(lineKey(line), parsed[index], now)
    })
  }

  return {
    ingredients: cleaned.map((line) => (line ? (results.get(lineKey(line)) ?? null) : null)),
    quota,
    sent: toSend.length,
  }
}
