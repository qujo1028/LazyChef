// Turns LazyChef's own written recipes (data/lazychef/*.json) into rows for the shared recipe
// library, with the same ingredient parsing and matching as the TheMealDB import (toIngredient).
// Pure, so the importer (scripts/import-lazychef-library.mjs) and the tests share it.
import { findIngredient } from "../../ingredients/catalog"

import { toIngredient, type ImportedIngredient } from "./themealdb"

export const LIBRARY_CUISINES = ["United States", "Chinese"] as const

const MEAL_TYPES = new Set([
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
])

/** Licenses a library photo may carry. AI images carry none. */
export const PHOTO_LICENSES = ["CC0", "Public domain", "CC BY", "CC BY-SA"] as const

/** One ingredient as written: amount and name apart, so prep words never reach the matcher. */
export type DraftIngredient = {
  /** "2 cups", "1 (15 oz) can", "" for "salt" or "to taste" lines. */
  amount: string
  /** "cooked white rice": what you'd buy, no prep words. */
  name: string
  /** "minced", "cut into 1 inch pieces", "to taste". */
  prep?: string
  optional?: boolean
}

export type DraftPhoto = {
  /** The https URL the app shows (our storage bucket). */
  url: string
  ai_generated: boolean
  author?: string | null
  /** "CC BY-SA 4.0" */
  license?: string | null
  license_url?: string | null
  /** The file's page (Wikimedia Commons). */
  source_url?: string | null
}

export type DraftRecipe = {
  slug: string
  title: string
  summary: string
  cuisine: string
  meal_types: string[]
  servings: number
  ready_in_minutes: number
  ingredients: DraftIngredient[]
  steps: string[]
  photo?: DraftPhoto | null
}

export type LibraryRecipe = {
  source: "lazychef"
  source_id: string
  title: string
  summary: string
  cuisine: string
  meal_types: string[]
  servings: number
  ready_in_minutes: number
  instructions: string[]
  image_url: string | null
  image_author: string | null
  image_license: string | null
  image_license_url: string | null
  image_source_url: string | null
  image_ai_generated: boolean
  source_url: null
  extended: false
  ingredients: ImportedIngredient[]
}

export type CheckResult = { recipe: LibraryRecipe | null; issues: string[] }

const SLUG = /^(?:us|cn)-[a-z0-9]+(?:-[a-z0-9]+)*$/
const EM_DASH = /—/
// Words that make an amount a count ("1 large onion", "2 stalks celery"): fine as "count".
const COUNT_WORDS =
  /\b(?:small|medium|large|extra|jumbo|whole|stalks?|ribs?|leaf|leaves|heads?|sprigs?|pieces?|slices?|bunch(?:es)?|ears?|fillets?|links?|strips?|sheets?|cubes?|scoops?|about|to|or|and|lb|oz)\b/gi
// What's left after those: a unit word the parser didn't read ("1 inch ginger" comes back as 1 count).
const LETTERS = /[a-z]/i
// Prep that belongs in `prep`. Not "diced" or "sliced": "diced tomatoes" and "sliced almonds" are things you buy.
const PREP_IN_NAME = /,|\b(?:minced|finely|roughly|peeled|softened|melted|beaten|divided|to taste|room temperature|for serving|for garnish)\b/i

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd() + "…"
}

function httpsOrNull(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "https:" && url.toString().length <= 500 ? url.toString() : null
  } catch {
    return null
  }
}

/** One written line, parsed and matched exactly like a TheMealDB pair. */
export function toLibraryIngredient(line: DraftIngredient, position: number): ImportedIngredient | null {
  const row = toIngredient(line.amount, line.name, position)
  if (!row) return null
  const prep = text(line.prep)
  return {
    ...row,
    original: prep ? clip(`${row.original}, ${prep}`, 300) : row.original,
    optional: row.optional || line.optional === true || /\boptional\b/i.test(prep),
  }
}

/** Problems with one ingredient line, for review. Empty when it looks fine. */
export function ingredientIssues(line: DraftIngredient, row: ImportedIngredient): string[] {
  const issues: string[] = []
  const amount = text(line.amount).replace(/\([^)]*\)/g, "")
  // Curated entries without a Spoonacular id still match pantries by name_key.
  if (findIngredient(row.name) === null) issues.push(`"${row.name}" doesn't match the ingredient library`)
  if (amount && row.quantity === null) issues.push(`"${row.original}": amount not read`)
  else if (amount && row.unit === "count" && LETTERS.test(amount.replace(COUNT_WORDS, ""))) {
    issues.push(`"${row.original}": unit not read`)
  }
  if (PREP_IN_NAME.test(row.name)) issues.push(`"${row.name}": prep words belong in prep, not the name`)
  const nameWords = row.name.split(/\s+/).filter((word) => word.length > 3)
  if (nameWords.length > 0 && nameWords.every((word) => amount.toLowerCase().includes(word))) {
    issues.push(`"${row.original}": the name is repeated in the amount`)
  }
  return issues
}

