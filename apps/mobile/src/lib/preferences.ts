// Pure helpers for the food preferences card. No React Native imports so Vitest can run them.
import { ALLERGIES, CUISINES, DIETS, labelOf, preferencesSchema, type FoodPreferences } from '@lazychef/core/preferences/options';

/** Adds or removes one value, without duplicates. */
export function toggleValue<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
}

/** The saved row as preferences; unknown values are dropped, a missing row is "no restrictions". */
export function prefsFromRow(
  row: { diet: string; allergies: string[]; cuisines: string[]; world_recipes: boolean } | null,
): FoodPreferences {
  return preferencesSchema.parse({
    diet: row?.diet,
    allergies: row?.allergies ?? [],
    cuisines: row?.cuisines ?? [],
    worldRecipes: row?.world_recipes ?? false,
  });
}

/** "Vegetarian · No dairy · Italian", or "No restrictions". */
export function prefsSummary(prefs: FoodPreferences): string {
  const parts = [
    prefs.diet !== 'none' ? labelOf(DIETS, prefs.diet) : null,
    prefs.allergies.length ? `No ${prefs.allergies.map((a) => labelOf(ALLERGIES, a).toLowerCase()).join(', ')}` : null,
    prefs.cuisines.length ? prefs.cuisines.map((c) => labelOf(CUISINES, c)).join(', ') : null,
    prefs.worldRecipes ? 'World recipes' : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No restrictions';
}
