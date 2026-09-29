// Pure: how list lines read.
import { formatQuantity } from "@/lib/units"

import type { ListItem } from "./types"

/** "2 lb", "3", "1½ cups"; "" for any amount. */
export function amountText(item: Pick<ListItem, "quantity" | "unit">): string {
  if (item.quantity === null) return ""
  return formatQuantity(item.quantity, item.unit ?? "count")
}

/** "Checked by you", "Checked by Sam", or "In the cart". */
export function checkedByLabel(
  checkedBy: string | null,
  members: readonly { userId: string; displayName: string }[],
  viewerId: string,
): string {
  if (!checkedBy) return "In the cart"
  if (checkedBy === viewerId) return "Checked by you"
  const member = members.find((m) => m.userId === checkedBy)
  return member ? `Checked by ${member.displayName}` : "In the cart"
}

/** A list line's unit for storage: null for none ("count"). */
export function listUnit(unit: string | null | undefined): string | null {
  const trimmed = unit?.trim()
  return !trimmed || trimmed === "count" ? null : trimmed
}
