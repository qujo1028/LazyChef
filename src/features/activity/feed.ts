// Pure activity-feed logic (no React, no I/O): row shape, merging live rows,
// grouping a request's rows into one entry, and the sentence for each entry.
import { formatQuantity } from "@/lib/units"
import type { Enums, Json, Tables } from "@/types/database"

export type ActivityAction = Enums<"activity_action">

/** Most rows the feed loads and keeps. */
export const ACTIVITY_LIMIT = 100
/** Items shown under a grouped entry before "and N more". */
export const VISIBLE_ITEMS = 4

export type ActivityRow = {
  id: number
  actorId: string | null
  /** From the profiles join; null for live rows (look them up in the members list). */
  actor: { name: string; avatarUrl: string | null } | null
  action: ActivityAction
  itemName: string
  quantity: number | null
  unit: string | null
  batchId: number
  details: Json
  createdAt: string
}

export type ActivityMember = { userId: string; displayName: string; avatarUrl: string | null }

/** One line in the feed: consecutive rows from the same request (batch) and person. */
export type ActivityEntry = {
  key: string
  batchId: number
  actorId: string | null
  /** When the newest row happened. */
  createdAt: string
  /** Oldest first, i.e. in the order they were added. */
  rows: ActivityRow[]
}

/** A broadcast activity_log row (it has actor_id but no profile). */
export function rowFromRecord(record: Tables<"activity_log">): ActivityRow {
  return {
    id: Number(record.id),
    actorId: record.actor_id,
    actor: null,
    action: record.action,
    itemName: record.item_name,
    quantity: record.quantity === null ? null : Number(record.quantity),
    unit: record.unit,
    batchId: Number(record.batch_id),
    details: record.details,
    createdAt: record.created_at,
  }
}

function newestFirst(a: ActivityRow, b: ActivityRow) {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id
}

/** Combines loaded and live rows: no duplicates, newest first, at most `limit`. */
export function mergeActivityRows(
  loaded: ActivityRow[],
  live: ActivityRow[],
  limit = ACTIVITY_LIMIT,
): ActivityRow[] {
  const byId = new Map<number, ActivityRow>()
  for (const row of loaded) byId.set(row.id, row)
  for (const row of live) {
    const known = byId.get(row.id)
    // Keep the joined profile if the loaded copy has it.
    byId.set(row.id, known?.actor ? known : row)
  }
  return [...byId.values()].sort(newestFirst).slice(0, limit)
}

/** Groups newest-first rows: consecutive rows with the same batch and actor become one entry. */
export function groupActivity(rows: ActivityRow[]): ActivityEntry[] {
  const groups: ActivityRow[][] = []
  for (const row of rows) {
    const current = groups.at(-1)
    const head = current?.[0]
    if (current && head && head.batchId === row.batchId && head.actorId === row.actorId) current.push(row)
    else groups.push([row])
  }
  return groups.map((group) => {
    const ordered = [...group].sort((a, b) => a.id - b.id)
    const first = ordered[0]
    return {
      key: `${first.batchId}:${first.actorId ?? "-"}:${first.id}`,
      batchId: first.batchId,
      actorId: first.actorId,
      createdAt: group[0].createdAt,
      rows: ordered,
    }
  })
}

// ── Wording ────────────────────────────────────────────────────────────────

export type ResolvedActor = {
  /** What the sentence starts with: "You", "Alex", "Someone". */
  label: string
  /** Their actual name, for the avatar's initials. */
  name: string
  avatarUrl: string | null
  isViewer: boolean
}

/** "You" for the viewer; otherwise the joined profile, the members list, or a stand-in. */
export function resolveActor(
  row: Pick<ActivityRow, "actorId" | "actor">,
  viewerId: string,
  members: ReadonlyMap<string, ActivityMember>,
): ResolvedActor {
  const member = row.actorId ? members.get(row.actorId) : undefined
  const avatarUrl = row.actor?.avatarUrl ?? member?.avatarUrl ?? null
  const known = row.actor?.name ?? member?.displayName
  if (row.actorId && row.actorId === viewerId) return { label: "You", name: known ?? "You", avatarUrl, isViewer: true }
  const name = known ?? (row.actorId ? "A former housemate" : "Someone")
  return { label: name, name, avatarUrl, isViewer: false }
}

/** Where the amount matters (added/used/restocked): "2 lb chicken breast"; otherwise just the name. */
export function describeItem(row: Pick<ActivityRow, "action" | "itemName" | "quantity" | "unit">): string {
  const showAmount =
    row.action === "added" ||
    row.action === "used" ||
    row.action === "restocked" ||
    row.action === "cooked" ||
    row.action === "shopped"
  const amount = showAmount && row.quantity !== null ? formatQuantity(row.quantity, row.unit ?? "count") : ""
  return amount ? `${amount} ${row.itemName}` : row.itemName
}

