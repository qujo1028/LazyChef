// Recipes come from three places. In URLs and actions each one is a single string:
// Spoonacular's recipes by their numeric id ("715538"), ours (TheMealDB imports and
// household recipes) by their uuid. Pure, shared by server and client.

export type RecipeSource = "spoonacular" | "themealdb" | "user"

export type RecipeRef = { kind: "spoonacular"; id: number } | { kind: "local"; id: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

/** "715538" → Spoonacular, a uuid → ours, anything else → null. */
export function parseRecipeRef(value: unknown): RecipeRef | null {
  if (typeof value !== "string") return null
  if (/^\d{1,9}$/.test(value)) {
    const id = Number(value)
    return id > 0 ? { kind: "spoonacular", id } : null
  }
  return isUuid(value) ? { kind: "local", id: value.toLowerCase() } : null
}

export function recipeHref(ref: string): string {
  return `/recipes/${ref}`
}

/** The small tag on cards and recipe pages. */
export const SOURCE_LABELS: Record<RecipeSource, string> = {
  spoonacular: "Powered by Spoonacular",
  themealdb: "From TheMealDB",
  user: "Your recipe",
}

/** TheMealDB's page for one of its meals (imported recipes credit and link to it). */
export function mealDbUrl(sourceId: string): string {
  return `https://www.themealdb.com/meal/${encodeURIComponent(sourceId)}`
}
