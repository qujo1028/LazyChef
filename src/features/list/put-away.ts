// Pure: turning checked-off list lines into the pantry's "check before adding" drafts,
// and saying which ones will top up something already in the pantry.
import { displayName } from "@/features/pantry/display"
import { planAdditions, type ExistingItem, type MergeDeps } from "@/features/pantry/merge"
import { draftToItem, formatQuantityInput, type ReviewDraft } from "@/features/pantry/review"
import { formatQuantity } from "@/lib/units"

import type { ListItem } from "./types"

/** Drafts keyed by the list line's id, so the put-away can tell which lines they came from. */
export function draftsFromListItems(items: readonly ListItem[]): ReviewDraft[] {
  return items.map((item) => ({
    key: item.id,
    name: item.name,
    quantity: formatQuantityInput(item.quantity),
    unit: item.unit ?? "count",
    category: item.category,
    suggestedCategory: item.category,
    categorySource: "household",
    expiresOn: "",
    isStaple: false,
    ingredientId: item.ingredient_id,
    resolvedName: item.name,
  }))
}

/**
 * Per draft key, a note when it won't become a new pantry item: "Adds to your chicken
 * breast (1 lb)" or "Already on hand". Drafts that don't validate yet get no note.
 */
export function mergeHints(
  drafts: readonly ReviewDraft[],
  pantry: readonly ExistingItem[],
  deps: MergeDeps,
): Map<string, string> {
  const valid = drafts.flatMap((draft) => {
    const item = draftToItem(draft)
    return item ? [{ key: draft.key, item }] : []
  })
  const plan = planAdditions(
    valid.map((v) => v.item),
    pantry,
    deps,
  )
  const byId = new Map(pantry.map((item) => [item.id, item]))
  const hints = new Map<string, string>()
  plan.outcomes.forEach((outcome, index) => {
    const key = valid[index].key
    if (outcome.type === "on-hand") hints.set(key, "Already on hand, so it won't be added again")
    else if (outcome.type === "merge") {
      const target = byId.get(outcome.into)
      if (!target) return
      const amount = target.quantity ? ` (${formatQuantity(target.quantity, target.unit)} now)` : ""
      hints.set(key, `Adds to your ${displayName(target.name).toLowerCase()}${amount}`)
    }
  })
  return hints
}
