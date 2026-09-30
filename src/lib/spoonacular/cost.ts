// What each Spoonacular call costs in points (free plan: 50 a day, reset at midnight UTC).
// Pure, so the guard that stops us before the limit can be tested. Quota headers on the
// response say what a call really cost; these are for deciding before we make it.

export const DAILY_POINTS = 50

export type ComplexSearchOptions = {
  fillIngredients?: boolean
  addRecipeInformation?: boolean
  addRecipeInstructions?: boolean
}

/** Rounds away float noise (0.1 + 0.2) so costs compare and display cleanly. */
function points(value: number) {
  return Math.round(value * 1000) / 1000
}

/** findByIngredients: 1 point + 0.01 per recipe. */
export function findByIngredientsCost(recipes: number): number {
  return points(1 + 0.01 * Math.max(0, recipes))
}

/** complexSearch: 1 point + 0.01 per result, + 0.025 per result for each add-on. */
export function complexSearchCost(results: number, options: ComplexSearchOptions = {}): number {
  const n = Math.max(0, results)
  const addOns = [options.fillIngredients, options.addRecipeInformation, options.addRecipeInstructions].filter(Boolean).length
  return points(1 + 0.01 * n + 0.025 * n * addOns)
}

/** /recipes/{id}/information: 1 point. */
export function recipeInformationCost(): number {
  return 1
}

/** informationBulk: 1 point + 0.5 per recipe after the first. */
export function informationBulkCost(recipes: number): number {
  return recipes <= 0 ? 0 : points(1 + 0.5 * (recipes - 1))
}

/** parseIngredients: 1 point per ingredient line. */
export function parseIngredientsCost(lines: number): number {
  return Math.max(0, lines)
}

/** The first moment of the next UTC day, when the daily points come back. */
export function nextQuotaReset(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

/** Today's key in the usage table: the UTC date, "2026-09-29". */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}
