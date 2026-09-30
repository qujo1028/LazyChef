// Works out which recipe ingredients the household has. Pure, so it's easy to test.
//
// Spoonacular's used/missed lists come from the names we sent, which misses things like
// our ingredient ids and the household's staples, so each "missed" ingredient gets a
// second look against the pantry before it counts as missing.
import { findIngredient, getIngredientById, normalizeIngredientName } from "@/lib/ingredients/catalog"
import type { RecipeIngredient, RecipeSummary } from "@/lib/spoonacular/recipe-shapes"

import { daysBetween, EXPIRING_SOON_DAYS } from "../pantry/dates"
import type { PantryItem } from "../pantry/types"
import type { RecipeSource } from "./ref"

export type PantryRow = Pick<PantryItem, "name" | "quantity" | "ingredient_id" | "is_staple" | "expires_on">

/** Recipes missing at most this many ingredients show up under "Almost there". */
export const MAX_MISSING = 3

/** Most names sent to Spoonacular in one search (keeps the URL and the match sane). */
export const MAX_QUERY_NAMES = 60

/**
 * Taken as always there, like Spoonacular's own ignorePantry: water, salt and pepper never
 * count as missing. Normalized names (see normalizeIngredientName). Not "bell pepper".
 */
export const BASICS: ReadonlySet<string> = new Set([
  "water",
  "ice",
  "ice water",
  "hot water",
  "cold water",
  "warm water",
  "boiling water",
  "salt",
  "table salt",
  "kosher salt",
  "sea salt",
  "pepper",
  "black pepper",
  "ground pepper",
  "ground black pepper",
  "cracked black pepper",
  "white pepper",
  "salt and pepper",
])

/** Staples and anything with some left (or not tracked). "Ran out" rows don't count. */
export function isAvailable(item: Pick<PantryRow, "quantity" | "is_staple">): boolean {
  return item.is_staple || item.quantity === null || item.quantity > 0
}

function expiresSoon(item: PantryRow, today: string): boolean {
  return item.expires_on !== null && daysBetween(today, item.expires_on) <= EXPIRING_SOON_DAYS
}

/**
 * The names to search with: what's available, soonest-expiring first (so it's never cut
 * off), one per ingredient, at most MAX_QUERY_NAMES.
 */
