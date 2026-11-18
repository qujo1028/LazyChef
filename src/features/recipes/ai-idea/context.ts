import "server-only"

import { requireHousehold } from "@/features/household/queries"
import { localDateKey } from "@lazychef/core/dates/days"
import { getPantryItems } from "@/features/pantry/queries"
import type { DietInput } from "@lazychef/core/preferences/diet"
import { hasRestrictions } from "@lazychef/core/preferences/options"
import { getMyPreferences } from "@/features/preferences/queries"

import { pantrySearchNames } from "@lazychef/core/recipes/match"
import { cleanNames, namesForDiet } from "./idea"

export type IdeaPantry =
  | { error: string }
  | { error?: undefined; householdId: string; diet: DietInput | null; names: string[] }

/**
 * What an AI idea may be built from: the household's pantry names (soonest-expiring first,
 * read here with the viewer's session, never taken from the browser), minus anything that
 * breaks the viewer's diet, plus that diet. Callers run requireViewer() first.
 */
export async function loadIdeaPantry(): Promise<IdeaPantry> {
  const [{ household }, prefs] = await Promise.all([requireHousehold(), getMyPreferences()])
  const diet = hasRestrictions(prefs) ? prefs : null
  const items = await getPantryItems(household.id)
  const names = cleanNames(namesForDiet(pantrySearchNames(items, localDateKey()), diet))
  if (names.length === 0) {
    return { error: diet ? "Nothing in your pantry fits your diet yet. Add a few things first." : "Add a few things to your pantry first." }
  }
  return { householdId: household.id, diet, names }
}
