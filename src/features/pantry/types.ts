import type { Category } from "@/lib/ingredients/types"
import type { Tables } from "@/types/database"

export type PantryItem = Tables<"pantry_items">

/** A housemate, for "added by …" (from getHouseholdMembers). */
export type PantryMember = { userId: string; displayName: string }

/** An item as the user reviewed it, ready for addItems(). */
export type NewPantryItem = {
  name: string
  /** null = on hand, not tracked. */
  quantity: number | null
  unit: string
  category: Category
  /** YYYY-MM-DD. */
  expires_on: string | null
  is_staple: boolean
  ingredient_id: number | null
  /** The user picked a different category than we suggested; remember it for the household. */
  category_changed: boolean
}

/** Fields a housemate can change on an existing item (see the column grants). */
export type PantryItemFields = Partial<
  Pick<PantryItem, "name" | "quantity" | "unit" | "category" | "expires_on" | "is_staple">
>

/** What the server actions return: `{ error }`, or the data. */
export type ActionResult<T = object> = { error: string } | (T & { error?: undefined })

export type AddItemsSummary = { added: number; toppedUp: number; alreadyOnHand: number }
