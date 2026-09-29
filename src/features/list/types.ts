import type { Category } from "@/lib/ingredients/types"
import type { Tables } from "@/types/database"

export type { ActionResult } from "@/features/pantry/types"

export type ListItem = Tables<"shopping_list_items">

/** A line to put on the list (the add_to_shopping_list format for new lines). */
export type NewListLine = {
  name: string
  /** null = any amount. */
  quantity: number | null
  /** Canonical unit key, or null for none ("2 lemons"). */
  unit: string | null
  category: Category
  ingredient_id: number | null
  note: string | null
  recipe_id: number | null
  recipe_title: string | null
}

/** Fields a housemate can change on a list line (see the column grants). */
export type ListItemFields = Partial<Pick<ListItem, "name" | "quantity" | "unit" | "category" | "note">>

export type AddToListSummary = { added: number; toppedUp: number; alreadyOnList: number; ids: string[] }
