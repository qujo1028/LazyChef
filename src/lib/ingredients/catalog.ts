// OWNER: catalog agent. Contract stub — keep these exports and signatures.
// Pure module (no Node/Next APIs). The client imports it lazily for autocomplete,
// so keep the data compact.
import type { Category, CatalogEntry } from "./types"

/** Stable key for matching names: lowercase, trimmed, singular, no filler words. "Fresh Tomatoes" → "tomato". */
export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase()
}

/** Best library match for a typed name, or null. "boneless skinless chicken breasts" → chicken breast. */
export function findIngredient(name: string): CatalogEntry | null {
  void name
  return null
}

/** Autocomplete: entries matching what's typed so far, most useful first. "chi" → chicken breast, chickpeas, chili powder… */
export function searchIngredients(query: string, limit = 8): CatalogEntry[] {
  void query
  void limit
  return []
}

export function getIngredientById(id: number): CatalogEntry | null {
  void id
  return null
}

/** Best guess for names not in the library ("oat milk" → dairy), else "other". */
export function guessCategory(name: string): Category {
  void name
  return "other"
}
