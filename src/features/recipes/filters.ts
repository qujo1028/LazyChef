// Recipe filters live in the URL (?type=breakfast&time=30) so they survive reloads and can be shared.
// Meal type and time are applied locally to one cached, pantry-ranked pool of recipes (each carries
// its dishTypes and readyInMinutes), so changing them never costs a Spoonacular search.

/** The meal types we offer, with our labels. Values are kept as the old URLs spelled them. */
export const MEAL_FILTERS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "main course", label: "Dinner" },
  { value: "side dish", label: "Sides" },
  { value: "salad", label: "Salads" },
  { value: "soup", label: "Soups" },
  { value: "snack", label: "Snacks" },
  { value: "dessert", label: "Dessert" },
] as const

export type MealFilter = (typeof MEAL_FILTERS)[number]["value"]

/** "auto" picks the meal from the viewer's clock; "any" turns meal filtering off. */
export type MealChoice = "auto" | "any" | MealFilter

export const TIME_FILTERS = [15, 30, 45, 60] as const

export type TimeFilter = (typeof TIME_FILTERS)[number]

export type RecipeFilters = { type: MealChoice; maxTime: TimeFilter | null }

/** What a fresh visit shows: the meal for the time of day, no time limit. */
export const DEFAULT_FILTERS: RecipeFilters = { type: "auto", maxTime: null }

/** Every recipe, for "Clear filters" (the default would pick a meal again). */
export const CLEAR_FILTERS: RecipeFilters = { type: "any", maxTime: null }

type Param = string | string[] | undefined

function first(value: Param) {
  return Array.isArray(value) ? value[0] : value
}

/** Unknown values are ignored rather than erroring, so an old link still works. */
export function parseFilters(params: { type?: Param; time?: Param }): RecipeFilters {
  const type = first(params.type)?.trim().toLowerCase()
  const time = Number(first(params.time))
  return {
    type: type === "any" ? "any" : (MEAL_FILTERS.find((m) => m.value === type)?.value ?? "auto"),
    maxTime: TIME_FILTERS.find((t) => t === time) ?? null,
  }
}

/** Whether the person chose something (the auto default doesn't count). */
export function hasFilters(filters: RecipeFilters): boolean {
  return filters.type !== "auto" || filters.maxTime !== null
}

/** "/recipes?type=breakfast&time=30", dropping the default (auto) and empty filters. */
export function filtersHref(filters: RecipeFilters): string {
  const params = new URLSearchParams()
  if (filters.type !== "auto") params.set("type", filters.type)
  if (filters.maxTime) params.set("time", String(filters.maxTime))
  const query = params.toString()
  return query ? `/recipes?${query}` : "/recipes"
}

// ── Auto: the meal for the time of day ───────────────────────────────────────

export type AutoSlot = { label: string; meals: readonly MealFilter[] }

/**
 * 6-10 breakfast, 11-3 lunch, 3-5 snack, 5-9 dinner, 9pm-6am dessert or a snack.
 * `hour` is the viewer's local hour, 0-23 (10 means 10:00 to 10:59).
 */
export function autoSlot(hour: number): AutoSlot {
  if (hour >= 6 && hour < 11) return { label: "Breakfast", meals: ["breakfast"] }
  if (hour >= 11 && hour < 15) return { label: "Lunch", meals: ["lunch"] }
  if (hour >= 15 && hour < 17) return { label: "Snack", meals: ["snack"] }
  if (hour >= 17 && hour < 21) return { label: "Dinner", meals: ["main course"] }
  return { label: "Dessert", meals: ["dessert", "snack"] }
}

/**
 * The meals to show: null means all of them (Any meal, or Auto before we know the viewer's clock).
 */
export function resolveMeals(type: MealChoice, hour: number | null): readonly MealFilter[] | null {
  if (type === "any") return null
  if (type === "auto") return hour === null ? null : autoSlot(hour).meals
  return [type]
}

/** "Breakfast", for the Auto chip and empty states; null while the viewer's clock is unknown. */
export function autoLabel(hour: number | null): string | null {
  return hour === null ? null : autoSlot(hour).label
}

/** The cookie that holds the viewer's IANA time zone (set by TimezoneSync, read on the server). */
export const TIMEZONE_COOKIE = "tz"

/** The viewer's local hour (0-23) in an IANA time zone, or null for a missing or unknown zone. */
export function hourInZone(now: Date, timeZone: string | undefined): number | null {
  if (!timeZone) return null
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(now)
    const hour = Number(parts.find((part) => part.type === "hour")?.value)
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null
  } catch {
    return null
  }
}

// ── Local filtering ──────────────────────────────────────────────────────────

export type Filterable = { dishTypes: readonly string[]; readyInMinutes: number | null }

/** How Spoonacular spells each meal in a recipe's dishTypes. */
const DISH_TYPES: Record<Exclude<MealFilter, "lunch">, readonly string[]> = {
  breakfast: ["breakfast", "morning meal", "brunch"],
  "main course": ["main course", "main dish", "dinner"],
  "side dish": ["side dish"],
  salad: ["salad"],
  soup: ["soup"],
  snack: ["snack", "fingerfood", "appetizer", "antipasti"],
  dessert: ["dessert"],
}

/** Lunch leans light: salads, soups, anything labelled lunch, or a main course that's quick. */
export const LUNCH_MAIN_MINUTES = 30

export function matchesMeal(recipe: Filterable, meal: MealFilter): boolean {
  const types = recipe.dishTypes
  if (meal === "lunch") {
    if (types.includes("lunch") || types.includes("salad") || types.includes("soup")) return true
    const isMain = DISH_TYPES["main course"].some((type) => types.includes(type))
    return isMain && recipe.readyInMinutes !== null && recipe.readyInMinutes <= LUNCH_MAIN_MINUTES
  }
  return DISH_TYPES[meal].some((type) => types.includes(type))
}

/** Recipes with no known cook time don't count as "under N minutes". */
export function matchesTime(recipe: Filterable, maxTime: TimeFilter | null): boolean {
  if (maxTime === null) return true
  return recipe.readyInMinutes !== null && recipe.readyInMinutes <= maxTime
}

/** The pool narrowed to the chosen meals (any of them) and cook time. */
export function filterRecipes<T extends Filterable>(
  recipes: readonly T[],
  meals: readonly MealFilter[] | null,
  maxTime: TimeFilter | null,
): T[] {
  return recipes.filter(
    (recipe) => (meals === null || meals.some((meal) => matchesMeal(recipe, meal))) && matchesTime(recipe, maxTime),
  )
}
