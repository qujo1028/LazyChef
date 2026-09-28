// Pure: splits the pantry into the sections the list shows.
import { CATEGORIES, type Category } from "@/lib/ingredients/types"
import { daysBetween, EXPIRING_SOON_DAYS } from "./dates"
import type { PantryItem } from "./types"

export type PantrySections = {
  /** Expired or expiring within EXPIRING_SOON_DAYS, soonest first. */
  expiring: PantryItem[]
  /** Always on hand. */
  staples: PantryItem[]
  /** Everything else in stock, one group per category in store order (empty ones left out). */
  categories: { category: Category; items: PantryItem[] }[]
  /** Quantity 0. */
  ranOut: PantryItem[]
  /** Items that matched the search. */
  total: number
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true })
const byName = (a: PantryItem, b: PantryItem) => collator.compare(a.name, b.name)

export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || name.toLowerCase().includes(q)
}

export function isExpiringSoon(item: Pick<PantryItem, "expires_on">, today: string): boolean {
  return item.expires_on !== null && daysBetween(today, item.expires_on) <= EXPIRING_SOON_DAYS
}

export function groupPantry(items: Iterable<PantryItem>, today: string, query = ""): PantrySections {
  const sections: PantrySections = { expiring: [], staples: [], categories: [], ranOut: [], total: 0 }
  const byCategory = new Map<Category, PantryItem[]>()

  for (const item of items) {
    if (!matchesQuery(item.name, query)) continue
    sections.total++
    if (item.is_staple) sections.staples.push(item)
    else if (item.quantity === 0) sections.ranOut.push(item)
    else if (isExpiringSoon(item, today)) sections.expiring.push(item)
    else {
      const group = byCategory.get(item.category)
      if (group) group.push(item)
      else byCategory.set(item.category, [item])
    }
  }

  sections.expiring.sort((a, b) => (a.expires_on! < b.expires_on! ? -1 : a.expires_on! > b.expires_on! ? 1 : byName(a, b)))
  sections.staples.sort(byName)
  sections.ranOut.sort(byName)
  for (const { value } of CATEGORIES) {
    const group = byCategory.get(value)
    if (group) sections.categories.push({ category: value, items: group.sort(byName) })
  }
  return sections
}