/** Extra context for an update: "Renamed from “white rice”". */
export function describeUpdate(row: Pick<ActivityRow, "action" | "itemName" | "details">): string | null {
  if (row.action !== "updated") return null
  const details = row.details
  if (!details || typeof details !== "object" || Array.isArray(details)) return null
  const before = details.before
  if (!before || typeof before !== "object" || Array.isArray(before)) return null
  const oldName = before.name
  if (typeof oldName === "string" && oldName.trim().toLowerCase() !== row.itemName.trim().toLowerCase()) {
    return `Renamed from “${oldName}”`
  }
  return null
}

const ACTION_ORDER: ActivityAction[] = ["cooked", "shopped", "added", "restocked", "used", "updated", "removed"]

/**
 * The recipe a "cooked" row came from (cook_recipe puts it in `details`). `id` is its ref:
 * Spoonacular's id as a string, or our recipe's uuid (see src/features/recipes/ref.ts).
 */
export function cookedRecipe(row: Pick<ActivityRow, "action" | "details">): { id: string | null; title: string } | null {
  if (row.action !== "cooked") return null
  const details = row.details
  if (!details || typeof details !== "object" || Array.isArray(details)) return null
  const title = typeof details.recipe_title === "string" ? details.recipe_title.trim() : ""
  if (!title) return null
  const id =
    typeof details.recipe_id === "number"
      ? String(details.recipe_id)
      : typeof details.local_recipe_id === "string" && /^[0-9a-f-]{36}$/i.test(details.local_recipe_id)
        ? details.local_recipe_id
        : null
  return { id, title }
}

function itemsLabel(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`
}

export type EntrySummary = {
  /** Drives the icon and color. */
  action: ActivityAction
  /** "added", "used", … (or a combined phrase for mixed batches). */
  verb: string
  /** "2 lb chicken breast" or "12 items". */
  object: string
  /** A second line for single updates ("Renamed from …"). */
  detail: string | null
  /** Whether the entry lists its items underneath. */
  grouped: boolean
  /** Rows with a different action than the headline show their own verb. */
  mixed: boolean
}

/**
 * The sentence for an entry, minus the actor: one row → "used" + "2 eggs";
 * several → "added" + "12 items"; cooking → "cooked" + the recipe; a shopping trip → "bought" + "12 items".
 * Older trips (logged before 'shopped' existed) that top up some items (added + restocked) still read
 * "added 12 items"; other mixes read
 * "used 3 items and removed 1".
 */
export function summarizeEntry(entry: Pick<ActivityEntry, "rows">): EntrySummary {
  const { rows } = entry
  // "cooked Chicken Tikka Masala", with what it used listed underneath.
  const recipe = rows.every((row) => row.action === "cooked") ? cookedRecipe(rows[0]) : null
  if (recipe) {
    return { action: "cooked", verb: "cooked", object: recipe.title, detail: null, grouped: true, mixed: false }
  }
  if (rows.every((row) => row.action === "shopped")) {
    const grouped = rows.length > 1
    const object = grouped ? itemsLabel(rows.length) : describeItem(rows[0])
    return { action: "shopped", verb: "bought", object, detail: null, grouped, mixed: false }
  }
  if (rows.length === 1) {
    const [row] = rows
    return {
      action: row.action,
      verb: row.action,
      object: describeItem(row),
      detail: describeUpdate(row),
      grouped: false,
      mixed: false,
    }
  }

  const counts = new Map<ActivityAction, number>()
  for (const row of rows) counts.set(row.action, (counts.get(row.action) ?? 0) + 1)
  const actions = [...counts.keys()].sort(
    (a, b) => (ACTION_ORDER.indexOf(a) + 1 || 99) - (ACTION_ORDER.indexOf(b) + 1 || 99),
  )

  if (actions.length === 1 || actions.every((action) => action === "added" || action === "restocked")) {
    const action = actions.length === 1 ? actions[0] : "added"
    return { action, verb: action, object: itemsLabel(rows.length), detail: null, grouped: true, mixed: actions.length > 1 }
  }

  // "used 3 items, updated 1 and removed 1"
  const [first, ...rest] = actions
  const parts = [itemsLabel(counts.get(first) ?? 0), ...rest.map((action) => `${action} ${counts.get(action)}`)]
  const object = parts.length === 2 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
  return { action: first, verb: first, object, detail: null, grouped: true, mixed: true }
}

/** Items shown before "and N more": all of them when hiding would save only one. */
export function visibleItemCount(total: number, limit = VISIBLE_ITEMS): number {
  return total <= limit + 1 ? total : limit
}