/** Validates a written recipe and converts it to library rows. `recipe` is null when it can't be stored. */
export function checkLibraryRecipe(draft: DraftRecipe): CheckResult {
  const issues: string[] = []
  const fatal: string[] = []
  const slug = text(draft.slug)
  const title = text(draft.title)
  const summary = text(draft.summary)
  const cuisine = text(draft.cuisine)

  if (!SLUG.test(slug) || slug.length > 40) fatal.push(`bad slug "${slug}"`)
  if (title.length < 1 || title.length > 200) fatal.push("title must be 1 to 200 characters")
  if (summary.length < 1 || summary.length > 2000) fatal.push("summary must be 1 to 2000 characters")
  if (!(LIBRARY_CUISINES as readonly string[]).includes(cuisine)) fatal.push(`cuisine "${cuisine}" isn't a library label`)

  const mealTypes = Array.isArray(draft.meal_types) ? [...new Set(draft.meal_types.map(text))] : []
  if (mealTypes.length < 1 || mealTypes.length > 8 || mealTypes.some((t) => !MEAL_TYPES.has(t))) {
    fatal.push(`bad meal types: ${mealTypes.join(", ") || "(none)"}`)
  }
  const servings = Number(draft.servings)
  if (!Number.isInteger(servings) || servings < 1 || servings > 100) fatal.push("servings must be 1 to 100")
  const minutes = Number(draft.ready_in_minutes)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 2880) fatal.push("ready time must be 1 to 2880 minutes")

  const steps = Array.isArray(draft.steps) ? draft.steps.map(text).filter(Boolean) : []
  if (steps.length < 1 || steps.length > 60) fatal.push("needs 1 to 60 steps")
  else if (steps.length < 5 || steps.length > 12) issues.push(`${steps.length} steps (aim for 5 to 12)`)
  if (steps.some((step) => step.length > 2000)) fatal.push("a step is over 2000 characters")

  const lines = Array.isArray(draft.ingredients) ? draft.ingredients.slice(0, 100) : []
  const ingredients: ImportedIngredient[] = []
  for (const line of lines) {
    const row = toLibraryIngredient(line, ingredients.length)
    if (!row) continue
    ingredients.push(row)
    issues.push(...ingredientIssues(line, row))
  }
  if (ingredients.length === 0) fatal.push("no ingredients")
  const names = ingredients.map((row) => row.name_key)
  const repeated = names.filter((name, i) => name && names.indexOf(name) !== i)
  if (repeated.length > 0) issues.push(`listed twice: ${[...new Set(repeated)].join(", ")}`)

  const everything = [title, summary, ...steps, ...ingredients.map((row) => row.original)].join("\n")
  if (EM_DASH.test(everything)) issues.push("contains an em dash")

  const photo = draft.photo ?? null
  const imageUrl = photo ? httpsOrNull(photo.url) : null
  if (photo && !imageUrl) fatal.push("photo url must be https")
  if (photo && !photo.ai_generated) {
    if (!(PHOTO_LICENSES as readonly string[]).some((l) => text(photo.license).startsWith(l))) {
      fatal.push(`photo license "${text(photo.license)}" isn't allowed`)
    }
    const needsCredit = !/^(?:CC0|Public domain)/.test(text(photo.license))
    if (needsCredit && (!text(photo.author) || !httpsOrNull(photo.source_url))) {
      fatal.push("an attributed photo needs an author and a source link")
    }
  }

  if (fatal.length > 0) return { recipe: null, issues: [...fatal, ...issues] }
  return {
    recipe: {
      source: "lazychef",
      source_id: slug,
      title,
      summary,
      cuisine,
      meal_types: mealTypes,
      servings,
      ready_in_minutes: minutes,
      instructions: steps,
      image_url: imageUrl,
      image_author: photo && !photo.ai_generated ? clip(text(photo.author), 200) || null : null,
      image_license: photo && !photo.ai_generated ? clip(text(photo.license), 60) || null : null,
      image_license_url: photo && !photo.ai_generated ? httpsOrNull(photo.license_url) : null,
      image_source_url: photo && !photo.ai_generated ? httpsOrNull(photo.source_url) : null,
      image_ai_generated: photo?.ai_generated === true,
      source_url: null,
      extended: false,
      ingredients,
    },
    issues,
  }
}

/** Words that don't make two titles different dishes. */
const FILLER = new Set(["and", "with", "the", "a", "of", "in", "style", "easy", "classic", "homemade", "recipe", "best", "simple", "quick"])

/** "General Tso's Chicken" → "chicken general tso": for spotting the same dish under another spelling. */
export function titleKey(title: string): string {
  const words = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]s\b/g, "s")
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !FILLER.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word))
  return [...new Set(words)].sort().join(" ")
}
