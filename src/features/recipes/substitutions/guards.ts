// Guards that keep "What can I use instead?" sensible. Pure (no network, no database).
//  - The star of the dish (a protein, or what the recipe is named for) is refused up front.
//  - An ingredient with a vetted table entry only gets swaps from that entry.
//  - Anything else keeps the AI's free-form answer only if each swap is plausible: same
//    family of grocery categories, not a protein, not the ingredient itself.
//  - Swaps that clash with the viewer's diet or allergies are dropped.
import type { Category } from "@lazychef/core/ingredients/types"
import { findIngredient, guessCategory, normalizeIngredientName } from "@lazychef/core/ingredients/catalog"
import { lookupSubstitutions, namedInTitle, type SubEntry } from "@lazychef/core/ingredients/substitutions"
import { conflicts, type DietInput } from "@lazychef/core/preferences/diet"

export const STAR_OF_THE_DISH = "This is the star of the dish, so swapping it would make a different recipe."
export const NO_GOOD_SWAP = "Nothing we know of would work well here."
export const NO_DIET_SWAP = "None of the usual swaps fit your diet or allergies."

/** How to answer for one ingredient, decided before the AI is asked anything. */
export type SubstitutionPlan =
  | { kind: "refuse"; reason: string }
  | { kind: "table"; key: string; entry: SubEntry }
  | { kind: "free" }

export function planSubstitution(name: string, title: string): SubstitutionPlan {
  const found = lookupSubstitutions(name)
  if (found.kind === "main") return { kind: "refuse", reason: STAR_OF_THE_DISH }
  const key = found.kind === "options" ? found.key : normalizeIngredientName(name)
  if (key && namedInTitle(key, title)) return { kind: "refuse", reason: STAR_OF_THE_DISH }
  if (found.kind === "options") {
    return found.entry.options.length > 0 ? { kind: "table", key: found.key, entry: found.entry } : { kind: "refuse", reason: NO_GOOD_SWAP }
  }
  return { kind: "free" }
}

function categoryOf(name: string): Category {
  return findIngredient(name)?.category ?? guessCategory(name)
}

/** "milk + lemon juice", "flour and water", "oil, warmed" → its parts. */
function parts(name: string): string[] {
  return name
    .split(/\s*(?:\+|&|,|\band\b|\bwith\b|\bor\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Grocery categories that can reasonably stand in for each other. Meat, seafood and "other"
 * are in none, so a protein (or something we can't place) is never a plausible free-form swap.
 */
const FAMILIES: readonly (readonly Category[])[] = [
  ["produce", "frozen", "canned"],
  ["dairy", "beverages"],
  ["grains", "baking", "bakery", "snacks"],
  ["spices", "condiments"],
]

/** Fresh produce that works as a seasoning, so fresh ↔ dried/bottled swaps are fine. */
const SEASONING_PRODUCE = new Set([
  "basil", "parsley", "cilantro", "coriander", "oregano", "thyme", "rosemary", "dill", "mint", "sage", "tarragon",
  "chive", "chives", "garlic", "ginger", "chili", "chile", "chilli", "jalapeno", "lemon", "lime", "orange", "zest",
  "scallion", "shallot", "onion",
])

function isSeasoningProduce(name: string): boolean {
  const key = normalizeIngredientName(name)
  return key.split(" ").some((word) => SEASONING_PRODUCE.has(word.replace(/e?s$/, "")) || SEASONING_PRODUCE.has(word))
}

function compatible(target: string, use: string): boolean {
  const a = categoryOf(target)
  const b = categoryOf(use)
  if (FAMILIES.some((family) => family.includes(a) && family.includes(b))) return true
  // Fresh herbs, citrus and aromatics against spices and bottled seasonings.
  const flavor: readonly Category[] = ["spices", "condiments"]
  return (
    (a === "produce" && flavor.includes(b) && isSeasoningProduce(target)) ||
    (b === "produce" && flavor.includes(a) && isSeasoningProduce(use))
  )
}

/** True when a free-form swap is a believable stand-in for the target. */
export function plausibleSwap(target: string, use: string): boolean {
  const targetKey = normalizeIngredientName(target)
  const useKey = normalizeIngredientName(use)
  if (!useKey || useKey === targetKey) return false
  const pieces = parts(use)
  if (pieces.length === 0) return false
  // No protein anywhere in it, and at least one part from the same kind of food.
  if (pieces.some((part) => lookupSubstitutions(part).kind === "main")) return false
  return pieces.some((part) => compatible(target, part))
}

/** True when this swap breaks the viewer's diet or allergies. */
export function clashesWithDiet(use: string, prefs: DietInput | null): boolean {
  return prefs !== null && conflicts([use], prefs)
}
