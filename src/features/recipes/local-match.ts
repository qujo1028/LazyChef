// Matching the pantry against our own recipe library (TheMealDB imports and household
// recipes), and combining that with Spoonacular's results. Pure, so it's easy to test.
//
// The database does the first pass (match_local_recipes counts covered and missing lines
// for every recipe, by library id or normalized name). It gets the pantry's ids and name
// keys from pantryMatchKeys, widened so "brown rice" also covers "rice" the way
// findInPantry does. The best few hundred then get the exact same check as Spoonacular's
// results (toSuggestion), so both sources count "have" and "need" the same way.
import { findIngredient, normalizeIngredientName } from "@/lib/ingredients/catalog"
import type { RecipeIngredient, RecipeSummary } from "@/lib/spoonacular/recipe-shapes"

import {
  BASICS,
  isAvailable,
  MAX_MISSING,
  spoonacularMatchable,
  toSuggestion,
  type PantryIndex,
  type PantryRow,
  type Suggestion,
  type Suggestions,
} from "./match"
import type { RecipeSource } from "./ref"

/** Below this many local ideas, Spoonacular is asked for more (unless points are out). */
export const LOCAL_ENOUGH = 10

/** Most candidates the database hands back for the exact check. */
export const LOCAL_CANDIDATES = 150

/** Most words of a pantry name to widen (2^(n-1) keys each). */
const MAX_WIDEN_WORDS = 5

/** Every ordered subset of a key's words that keeps the last word: "brown basmati rice" → "rice", "brown rice", … */
export function widenKey(key: string): string[] {
  const words = key.split(" ").filter(Boolean)
  if (words.length === 0) return []
  if (words.length > MAX_WIDEN_WORDS) return [key]
  const head = words.slice(0, -1)
  const last = words[words.length - 1]
  const keys: string[] = []
  for (let mask = 0; mask < 1 << head.length; mask++) {
    const picked = head.filter((_, i) => mask & (1 << i))
    keys.push([...picked, last].join(" "))
  }
  return keys
}

export type MatchKeys = { ids: number[]; keys: string[] }

/** The pantry's library ids and name keys, for the database's first pass. Ran-out items don't count. */
export function pantryMatchKeys(items: readonly PantryRow[]): MatchKeys {
  const ids = new Set<number>()
  const keys = new Set<string>()
  const addName = (name: string) => {
    for (const key of widenKey(normalizeIngredientName(name))) keys.add(key)
  }
  for (const item of items) {
    if (!isAvailable(item)) continue
    if (item.ingredient_id !== null) ids.add(item.ingredient_id)
    addName(item.name)
    const entry = findIngredient(item.name)
    if (entry) {
      if (entry.id !== null) ids.add(entry.id)
      addName(entry.name)
    }
  }
  return { ids: [...ids].sort((a, b) => a - b), keys: [...keys].sort() }
}

let basicsCache: MatchKeys | null = null

/** Water, salt and pepper: never counted, as ids and name keys. */
export function basicKeys(): MatchKeys {
  if (basicsCache) return basicsCache
  const ids = new Set<number>()
  for (const name of BASICS) {
    const entry = findIngredient(name)
    // Only when the library entry is itself a basic ("pepper" might mean bell pepper elsewhere).
    if (entry?.id != null && BASICS.has(normalizeIngredientName(entry.name))) ids.add(entry.id)
  }
  basicsCache = { ids: [...ids].sort((a, b) => a - b), keys: [...BASICS].sort() }
  return basicsCache
}

// ── Local recipes ───────────────────────────────────────────────────────────

export type LocalIngredient = {
  original: string
  name: string
  quantity: number | null
  unit: string | null
  ingredient_id: number | null
  optional: boolean
}

export type LocalRecipeCard = {
  id: string
  source: Exclude<RecipeSource, "spoonacular">
  title: string
  image: string | null
  readyInMinutes: number | null
  ingredients: readonly LocalIngredient[]
}

