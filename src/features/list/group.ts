// Pure: splits the list into what the screen shows.
import { CATEGORIES, type Category } from "@/lib/ingredients/types"

import type { ListItem } from "./types"

export type ListSections = {
  /** Not checked off yet, one group per category in store order (empty ones left out). */
  toBuy: { category: Category; items: ListItem[] }[]
  /** Checked off, most recent first. */
  inCart: ListItem[]
  toBuyCount: number
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true })

export function groupList(items: Iterable<ListItem>): ListSections {
  const byCategory = new Map<Category, ListItem[]>()
  const inCart: ListItem[] = []
  let toBuyCount = 0
  for (const item of items) {
    if (item.checked_at !== null) {
      inCart.push(item)
      continue
    }
    toBuyCount++
    const group = byCategory.get(item.category)
    if (group) group.push(item)
    else byCategory.set(item.category, [item])
  }

  const toBuy: ListSections["toBuy"] = []
  for (const { value } of CATEGORIES) {
    const group = byCategory.get(value)
    if (group) toBuy.push({ category: value, items: group.sort((a, b) => collator.compare(a.name, b.name)) })
  }
  inCart.sort((a, b) => (b.checked_at! > a.checked_at! ? 1 : b.checked_at! < a.checked_at! ? -1 : collator.compare(a.name, b.name)))
  return { toBuy, inCart, toBuyCount }
}

/** The heading's subtitle: "5 to buy · 2 in the cart". */
export function listSummary(toBuy: number, inCart: number): string {
  if (toBuy === 0 && inCart === 0) return "Shared with everyone in your household."
  const parts = [toBuy === 0 ? "All done" : `${toBuy} to buy`]
  if (inCart > 0) parts.push(`${inCart} in the cart`)
  return parts.join(" · ")
}