export function pantrySearchNames(items: readonly PantryRow[], today: string): string[] {
  const available = items.filter(isAvailable)
  const order = (item: PantryRow) => (item.expires_on === null ? Infinity : daysBetween(today, item.expires_on))
  const sorted = [...available].sort(
    (a, b) => order(a) - order(b) || Number(a.is_staple) - Number(b.is_staple) || a.name.localeCompare(b.name),
  )
  const seen = new Set<string>()
  const names: string[] = []
  for (const item of sorted) {
    const key = normalizeIngredientName(item.name)
    // Commas separate names in the request.
    const name = item.name.replace(/,/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
    if (!key || !name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length >= MAX_QUERY_NAMES) break
  }
  return names
}

export type PantryIndex<T extends PantryRow = PantryRow> = {
  byId: ReadonlyMap<number, T>
  byKey: ReadonlyMap<string, T>
  /** Pantry items that expire within EXPIRING_SOON_DAYS (or already have). */
  expiring: ReadonlySet<T>
}

function addKey<T>(map: Map<string, T>, key: string, item: T) {
  if (key && !map.has(key)) map.set(key, item)
}

export function buildPantryIndex<T extends PantryRow>(items: readonly T[], today: string): PantryIndex<T> {
  const byId = new Map<number, T>()
  const byKey = new Map<string, T>()
  const expiring = new Set<T>()
  for (const item of items) {
    if (!isAvailable(item)) continue
    if (expiresSoon(item, today)) expiring.add(item)
    if (item.ingredient_id !== null && !byId.has(item.ingredient_id)) byId.set(item.ingredient_id, item)
    addKey(byKey, normalizeIngredientName(item.name), item)
    const entry = findIngredient(item.name)
    if (entry) {
      if (entry.id !== null && !byId.has(entry.id)) byId.set(entry.id, item)
      addKey(byKey, normalizeIngredientName(entry.name), item)
    }
  }
  return { byId, byKey, expiring }
}

function lastWord(key: string) {
  return key.slice(key.lastIndexOf(" ") + 1)
}

/**
 * The pantry item that covers a recipe ingredient, or null. Matches, in order: the same
 * Spoonacular id, the same normalized name, the same library entry, then a more specific
 * pantry item of the same kind ("rice" is covered by "brown rice", but "chicken broth" is
 * not covered by "chicken", and "garlic powder" is not covered by "garlic").
 */
export function findInPantry<T extends PantryRow>(
  index: PantryIndex<T>,
  ingredient: Pick<RecipeIngredient, "id" | "name">,
): T | null {
  if (ingredient.id !== null) {
    const hit = index.byId.get(ingredient.id)
    if (hit) return hit
  }
  const key = normalizeIngredientName(ingredient.name)
  if (!key) return null
  const direct = index.byKey.get(key)
  if (direct) return direct

  const entry = (ingredient.id !== null ? getIngredientById(ingredient.id) : null) ?? findIngredient(ingredient.name)
  if (entry) {
    const hit = (entry.id !== null ? index.byId.get(entry.id) : undefined) ?? index.byKey.get(normalizeIngredientName(entry.name))
    if (hit) return hit
  }

  const words = key.split(" ")
  const head = lastWord(key)
  for (const [pantryKey, item] of index.byKey) {
    if (lastWord(pantryKey) !== head) continue
    const pantryWords = new Set(pantryKey.split(" "))
    if (words.every((word) => pantryWords.has(word))) return item
  }
  return null
}

export function isBasic(ingredient: Pick<RecipeIngredient, "name">): boolean {
  if (BASICS.has(normalizeIngredientName(ingredient.name))) return true
  // "coarse salt", "freshly ground black pepper", "salt and pepper to taste": via the library.
  const entry = findIngredient(ingredient.name)
  return entry !== null && BASICS.has(normalizeIngredientName(entry.name))
}

export type IngredientStatus = "have" | "basic" | "need"

export type CheckedIngredient = RecipeIngredient & {
  status: IngredientStatus
  /** The pantry item that covers it, for "have". */
  pantryName: string | null
}

/** Each of a recipe's ingredient lines, with whether the household has it. */
export function checkIngredients(index: PantryIndex, ingredients: readonly RecipeIngredient[]): CheckedIngredient[] {
  return ingredients.map((ingredient) => {
    const item = findInPantry(index, ingredient)
    if (item) return { ...ingredient, status: "have", pantryName: item.name }
    return { ...ingredient, status: isBasic(ingredient) ? "basic" : "need", pantryName: null }
  })
}

export type Suggestion = {
  /** The recipe's ref: Spoonacular's numeric id or our uuid (see ref.ts). */
  id: string
  source: RecipeSource
  title: string
  image: string | null
  readyInMinutes: number | null
  /** Names of the recipe's ingredients the household has. */
  have: string[]
  /** And the ones it still needs. */
  need: string[]
  /** Pantry items expiring soon that this recipe would use up. */
  usesExpiring: string[]
}

export type Suggestions = { makeNow: Suggestion[]; almostThere: Suggestion[] }

function ingredientKey(ingredient: RecipeIngredient) {
  return ingredient.id !== null ? `id:${ingredient.id}` : `name:${normalizeIngredientName(ingredient.name)}`
}

/** A recipe to match: its ingredients, split into what a search already said is used and the rest. */
export type MatchableRecipe = {
  id: string
  source: RecipeSource
  title: string
  image: string | null
  readyInMinutes: number | null
  used: readonly RecipeIngredient[]
  missed: readonly RecipeIngredient[]
}

export function spoonacularMatchable(recipe: RecipeSummary): MatchableRecipe {
  return { ...recipe, id: String(recipe.id), source: "spoonacular" }
}

export function toSuggestion(index: PantryIndex, recipe: MatchableRecipe): Suggestion {
  const have = new Map<string, string>()
  const need = new Map<string, string>()
  const expiring = new Set<string>()

  const markHave = (ingredient: RecipeIngredient, item: PantryRow | null) => {
    have.set(ingredientKey(ingredient), ingredient.name)
    if (item && index.expiring.has(item)) expiring.add(item.name)
  }
  for (const ingredient of recipe.used) markHave(ingredient, findInPantry(index, ingredient))
  for (const ingredient of recipe.missed) {
    const key = ingredientKey(ingredient)
    if (have.has(key)) continue
    const item = findInPantry(index, ingredient)
    if (item) markHave(ingredient, item)
    else if (!isBasic(ingredient)) need.set(key, ingredient.name)
  }
  for (const key of have.keys()) need.delete(key)

  return {
    id: recipe.id,
    source: recipe.source,
    title: recipe.title,
    image: recipe.image,
    readyInMinutes: recipe.readyInMinutes,
    have: [...have.values()],
    need: [...need.values()],
    usesExpiring: [...expiring],
  }
}

/**
 * Splits search results into "Make now" (nothing missing) and "Almost there" (1 to
 * MAX_MISSING missing). Recipes using up expiring food come first, then the ones using
 * more of the pantry. Recipes that use nothing from the pantry are dropped.
 */
export function sortSuggestions(index: PantryIndex, recipes: readonly RecipeSummary[]): Suggestions {
  const seen = new Set<number>()
  const all: Suggestion[] = []
  for (const recipe of recipes) {
    if (seen.has(recipe.id)) continue
    seen.add(recipe.id)
    const suggestion = toSuggestion(index, spoonacularMatchable(recipe))
    if (suggestion.have.length > 0 && suggestion.need.length <= MAX_MISSING) all.push(suggestion)
  }
  const byUsefulness = (a: Suggestion, b: Suggestion) =>
    a.need.length - b.need.length ||
    b.usesExpiring.length - a.usesExpiring.length ||
    b.have.length - a.have.length ||
    a.title.localeCompare(b.title)
  all.sort(byUsefulness)
  return {
    makeNow: all.filter((s) => s.need.length === 0),
    almostThere: all.filter((s) => s.need.length > 0),
  }
}