/** Our ingredient rows in the shape the rest of the recipe code (checklist, cook, list) uses. */
export function toRecipeIngredients(lines: readonly LocalIngredient[]): RecipeIngredient[] {
  return lines.map((line) => ({
    id: line.ingredient_id,
    name: line.name,
    original: line.original,
    amount: line.quantity,
    unit: line.unit && line.unit !== "count" ? line.unit : "",
    aisle: null,
  }))
}

/** A local recipe matched against the pantry. Optional lines ("to serve") never count. */
export function localSuggestion(index: PantryIndex, recipe: LocalRecipeCard): Suggestion {
  const required = recipe.ingredients.filter((line) => !line.optional)
  return toSuggestion(index, {
    id: recipe.id,
    source: recipe.source,
    title: recipe.title,
    image: recipe.image,
    readyInMinutes: recipe.readyInMinutes,
    used: [],
    missed: toRecipeIngredients(required),
  })
}

/** Fewest missing first, then the ones using more of the pantry, then expiring food, then A to Z. */
export function compareSuggestions(a: Suggestion, b: Suggestion): number {
  return (
    a.need.length - b.need.length ||
    b.have.length - a.have.length ||
    b.usesExpiring.length - a.usesExpiring.length ||
    a.title.localeCompare(b.title)
  )
}

/**
 * Local recipes into "Make now" (nothing missing) and "Almost there" (1 to MAX_MISSING).
 * Recipes that use nothing from the pantry are dropped.
 */
export function rankLocal(index: PantryIndex, recipes: readonly LocalRecipeCard[]): Suggestions {
  const all = recipes
    .map((recipe) => localSuggestion(index, recipe))
    .filter((s) => s.have.length > 0 && s.need.length <= MAX_MISSING)
    .sort(compareSuggestions)
  return { makeNow: all.filter((s) => s.need.length === 0), almostThere: all.filter((s) => s.need.length > 0) }
}

/** Search results: every match, however much is missing, best first. */
export function rankSearch(index: PantryIndex, recipes: readonly LocalRecipeCard[]): Suggestion[] {
  return recipes.map((recipe) => localSuggestion(index, recipe)).sort(compareSuggestions)
}

// ── Combining with Spoonacular ──────────────────────────────────────────────

/** "Spicy Arrabiata Penne!" and "spicy arrabiata penne" are the same dish. */
export function titleKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:recipe|the|a|an|easy|best|homemade)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Whether Spoonacular should be asked: too few local ideas, or "Show more ideas". */
export function wantsSpoonacular(localCount: number, more: boolean): boolean {
  return more || localCount < LOCAL_ENOUGH
}

/** Local results first, then Spoonacular's, without a dish twice (by title) or a recipe twice (by id). */
export function mergeLists(local: readonly Suggestion[], extra: readonly Suggestion[], seen = new Set<string>()): Suggestion[] {
  const merged: Suggestion[] = []
  for (const suggestion of [...local, ...extra]) {
    const keys = [`id:${suggestion.id}`, `title:${titleKey(suggestion.title)}`]
    if (keys.some((key) => seen.has(key))) continue
    for (const key of keys) seen.add(key)
    merged.push(suggestion)
  }
  return merged
}

/**
 * "Make now" and "Almost there" from both sources. A dish found in both keeps the local
 * copy (free to open, and ours). Local results stay ahead of Spoonacular's in each group.
 */
export function mergeSuggestions(local: Suggestions, extra: Suggestions | null): Suggestions {
  if (!extra) return local
  const seen = new Set<string>()
  // Local titles in either group win over Spoonacular's in both.
  for (const s of [...local.makeNow, ...local.almostThere]) {
    seen.add(`id:${s.id}`)
    seen.add(`title:${titleKey(s.title)}`)
  }
  return {
    makeNow: [...local.makeNow, ...mergeLists([], extra.makeNow, seen)],
    almostThere: [...local.almostThere, ...mergeLists([], extra.almostThere, seen)],
  }
}

/** Spoonacular's search results, matched the same way and sorted like local ones (no cut-off). */
export function rankSpoonacularSearch(index: PantryIndex, recipes: readonly RecipeSummary[]): Suggestion[] {
  return mergeLists(
    [],
    recipes.map((recipe) => toSuggestion(index, spoonacularMatchable(recipe))),
  ).sort(compareSuggestions)
}
