import { z } from "zod"

// The choices offered in the first-run flow and the "Food preferences" sheet. The values
// are what the database stores (see supabase/migrations/20261109164357_user_preferences.sql).

export const DIETS = [
  { value: "none", label: "No restrictions" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "pescatarian", label: "Pescatarian" },
] as const

export const ALLERGIES = [
  { value: "dairy", label: "Dairy" },
  { value: "egg", label: "Egg" },
  { value: "gluten", label: "Gluten" },
  { value: "peanut", label: "Peanut" },
  { value: "tree-nut", label: "Tree nut" },
  { value: "fish", label: "Fish" },
  { value: "shellfish", label: "Shellfish" },
  { value: "soy", label: "Soy" },
  { value: "sesame", label: "Sesame" },
] as const

/** Liked cuisines: the everyday ones Ideas already shows (see EVERYDAY_CUISINES). */
export const CUISINES = [
  { value: "american", label: "American" },
  { value: "british", label: "British" },
  { value: "italian", label: "Italian" },
  { value: "mexican", label: "Mexican" },
  { value: "chinese", label: "Chinese" },
  { value: "japanese", label: "Japanese" },
  { value: "thai", label: "Thai" },
  { value: "indian", label: "Indian" },
  { value: "french", label: "French" },
  { value: "spanish", label: "Spanish" },
  { value: "greek", label: "Greek" },
] as const

/** One-tap starter staples, named the way the ingredient catalog knows them. */
export const STARTER_STAPLES = [
  "salt",
  "black pepper",
  "olive oil",
  "vegetable oil",
  "sugar",
  "all-purpose flour",
  "butter",
  "garlic",
  "rice",
  "pasta",
  "eggs",
  "onions",
] as const

export const STAPLE_LABELS: Record<Staple, string> = {
  salt: "Salt",
  "black pepper": "Black pepper",
  "olive oil": "Olive oil",
  "vegetable oil": "Vegetable oil",
  sugar: "Sugar",
  "all-purpose flour": "Flour",
  butter: "Butter",
  garlic: "Garlic",
  rice: "Rice",
  pasta: "Pasta",
  eggs: "Eggs",
  onions: "Onions",
}

export type Diet = (typeof DIETS)[number]["value"]
export type Allergy = (typeof ALLERGIES)[number]["value"]
export type Cuisine = (typeof CUISINES)[number]["value"]
export type Staple = (typeof STARTER_STAPLES)[number]

export type FoodPreferences = {
  diet: Diet
  allergies: Allergy[]
  cuisines: Cuisine[]
  /** Recipe ideas include less familiar cuisines unless the URL says otherwise. */
  worldRecipes: boolean
}

export const NO_PREFERENCES: FoodPreferences = { diet: "none", allergies: [], cuisines: [], worldRecipes: false }

const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((o) => o.value) as [T[number]["value"], ...T[number]["value"][]]

/** Unknown values are dropped rather than failing, so an old saved draft still loads. */
const listOf = <T extends string>(allowed: readonly T[]) =>
  z
    .array(z.string())
    .max(50)
    .transform((list) => [...new Set(list.filter((v): v is T => (allowed as readonly string[]).includes(v)))])

export const preferencesSchema = z.object({
  diet: z.enum(values(DIETS)).catch("none"),
  allergies: listOf<Allergy>(values(ALLERGIES)),
  cuisines: listOf<Cuisine>(values(CUISINES)),
  worldRecipes: z.boolean().catch(false),
})

export const staplesSchema = listOf<Staple>(STARTER_STAPLES)

export function hasRestrictions(prefs: Pick<FoodPreferences, "diet" | "allergies">): boolean {
  return prefs.diet !== "none" || prefs.allergies.length > 0
}

export function labelOf(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value
}
