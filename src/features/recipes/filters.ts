// Recipe filters live in the URL (?type=breakfast&time=30&q=curry&world=1) so they survive reloads and can be shared.

/** The meal types we offer, as Spoonacular spells them, with our labels. */
export const MEAL_FILTERS = [
  { value: "breakfast", label: "Breakfast" },
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
  type: MealFilter | null
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
 * count here (nor does it change what Spoonacular is asked).
 */
export function hasFilters(filters: RecipeFilters): boolean {
  return filters.type !== null || filters.maxTime !== null || filters.query !== null
}

/** "/recipes?type=breakfast&time=30&q=curry", dropping empty filters. */
export function filtersHref(filters: RecipeFilters, { more = false }: { more?: boolean } = {}): string {
  const params = new URLSearchParams()
  if (filters.type) params.set("type", filters.type)
  if (filters.maxTime) params.set("time", String(filters.maxTime))
  if (filters.query) params.set("q", filters.query)
  if (filters.world !== (filters.worldDefault ?? false)) params.set("world", filters.world ? "1" : "0")
  if (filters.all) params.set("all", "1")
  if (more) params.set("more", "1")
  const query = params.toString()
  return query ? `/recipes?${query}` : "/recipes"
}
