// Pure: the editable "review before adding" state, shared by quick add and bulk add.
import type { Category, CategorySource, ResolvedItem } from "@/lib/ingredients/types"
import type { NewPantryItem } from "./types"

export type ReviewDraft = {
  key: string
  name: string
  /** As typed; "" = on hand, not tracked. */
  quantity: string
  unit: string
  category: Category
  suggestedCategory: Category
  categorySource: CategorySource
  /** YYYY-MM-DD or "". */
  expiresOn: string
  isStaple: boolean
  ingredientId: number | null
  /** The resolved name; renaming drops the ingredient id. */
  resolvedName: string
}

export function draftFromResolved(item: ResolvedItem, key: string): ReviewDraft {
  return {
    key,
    name: item.name,
    quantity: formatQuantityInput(item.quantity),
    unit: item.unit,
    category: item.category,
    suggestedCategory: item.category,
    categorySource: item.categorySource,
    expiresOn: "",
    isStaple: false,
    ingredientId: item.ingredientId,
    resolvedName: item.name,
  }
}

/** Drafts for one preview; `batch` keeps keys unique across previews. */
export function draftsFromResolved(items: readonly ResolvedItem[], batch: string | number): ReviewDraft[] {
  return items.map((item, index) => draftFromResolved(item, `${batch}-${index}`))
}

export function formatQuantityInput(quantity: number | null): string {
  return quantity === null ? "" : String(Math.round(quantity * 1000) / 1000)
}

/**
 * "2" → 2, "1.5" / "1,5" → 1.5, "1,000" → 1000, "1/2" → 0.5, "1 1/2" → 1.5, "" → null (not tracked).
 * undefined when it isn't a usable amount.
 */
export function parseQuantityInput(text: string): number | null | undefined {
  const trimmed = text.trim()
  // "1,000" is a thousand (as parseLine reads it); any other comma is a decimal comma ("1,5").
  const value = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(trimmed) ? trimmed.replace(/,/g, "") : trimmed.replace(",", ".")
  if (!value) return null
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(value)
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(value)
  let result: number
  if (mixed) result = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  else if (fraction) result = Number(fraction[1]) / Number(fraction[2])
  else if (/^\d*\.?\d+$/.test(value) || /^\d+\.$/.test(value)) result = Number(value)
  else return undefined
  return Number.isFinite(result) && result >= 0 && result <= 1_000_000 ? result : undefined
}

export function draftError(draft: ReviewDraft): { name?: string; quantity?: string } {
  const errors: { name?: string; quantity?: string } = {}
  const name = draft.name.trim()
  if (!name) errors.name = "Give it a name."
  else if (name.length > 80) errors.name = "Keep it under 80 characters."
  if (parseQuantityInput(draft.quantity) === undefined) errors.quantity = "Enter an amount like 2, 1.5 or 1/2."
  return errors
}

export function draftToItem(draft: ReviewDraft): NewPantryItem | null {
  const errors = draftError(draft)
  if (errors.name || errors.quantity) return null
  const name = draft.name.trim()
  const renamed = name.toLowerCase() !== draft.resolvedName.trim().toLowerCase()
  return {
    name,
    quantity: parseQuantityInput(draft.quantity) ?? null,
    unit: draft.unit,
    category: draft.category,
    expires_on: draft.expiresOn || null,
    is_staple: draft.isStaple,
    ingredient_id: renamed ? null : draft.ingredientId,
    category_changed: draft.category !== draft.suggestedCategory,
  }
}

/** All drafts as items, or null if any needs fixing. */
export function draftsToItems(drafts: readonly ReviewDraft[]): NewPantryItem[] | null {
  const items = drafts.map(draftToItem)
  return items.every((item): item is NewPantryItem => item !== null) ? items : null
}

export const CATEGORY_SOURCE_HINT: Record<CategorySource, string> = {
  household: "Your household's pick",
  catalog: "From the ingredient library",
  spoonacular: "Looked up online",
  fallback: "Best guess, check it",
}
