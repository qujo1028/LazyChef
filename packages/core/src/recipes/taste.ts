// Pure: what the household's thumbs say about taste. Turns ratings into a small score that
// breaks ties between suggestions with the same number of missing ingredients, and into the
// liked / disliked titles the AI idea prompts get. Never hides a recipe, never overrides the
// "fewest missing first" order.
import { normalizeIngredientName } from "../ingredients/catalog"

import { BASICS, type Suggestion } from "./match"
import { netScores, type TasteRating } from "./taste-hints"

export {
  cleanTitles,
  hasHints,
  HINT_LIMIT,
  hintLines,
  hintRefs,
  hintsKeySource,
  netScores,
  NO_HINTS,
  tasteHints,
  type TasteHints,
  type TasteRating,
} from "./taste-hints"

/** What a rated (or candidate) recipe looks like to the similarity check. */
export type TasteRecipe = { id: string; cuisine?: string | null; ingredients: readonly string[] }

/** Shared main ingredients that make two recipes "similar" (cuisine alone is enough too). */
export const SIMILAR_INGREDIENTS = 2

/** A direct vote: ±DIRECT per net vote (capped at ±2 votes). Always bigger than SIMILAR. */
const DIRECT = 3
const MAX_NET = 2
/** An unrated recipe like a liked one (or a disliked one). */
const SIMILAR = 1

/** Main ingredients: normalized, no water/salt/pepper, no duplicates. */
export function mainIngredients(names: readonly string[]): string[] {
  const keys = new Set<string>()
  for (const name of names) {
    const key = normalizeIngredientName(name)
    if (key && !BASICS.has(key)) keys.add(key)
  }
  return [...keys]
}

const cuisineKey = (cuisine: string | null | undefined) => cuisine?.trim().toLowerCase() || null

export type TasteProfile = {
  /** Net votes by recipe ref. */
  net: ReadonlyMap<string, number>
  liked: readonly { cuisine: string | null; ingredients: ReadonlySet<string> }[]
  disliked: readonly { cuisine: string | null; ingredients: ReadonlySet<string> }[]
}

export const EMPTY_TASTE: TasteProfile = { net: new Map(), liked: [], disliked: [] }

export const hasTaste = (profile: TasteProfile) => profile.net.size > 0

/**
 * The profile: the net votes, plus the cuisine and main ingredients of each rated recipe we
 * know the contents of (our own library; Spoonacular's rated recipes only count directly).
 */
export function buildTasteProfile(ratings: readonly TasteRating[], known: readonly TasteRecipe[]): TasteProfile {
  const net = netScores(ratings)
  const byRef = new Map(known.map((recipe) => [recipe.id, recipe]))
  const liked: TasteProfile["liked"][number][] = []
  const disliked: TasteProfile["disliked"][number][] = []
  for (const [ref, value] of net) {
    const recipe = byRef.get(ref)
    if (!recipe) continue
    const entry = { cuisine: cuisineKey(recipe.cuisine), ingredients: new Set(mainIngredients(recipe.ingredients)) }
    ;(value > 0 ? liked : disliked).push(entry)
  }
  return { net, liked, disliked }
}

function similarTo(recipe: { cuisine: string | null; ingredients: ReadonlySet<string> }, group: TasteProfile["liked"]): boolean {
  return group.some((other) => {
    if (recipe.cuisine && recipe.cuisine === other.cuisine) return true
    let shared = 0
    for (const key of recipe.ingredients) if (other.ingredients.has(key) && ++shared >= SIMILAR_INGREDIENTS) return true
    return false
  })
}

/**
 * Positive = the household will probably like it. A rated recipe scores its own votes
 * (±3 or ±6); an unrated one ±1 for being like a thumbs-up recipe and/or a thumbs-down one.
 */
export function tasteScore(profile: TasteProfile, recipe: TasteRecipe): number {
  const own = profile.net.get(recipe.id)
  if (own !== undefined) return Math.max(-MAX_NET, Math.min(MAX_NET, own)) * DIRECT
  if (profile.liked.length === 0 && profile.disliked.length === 0) return 0
  const candidate = { cuisine: cuisineKey(recipe.cuisine), ingredients: new Set(mainIngredients(recipe.ingredients)) }
  return (similarTo(candidate, profile.liked) ? SIMILAR : 0) - (similarTo(candidate, profile.disliked) ? SIMILAR : 0)
}

/** Scores for suggestions that have no card (Spoonacular's): the ingredients are have + need. */
export function suggestionScores(
  profile: TasteProfile,
  suggestions: readonly Suggestion[],
  cuisines: ReadonlyMap<string, string | null> = new Map(),
): Map<string, number> {
  const scores = new Map<string, number>()
  if (!hasTaste(profile)) return scores
  for (const s of suggestions) {
    const score = tasteScore(profile, { id: s.id, cuisine: cuisines.get(s.id) ?? null, ingredients: [...s.have, ...s.need] })
    if (score !== 0) scores.set(s.id, score)
  }
  return scores
}

/**
 * Re-sorts by missing count first, then taste (best first); everything else keeps its
 * existing order (the sort is stable). Never drops or hides anything.
 */
export function applyTaste<T extends Suggestion>(list: readonly T[], scores: ReadonlyMap<string, number>): T[] {
  if (scores.size === 0) return [...list]
  return [...list].sort((a, b) => a.need.length - b.need.length || (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
}
