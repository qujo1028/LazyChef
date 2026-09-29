// Pure: the shopping list's client state, on top of the shared row state in
// src/lib/row-state.ts, plus in-flight "checked" overrides so quick taps don't flicker.
import {
  applyRowOverrides,
  beginOverride,
  endOverride,
  initialRowState,
  reduceRows,
  rowChangeFromBroadcast,
  toNumber,
  type Overrides,
  type RowBroadcast,
  type RowChange,
  type RowState,
  type RowSync,
  type Rows,
} from "@/lib/row-state"

import type { ListItem } from "./types"

export type ListItems = Rows<ListItem>
export type ListChange = RowChange<ListItem>
export type ListState = RowState<ListItem>

/** Postgres numerics can arrive as strings (JSON), the list wants numbers. */
export function normalizeListItem(item: ListItem): ListItem {
  const quantity = toNumber(item.quantity)
  const ingredientId = toNumber(item.ingredient_id)
  const recipeId = toNumber(item.recipe_id)
  if (quantity === item.quantity && ingredientId === item.ingredient_id && recipeId === item.recipe_id) return item
  return { ...item, quantity, ingredient_id: ingredientId, recipe_id: recipeId }
}

export function initialListState(items: Iterable<ListItem>): ListState {
  return initialRowState(items, normalizeListItem)
}

export function reduceList(state: ListState, change: ListChange | RowSync<ListItem>): ListState {
  return reduceRows(state, change, normalizeListItem)
}

export function listChangeFromBroadcast(broadcast: RowBroadcast<ListItem>, householdId: string): ListChange | null {
  return rowChangeFromBroadcast(broadcast, householdId)
}

/** While a check/uncheck is in flight: the checked_at to show (an ISO time, or null). */
export type CheckedOverrides = Overrides<string | null>

export function beginCheck(overrides: CheckedOverrides, id: string, checkedAt: string | null): CheckedOverrides {
  return beginOverride(overrides, id, checkedAt)
}

export function endCheck(overrides: CheckedOverrides, id: string): CheckedOverrides {
  return endOverride(overrides, id)
}

export function applyChecked(items: ListItems, overrides: CheckedOverrides, viewerId: string): ListItems {
  return applyRowOverrides(items, overrides, (item, checkedAt) => {
    if ((item.checked_at === null) === (checkedAt === null)) return item
    return checkedAt === null
      ? { ...item, checked_at: null, checked_by: null }
      : { ...item, checked_at: checkedAt, checked_by: viewerId }
  })
}
