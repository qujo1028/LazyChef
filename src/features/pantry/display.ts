// Pure: how pantry items read in the list and sheets.
import { CATEGORY_META, type Category } from "@/lib/ingredients/types"
import { formatQuantity, UNIT_OPTIONS, unitDimension } from "@/lib/units"
import type { PantryItem, PantryMember } from "./types"

/** "chicken breast" → "Chicken breast". */
export function displayName(name: string): string {
  const trimmed = name.trim()
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** "2 lb", "12", "1½ cups"; "On hand" when not tracked, "Ran out" at zero. */
export function amountLabel(item: Pick<PantryItem, "quantity" | "unit">): string {
  if (item.quantity === null) return "On hand"
  if (item.quantity <= 0) return "Ran out"
  return formatQuantity(item.quantity, item.unit)
}

/** Items counted in whole things (eggs, cans, …) get a quick "−1" button. */
export function canUseOne(item: Pick<PantryItem, "quantity" | "unit" | "is_staple">): boolean {
  if (item.is_staple || item.quantity === null || item.quantity <= 0) return false
  const dimension = unitDimension(item.unit)
  return dimension === "count" || dimension === "package"
}

/** "Added by Sam", "Added by you", or "Added" when we don't know who. */
export function addedByLabel(
  createdBy: string | null,
  members: readonly PantryMember[],
  viewerId: string,
): string {
  if (!createdBy) return "Added"
  if (createdBy === viewerId) return "Added by you"
  const member = members.find((m) => m.userId === createdBy)
  return member ? `Added by ${member.displayName}` : "Added by a former member"
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

/** "2026-10-05" → "Oct 5" (a calendar day, so no time zone shifts). */
export function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  if (!y || !m || !d) return key
  return SHORT_DATE.format(Date.UTC(y, m - 1, d))
}

/** Toast after using some: "Eggs: 5 left", "Chicken breast: 1½ lb left", "Ran out of eggs". */
export function remainingMessage(name: string, quantity: number, unit: string): string {
  if (quantity <= 0) return `Ran out of ${name.trim()}`
  return `${displayName(name)}: ${formatQuantity(quantity, unit)} left`
}

/** The unit picker's choices, plus `current` if it isn't a known unit (so the select can show it). */
export function unitOptions(current: string): { value: string; label: string }[] {
  if (!current || UNIT_OPTIONS.some((option) => option.value === current)) return UNIT_OPTIONS
  return [...UNIT_OPTIONS, { value: current, label: current }]
}

/** "🥬 Produce". */
export function categoryLabel(category: Category): string {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other
  return `${meta.emoji} ${meta.label}`
}

/** The heading's subtitle: "12 items · 2 expiring soon". */
export function pantrySummary(total: number, expiring: number): string {
  if (total === 0) return "Everything your household has on hand."
  const items = `${total} ${total === 1 ? "item" : "items"}`
  return expiring > 0 ? `${items} · ${expiring} expiring soon` : items
}
