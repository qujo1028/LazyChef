// Pure merging/priority logic behind resolveItems (see resolve.ts). No I/O here:
// the database rows, catalog functions and Spoonacular lookup are passed in.
import type { CatalogEntry, Category, ParsedLine, ResolvedItem } from "@/lib/ingredients/types"

/** Most lines one request resolves (the rest are dropped). */
export const MAX_LINES = 100
/** Most distinct names sent to Spoonacular per request (1 point each). */
export const MAX_SPOONACULAR_LOOKUPS = 20

export const NO_KEY_MESSAGE = "Add a Spoonacular key to categorize unusual items automatically."
const BEST_GUESS_NOTE = "Unusual items got a best-guess category."

export type SpoonacularStatus = {
  /** Whether Spoonacular was called for this batch (only for names we couldn't place). */
  called: boolean
  /** From the X-API-Quota-Left header, when called. */
  pointsLeft: number | null
  /** Human-readable problem (no key configured, quota used up, …), or null. */
  error: string | null
}

export type ResolveResult = { items: ResolvedItem[]; spoonacular: SpoonacularStatus }

export type ResolveDeps = {
  normalize: (name: string) => string
  findIngredient: (name: string) => CatalogEntry | null
  guessCategory: (name: string) => Category
  categoryFromAisle: (aisle: string | null | undefined) => Category
}

export type OverrideRow = { ingredient_key: string; category: Category }
export type PantryRow = { name: string; category: Category; ingredient_id: number | null }

export type HouseholdKnowledge = {
  /** category_overrides, by ingredient key. */
  overrides: Map<string, Category>
  /** Existing pantry items, by normalized name. */
  pantry: Map<string, { category: Category; ingredientId: number | null }>
}

/** What Spoonacular said about one name. */
export type SpoonacularHit = { id: number | null; aisle: string | null }

export type SpoonacularLookup =
  /** `hits` lines up with the names passed in; null where Spoonacular had nothing. */
  | { ok: true; hits: (SpoonacularHit | null)[]; pointsLeft: number | null }
  | { ok: false; error: string }

export type ResolveOptions = {
  deps: ResolveDeps
  knowledge: HouseholdKnowledge
  /** null when no Spoonacular key is configured. */
  lookup: ((names: string[]) => Promise<SpoonacularLookup>) | null
  maxLookups?: number
}

/** Adds the "best guess" note to a Spoonacular failure message. */
export function spoonacularFailureMessage(message: string): string {
  return `${message} ${BEST_GUESS_NOTE}`
}

/**
 * Indexes the household's fixes and existing items by key. `pantryItems` should
 * be newest first: the newest item's category wins, and a missing ingredient id
 * is filled from an older item with the same name.
 */
export function buildHouseholdKnowledge(
  overrides: OverrideRow[],
  pantryItems: PantryRow[],
  normalize: (name: string) => string,
): HouseholdKnowledge {
  const overrideMap = new Map<string, Category>()
  for (const row of overrides) overrideMap.set(row.ingredient_key, row.category)

  const pantry = new Map<string, { category: Category; ingredientId: number | null }>()
  for (const item of pantryItems) {
    const key = normalize(item.name)
    if (!key) continue
    const known = pantry.get(key)
    if (!known) pantry.set(key, { category: item.category, ingredientId: item.ingredient_id })
    else if (known.ingredientId === null && item.ingredient_id !== null) known.ingredientId = item.ingredient_id
  }
  return { overrides: overrideMap, pantry }
}

/** Steps 3–4: household knowledge, then the library. null when neither knows the name. */
export function resolveLocally(
  line: ParsedLine,
  key: string,
  knowledge: HouseholdKnowledge,
  deps: ResolveDeps,
): ResolvedItem | null {
  const override = key ? knowledge.overrides.get(key) : undefined
  const existing = key ? knowledge.pantry.get(key) : undefined
  const entry = deps.findIngredient(line.name)

  if (override) {
    return {
      ...line,
      category: override,
      categorySource: "household",
      ingredientId: entry?.id ?? existing?.ingredientId ?? null,
    }
  }
  if (existing) {
    return {
      ...line,
      category: existing.category,
      categorySource: "household",
      ingredientId: existing.ingredientId ?? entry?.id ?? null,
    }
  }
  if (entry) return { ...line, category: entry.category, categorySource: "catalog", ingredientId: entry.id }
  return null
}

/**
 * Steps 5–6 for a name nobody knew: Spoonacular's aisle when it maps to a real
 * category, else the keyword guess. Spoonacular's ingredient id is kept either way.
 */
export function resolveUnknown(line: ParsedLine, hit: SpoonacularHit | null | undefined, deps: ResolveDeps): ResolvedItem {
  const ingredientId = hit?.id ?? null
  const fromAisle = hit?.aisle ? deps.categoryFromAisle(hit.aisle) : null
  if (fromAisle && fromAisle !== "other") {
    return { ...line, category: fromAisle, categorySource: "spoonacular", ingredientId }
  }
  const guess = deps.guessCategory(line.name)
  if (guess === "other" && fromAisle) {
    // Spoonacular knows it and files it under "other"; trust that over a failed guess.
    return { ...line, category: "other", categorySource: "spoonacular", ingredientId }
  }
  return { ...line, category: guess, categorySource: "fallback", ingredientId }
}

function lookupKey(line: ParsedLine, key: string): string {
  return key || line.name.trim().toLowerCase()
}

/** Distinct names to look up (one line per key, in order), capped. */
export function planLookups(
  unknown: { line: ParsedLine; key: string }[],
  max: number,
): { keys: string[]; names: string[] } {
  const keys: string[] = []
  const names: string[] = []
  const seen = new Set<string>()
  for (const { line, key } of unknown) {
    const lookup = lookupKey(line, key)
    if (!lookup || seen.has(lookup)) continue
    seen.add(lookup)
    if (keys.length >= max) continue
    keys.push(lookup)
    names.push(line.name.trim())
  }
  return { keys, names }
}

/** The whole priority chain for already-parsed lines. */
export async function resolveParsedLines(lines: ParsedLine[], options: ResolveOptions): Promise<ResolveResult> {
  const { deps, knowledge, lookup, maxLookups = MAX_SPOONACULAR_LOOKUPS } = options
  const keys = lines.map((line) => deps.normalize(line.name))
  const local = lines.map((line, index) => resolveLocally(line, keys[index], knowledge, deps))
  const unknown = lines.flatMap((line, index) => (local[index] ? [] : [{ line, key: keys[index] }]))

  const spoonacular: SpoonacularStatus = { called: false, pointsLeft: null, error: null }
  const hits = new Map<string, SpoonacularHit | null>()

  if (unknown.length > 0) {
    if (!lookup) {
      spoonacular.error = NO_KEY_MESSAGE
    } else {
      const plan = planLookups(unknown, maxLookups)
      if (plan.names.length > 0) {
        spoonacular.called = true
        const result: SpoonacularLookup = await Promise.resolve(plan.names).then(lookup).catch(() => ({
          ok: false as const,
          error: spoonacularFailureMessage("Spoonacular had a problem."),
        }))
        if (result.ok) {
          spoonacular.pointsLeft = result.pointsLeft
          const found = result.hits
          plan.keys.forEach((key, i) => hits.set(key, found[i] ?? null))
        } else {
          spoonacular.error = result.error
        }
      }
    }
  }

  const items = lines.map(
    (line, index) => local[index] ?? resolveUnknown(line, hits.get(lookupKey(line, keys[index])), deps),
  )
  return { items, spoonacular }
}
