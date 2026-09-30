// Turns TheMealDB meals into rows for our recipe library (recipes + recipe_ingredients).
// Pure, so the importer (scripts/import-themealdb.mjs) and the tests share it. No network here.
//
// TheMealDB gives each meal up to 20 ingredient + measure pairs ("3 cloves" + "garlic").
// Each pair is read with the pantry's parser (amount and unit) and matched to our ingredient
// library (for the Spoonacular id and the normalized name the matcher compares).
import { findIngredient, normalizeIngredientName } from "@/lib/ingredients/catalog"
import { parseLine } from "@/lib/ingredients/parse-line"

/** One meal from search.php / lookup.php. Only the fields we read. */
export type MealDbMeal = Record<string, string | null | undefined>

export type ImportedIngredient = {
  position: number
  /** "3 cloves garlic" */
  original: string
  /** "garlic" */
  name: string
  name_key: string
  quantity: number | null
  unit: string | null
  ingredient_id: number | null
  optional: boolean
}

export type ImportedRecipe = {
  source: "themealdb"
  source_id: string
  title: string
  cuisine: string | null
  meal_types: string[]
  instructions: string[]
  image_url: string | null
  source_url: string | null
  ingredients: ImportedIngredient[]
}

export type ImportResult = {
  recipes: ImportedRecipe[]
  /** Meals that couldn't be used (no id, title or ingredients). */
  skipped: string[]
  /** Ingredient names our library didn't know, with how many recipes use them. */
  unmatched: Map<string, number>
}

/** TheMealDB's page for a meal, for the credit link. */
export function mealDbUrl(sourceId: string): string {
  return `https://www.themealdb.com/meal/${encodeURIComponent(sourceId)}`
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd() + "…"
}

/** http(s) links only. `upgrade` turns http into https (images: the CSP only allows https). */
export function httpsUrl(value: unknown, { upgrade = false } = {}): string | null {
  const raw = text(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol === "http:" && upgrade) url.protocol = "https:"
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    const out = url.toString()
    return out.length <= 500 ? out : null
  } catch {
    return null
  }
}

// ── Meal types ──────────────────────────────────────────────────────────────

/** TheMealDB categories → Spoonacular's meal types (the ones our filters use). */
const CATEGORY_TYPES: Record<string, string> = {
  breakfast: "breakfast",
  dessert: "dessert",
  side: "side dish",
  starter: "appetizer",
}

const TAG_TYPES: Record<string, string> = {
  breakfast: "breakfast",
  brunch: "breakfast",
  soup: "soup",
  salad: "salad",
  snack: "snack",
  dessert: "dessert",
  side: "side dish",
  sidedish: "side dish",
  bread: "bread",
  sauce: "sauce",
  drink: "drink",
}

const TITLE_TYPES: [RegExp, string][] = [
  [/\bsoups?\b|\bbroth\b|\bchowder\b|\bbisque\b/i, "soup"],
  [/\bsalads?\b/i, "salad"],
  [/\bbreads?\b|\bloaf\b|\bbuns?\b|\brolls\b/i, "bread"],
  [/\bsauce\b|\bdressing\b|\bdip\b/i, "sauce"],
]

export function mealTypes(meal: MealDbMeal): string[] {
  const types = new Set<string>()
  const category = text(meal.strCategory).toLowerCase()
  types.add(CATEGORY_TYPES[category] ?? "main course")
  for (const tag of text(meal.strTags).split(",")) {
    const type = TAG_TYPES[tag.trim().toLowerCase().replace(/[^a-z]/g, "")]
    if (type) types.add(type)
  }
  const title = text(meal.strMeal)
  for (const [pattern, type] of TITLE_TYPES) if (pattern.test(title)) types.add(type)
  // A soup or salad isn't also "main course" unless it's filed under a meat or the like.
  if ((types.has("soup") || types.has("salad") || types.has("bread") || types.has("sauce")) && !(category in CATEGORY_TYPES)) {
    if (["miscellaneous", "vegetarian", "vegan", "side", "starter"].includes(category)) types.delete("main course")
  }
  return [...types].slice(0, 8)
}

// ── Steps ───────────────────────────────────────────────────────────────────

/** "step 1", "STEP 2:", "Step 3." on a line of their own. */
const STEP_HEADER = /^(?:step\s*\d+[.:)]?|\d+[.)]?)$/i
/** "1. Heat the oil", "2) Stir", "Step 3: Serve" at the start of a line. */
const STEP_NUMBER = /^(?:step\s*\d+\s*[.:)-]?\s*|\d{1,2}\s*[.)]\s+)/i

