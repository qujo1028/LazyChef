// Generated from packages/core/src/recipes/basics.ts by scripts/sync-edge-shared.mjs. Edit the source, then rerun it.
// Ingredients every kitchen is taken to have. Its own file, free of the ingredient catalog, so the
// Edge Functions can use it (scripts/sync-edge-shared.mjs).

/**
 * Taken as always there, like Spoonacular's own ignorePantry: water, salt and pepper never
 * count as missing. Normalized names (see normalizeIngredientName). Not "bell pepper".
 */
export const BASICS: ReadonlySet<string> = new Set([
  "water",
  "ice",
  "ice water",
  "hot water",
  "cold water",
  "warm water",
  "boiling water",
  "salt",
  "table salt",
  "kosher salt",
  "sea salt",
  "pepper",
  "black pepper",
  "ground pepper",
  "ground black pepper",
  "cracked black pepper",
  "white pepper",
  "salt and pepper",
])
