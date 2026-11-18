// Generated from packages/core/src/recipes/filters.ts by scripts/sync-edge-shared.mjs. Edit the source, then rerun it.
// Recipe filters live in the URL (?type=breakfast&time=30&q=curry&world=1) so they survive reloads and can be shared.
// No `type` = Auto (the meal for the viewer's local time), `type=any` = Any meal, `type=<meal>` = a manual pick.

/** The meal types we offer, as Spoonacular spells them, with our labels. */
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

export const TIME_FILTERS = [15, 30, 45, 60] as const

export type TimeFilter = (typeof TIME_FILTERS)[number]

export type RecipeFilters = {
  /** A meal picked by hand. Null means Auto, or Any meal when `anyMeal` is set. */
  type: MealFilter | null
  /** ?type=any: no meal filtering. Never set together with `type`. */
  anyMeal?: boolean
  maxTime: TimeFilter | null
  /** Words to look for in recipe titles ("chicken curry"). */
  query: string | null
  /** Include library recipes from less familiar cuisines (see EVERYDAY_CUISINES), in ideas and searches. */
  world: boolean
  /**
   * What `world` is when the URL doesn't say (the person's "Include world recipes"
   * preference). Links only spell out `world` when it differs from this.
   */
  worldDefault?: boolean
  /** ?all=1: ignore the person's diet and allergies for this view. */
  all?: boolean
}

export const NO_FILTERS: RecipeFilters = { type: null, maxTime: null, query: null, world: false }

/**
 * TheMealDB cuisines ("areas") that Ideas shows by default. Everything else (Jamaican,
 * Polish, Syrian…) waits for the "Include world recipes" switch. Lowercase, as stored
 * names vary between demonyms and countries ("France", "Italian").
 */
export const EVERYDAY_CUISINES = [
  "american",
  "united states",
  "canadian",
  "canada",
  "british",
  "united kingdom",
  "irish",
  "ireland",
  "italian",
  "italy",
  "mexican",
  "mexico",
  "chinese",
  "china",
  "japanese",
  "japan",
  "thai",
  "thailand",
  "indian",
  "india",
  "french",
  "france",
  "spanish",
  "spain",
  "greek",
  "greece",
] as const

/** Longest search we keep. */
export const MAX_QUERY_LENGTH = 80

/** Trimmed, single-spaced, at most MAX_QUERY_LENGTH characters; null when empty. */
export function cleanQuery(value: string | undefined): string | null {
  const query = (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH).trim()
  return query || null
}

type Param = string | string[] | undefined

function first(value: Param) {
  return Array.isArray(value) ? value[0] : value
}

/** Unknown values are ignored rather than erroring, so an old link still works. */
export function parseFilters(
  params: { type?: Param; time?: Param; q?: Param; world?: Param; all?: Param },
  { worldDefault = false }: { worldDefault?: boolean } = {},
): RecipeFilters {
  const type = first(params.type)?.trim().toLowerCase()
  const time = Number(first(params.time))
  const world = first(params.world)
  return {
    type: MEAL_FILTERS.find((m) => m.value === type)?.value ?? null,
    ...(type === "any" ? { anyMeal: true } : {}),
    maxTime: TIME_FILTERS.find((t) => t === time) ?? null,
    query: cleanQuery(first(params.q)),
    world: world === "1" ? true : world === "0" ? false : worldDefault,
    ...(worldDefault ? { worldDefault } : {}),
    ...(first(params.all) === "1" ? { all: true } : {}),
  }
}

/** ?more=1: "Show more ideas" asks Spoonacular even when there are plenty of local ones. */
export function parseMore(params: { more?: Param }): boolean {
  return first(params.more) === "1"
}

/**
 * Whether anything narrows the results. "World recipes" only adds recipes, so it doesn't
 * count here (nor does it change what Spoonacular is asked). Auto and Any meal aren't filters either.
 */
export function hasFilters(filters: RecipeFilters): boolean {
  return filters.type !== null || filters.maxTime !== null || filters.query !== null
}

/** "/recipes?type=breakfast&time=30&q=curry", dropping empty filters. */
export function filtersHref(filters: RecipeFilters, { more = false }: { more?: boolean } = {}): string {
  const params = new URLSearchParams()
  if (filters.type) params.set("type", filters.type)
  else if (filters.anyMeal) params.set("type", "any")
  if (filters.maxTime) params.set("time", String(filters.maxTime))
  if (filters.query) params.set("q", filters.query)
  if (filters.world !== (filters.worldDefault ?? false)) params.set("world", filters.world ? "1" : "0")
  if (filters.all) params.set("all", "1")
  if (more) params.set("more", "1")
  const query = params.toString()
  return query ? `/recipes?${query}` : "/recipes"
}

// ── Auto: the meal for the time of day ───────────────────────────────────────

export type AutoSlot = { label: string; meals: readonly MealFilter[] }

/**
 * 6-10 breakfast, 11-2 lunch, 3-4 snack, 5-8 dinner, 9pm-5am dessert or a snack.
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
export function resolveMeals(filters: Pick<RecipeFilters, "type" | "anyMeal">, hour: number | null): readonly MealFilter[] | null {
  if (filters.type) return [filters.type]
  if (filters.anyMeal || hour === null) return null
  return autoSlot(hour).meals
}

/** True when the meal comes from the clock (neither picked by hand nor "Any meal"). */
export function isAuto(filters: Pick<RecipeFilters, "type" | "anyMeal">): boolean {
  return filters.type === null && !filters.anyMeal
}

/** "Dinner", for the Auto chip and empty states; null while the viewer's clock is unknown. */
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

/** The meal types the library and Spoonacular know (everything but our "lunch", which is a mix). */
export type DishMeal = Exclude<MealFilter, "lunch">

/** One library query / Spoonacular search: a meal type, optionally with a cook-time cap. */
export type MealQuery = { type: DishMeal; maxMinutes: number | null }

/** Lunch leans light: salad, soup, and a main course only when it's quick. */
export const LUNCH_MAIN_MINUTES = 30

const tighter = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b))

/**
 * The queries that make up these meals, first = the primary one (what Spoonacular is asked).
 * Lunch is salad, soup and a main course of at most 30 minutes (or the chosen time, if less).
 * Null means every meal.
 */
export function mealQueries(meals: readonly MealFilter[] | null, maxTime: TimeFilter | null): MealQuery[] | null {
  if (meals === null) return null
  const seen = new Set<string>()
  const out: MealQuery[] = []
  for (const meal of meals) {
    const queries: MealQuery[] =
      meal === "lunch"
        ? [
            { type: "main course", maxMinutes: tighter(maxTime, LUNCH_MAIN_MINUTES) },
            { type: "salad", maxMinutes: maxTime },
            { type: "soup", maxMinutes: maxTime },
          ]
        : [{ type: meal, maxMinutes: maxTime }]
    for (const query of queries) {
      const key = `${query.type}:${query.maxMinutes}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push(query)
      }
    }
  }
  return out
}
