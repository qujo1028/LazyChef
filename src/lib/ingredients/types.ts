import type { Enums } from "@/types/database"

export type Category = Enums<"item_category">

/** Display info for each category, in the order you'd walk a grocery store. */
export const CATEGORIES: readonly { value: Category; label: string; emoji: string }[] = [
  { value: "produce", label: "Produce", emoji: "🥬" },
  { value: "bakery", label: "Bakery", emoji: "🍞" },
  { value: "meat", label: "Meat", emoji: "🥩" },
  { value: "seafood", label: "Seafood", emoji: "🐟" },
  { value: "dairy", label: "Dairy & eggs", emoji: "🥛" },
  { value: "frozen", label: "Frozen", emoji: "🧊" },
  { value: "grains", label: "Grains & pasta", emoji: "🍝" },
  { value: "baking", label: "Baking", emoji: "🧁" },
  { value: "canned", label: "Canned & jarred", emoji: "🥫" },
  { value: "condiments", label: "Oils & condiments", emoji: "🫙" },
  { value: "spices", label: "Spices", emoji: "🧂" },
  { value: "snacks", label: "Snacks", emoji: "🍿" },
  { value: "beverages", label: "Drinks", emoji: "🧃" },
  { value: "other", label: "Other", emoji: "📦" },
] as const

export const CATEGORY_META = Object.fromEntries(
  CATEGORIES.map((c, order) => [c.value, { ...c, order }]),
) as Record<Category, { value: Category; label: string; emoji: string; order: number }>

/** One line of typed text, split into amount, unit and name. */
export type ParsedLine = {
  /**
   * The line as parsed, not exactly as typed: trimmed, odd spaces (no-break, thin) turned into " ",
   * invisible characters removed, and any list marker ("- ", "1. ") and trailing price ("$3.49")
   * removed, so it starts with amountText. When parseLines joins an amount-only piece onto the item
   * before it ("chicken breast, 2 lbs"), that item's raw is both pieces joined ("chicken breast, 2 lbs").
   */
  raw: string
  /** The leading amount + unit exactly as typed, e.g. "2 lbs " ("" when none). Lets the UI swap the name for a suggestion. */
  amountText: string
  /** Name without amount/unit, lowercased and trimmed: "chicken breast". */
  name: string
  /** null when no amount was given ("salt"). "1 dozen eggs" → 12. */
  quantity: number | null
  /** Canonical unit key from src/lib/units ("lb", "cup", "count", …). "count" when none. */
  unit: string
}

/** One ingredient in the built-in library (src/lib/ingredients/library). */
export type CatalogEntry = {
  /** Spoonacular ingredient id, or null for entries we added ourselves. */
  id: number | null
  /** Canonical name, lowercase: "chicken breast". */
  name: string
  category: Category
  /** Other names people type for it: ["scallion", "spring onion"] for "green onion". */
  aliases: string[]
  /** Sensible units for this ingredient (canonical unit keys), most natural first. */
  units: string[]
}

/** Where an item's category came from, most trusted first. */
export type CategorySource = "household" | "catalog" | "spoonacular" | "fallback"

/** A parsed line with its category and ingredient worked out; ready to review and add. */
export type ResolvedItem = ParsedLine & {
  category: Category
  categorySource: CategorySource
  ingredientId: number | null
}