/** Instructions → steps: one per line, numbering and "step 1" headers removed. */
export function splitSteps(instructions: unknown): string[] {
  const raw = typeof instructions === "string" ? instructions : ""
  const steps: string[] = []
  for (const line of raw.split(/\r\n?|\n/)) {
    const clean = text(line)
    if (!clean || STEP_HEADER.test(clean)) continue
    const step = text(clean.replace(STEP_NUMBER, ""))
    if (step) steps.push(clip(step, 2000))
  }
  if (steps.length <= 60) return steps
  // Keep every word: fold the tail into the last allowed step.
  const head = steps.slice(0, 59)
  head.push(clip(steps.slice(59).join(" "), 2000))
  return head
}

// ── Ingredients ─────────────────────────────────────────────────────────────

/** Measures that mean the ingredient is extra ("to serve", "optional", "to garnish"). */
const OPTIONAL_MEASURE = /\b(?:optional|to serve|for serving|to garnish|for garnish|garnish|for decoration|to decorate)\b/i

/** "1 tin " + "chopped tomatoes" → one ingredient row, or null for an empty pair. */
export function toIngredient(measureValue: unknown, ingredientValue: unknown, position: number): ImportedIngredient | null {
  const ingredient = text(ingredientValue)
  if (!ingredient) return null
  const measure = text(measureValue)
  const name = clip(ingredient.toLowerCase(), 120)
  const original = clip(measure ? `${measure} ${ingredient}` : ingredient, 300)

  // The parser reads the amount from the whole line ("1 tin chopped tomatoes" → 1 can).
  const parsed = measure ? parseLine(`${measure} ${ingredient}`) : null
  const hasAmount = parsed !== null && parsed.quantity !== null && parsed.quantity > 0 && parsed.quantity <= 1_000_000
  const entry = findIngredient(name)

  return {
    position,
    original,
    name,
    name_key: clip(normalizeIngredientName(name), 120),
    quantity: hasAmount ? parsed.quantity : null,
    unit: hasAmount ? clip(parsed.unit, 24) : null,
    ingredient_id: entry?.id ?? null,
    optional: OPTIONAL_MEASURE.test(measure),
  }
}

export function mealIngredients(meal: MealDbMeal): ImportedIngredient[] {
  const lines: ImportedIngredient[] = []
  for (let i = 1; i <= 20 && lines.length < 100; i++) {
    const line = toIngredient(meal[`strMeasure${i}`], meal[`strIngredient${i}`], lines.length)
    if (line) lines.push(line)
  }
  return lines
}

// ── Meals ───────────────────────────────────────────────────────────────────

export function mealToRecipe(meal: MealDbMeal): ImportedRecipe | null {
  const sourceId = text(meal.idMeal)
  const title = clip(text(meal.strMeal), 200)
  if (!/^\d{1,40}$/.test(sourceId) || !title) return null
  const ingredients = mealIngredients(meal)
  if (ingredients.length === 0) return null
  const cuisine = text(meal.strArea) || text(meal.strCountry)
  return {
    source: "themealdb",
    source_id: sourceId,
    title,
    cuisine: cuisine && cuisine.toLowerCase() !== "unknown" ? clip(cuisine, 60) : null,
    meal_types: mealTypes(meal),
    instructions: splitSteps(meal.strInstructions),
    image_url: httpsUrl(meal.strMealThumb, { upgrade: true }),
    source_url: httpsUrl(meal.strSource),
    ingredients,
  }
}

/** Every meal, de-duplicated by id, plus what didn't match our ingredient library. */
export function convertMeals(meals: readonly MealDbMeal[]): ImportResult {
  const recipes = new Map<string, ImportedRecipe>()
  const skipped: string[] = []
  const unmatched = new Map<string, number>()
  for (const meal of meals) {
    const recipe = mealToRecipe(meal)
    if (!recipe) {
      skipped.push(text(meal.strMeal) || text(meal.idMeal) || "(no name)")
      continue
    }
    if (recipes.has(recipe.source_id)) continue
    recipes.set(recipe.source_id, recipe)
    const missing = new Set(recipe.ingredients.filter((line) => line.ingredient_id === null).map((line) => line.name))
    for (const name of missing) unmatched.set(name, (unmatched.get(name) ?? 0) + 1)
  }
  return { recipes: [...recipes.values()], skipped, unmatched }
}

/** The `meals` array of a TheMealDB response ({"meals": null} when a letter has none). */
export function mealsFromResponse(body: unknown): MealDbMeal[] {
  if (!body || typeof body !== "object") return []
  const meals = (body as { meals?: unknown }).meals
  return Array.isArray(meals) ? meals.filter((m): m is MealDbMeal => !!m && typeof m === "object") : []
}
