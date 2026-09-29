// Recipe filters live in the URL (?type=breakfast&time=30) so they survive reloads and can be shared.

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

export type RecipeFilters = { type: MealFilter | null; maxTime: TimeFilter | null }

export const NO_FILTERS: RecipeFilters = { type: null, maxTime: null }

type Param = string | string[] | undefined

function first(value: Param) {
  return Array.isArray(value) ? value[0] : value
}

/** Unknown values are ignored rather than erroring, so an old link still works. */
export function parseFilters(params: { type?: Param; time?: Param }): RecipeFilters {
  const type = first(params.type)?.trim().toLowerCase()
  const time = Number(first(params.time))
  return {
    type: MEAL_FILTERS.find((m) => m.value === type)?.value ?? null,
    maxTime: TIME_FILTERS.find((t) => t === time) ?? null,
  }
}

export function hasFilters(filters: RecipeFilters): boolean {
  return filters.type !== null || filters.maxTime !== null
}

/** "/recipes?type=breakfast&time=30", dropping empty filters. */
export function filtersHref(filters: RecipeFilters): string {
  const params = new URLSearchParams()
  if (filters.type) params.set("type", filters.type)
  if (filters.maxTime) params.set("time", String(filters.maxTime))
  const query = params.toString()
  return query ? `/recipes?${query}` : "/recipes"
}
