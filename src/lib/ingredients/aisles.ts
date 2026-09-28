// OWNER: catalog agent. Contract stub — keep this export and signature.
import type { Category } from "./types"

/** Spoonacular aisle ("Milk, Eggs, Other Dairy", "Baking;Spices and Seasonings", …) → our category. */
export function categoryFromAisle(aisle: string | null | undefined): Category {
  void aisle
  return "other"
}
