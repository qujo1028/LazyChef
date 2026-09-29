import type { Category } from "@/lib/ingredients/types"

/**
 * One-tap basics for an empty pantry. The category is only for the chip's emoji;
 * addStaples() files each item itself (household fixes, then the library).
 */
export const COMMON_STAPLES: readonly { name: string; category: Category }[] = [
  { name: "salt", category: "spices" },
  { name: "black pepper", category: "spices" },
  { name: "olive oil", category: "condiments" },
  { name: "vegetable oil", category: "condiments" },
  { name: "sugar", category: "baking" },
  { name: "all-purpose flour", category: "baking" },
  { name: "butter", category: "dairy" },
  { name: "garlic", category: "produce" },
]

/** Quick expiry picks, in days from today. */
export const QUICK_EXPIRY: readonly { label: string; days: number }[] = [
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
]
