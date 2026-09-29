// Pure: the Stats page's numbers, from the household's "cooked" and "shopped"
// activity rows. Days and weeks are in the viewer's time zone, so this runs in the
// browser (pass `timeZone` undefined) and in tests (pass one).
import type { Json } from "@/types/database"

import { cookedRecipe } from "./feed"
import { dayKey } from "./time"

export type StatsRow = {
  action: "cooked" | "shopped"
  batchId: number
  actorId: string | null
  itemName: string
  details: Json
  createdAt: string
}

/** Weeks in the chart. */
export const CHART_WEEKS = 12
export const TOP_RECIPES = 5
export const TOP_ITEMS = 8

export type WeekCount = { start: string; count: number }
export type TopRecipe = { id: number | null; title: string; count: number; lastAt: string }
export type TopItem = { name: string; count: number }
export type PersonStats = { actorId: string | null; cooks: number; trips: number; itemsBought: number }

export type HouseholdStats = {
  /** When the oldest row happened, or null with no history yet. */
  since: string | null
  cooks: { total: number; thisMonth: number; lastMonth: number; streak: number }
  trips: { total: number; thisMonth: number; itemsThisMonth: number }
  weeks: WeekCount[]
  topRecipes: TopRecipe[]
  mostBought: TopItem[]
  people: PersonStats[]
}

// ── Day arithmetic on "YYYY-MM-DD" keys ──────────────────────────────────────

function toUtc(key: string) {
  return Date.parse(`${key}T00:00:00Z`)
}

export function addDays(key: string, days: number): string {
  return new Date(toUtc(key) + days * 86_400_000).toISOString().slice(0, 10)
}

/** The Monday on or before `key`. */
export function weekStart(key: string): string {
  const dow = (new Date(toUtc(key)).getUTCDay() + 6) % 7
  return addDays(key, -dow)
}

function previousMonth(month: string) {
  const [year, m] = month.split("-").map(Number)
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`
}

// ── Grouping ────────────────────────────────────────────────────────────────

type Batch = { batchId: number; actorId: string | null; at: string; rows: StatsRow[] }

/** One entry per cook or trip (rows from one request share a batch). */
function batches(rows: readonly StatsRow[], action: StatsRow["action"]): Batch[] {
  const byBatch = new Map<string, Batch>()
  for (const row of rows) {
    if (row.action !== action) continue
    const key = `${row.batchId}:${row.actorId ?? "-"}`
    const batch = byBatch.get(key)
    if (!batch) byBatch.set(key, { batchId: row.batchId, actorId: row.actorId, at: row.createdAt, rows: [row] })
    else {
      batch.rows.push(row)
      if (Date.parse(row.createdAt) > Date.parse(batch.at)) batch.at = row.createdAt
    }
  }
  return [...byBatch.values()]
}

/** Days in a row with a cook, ending today (or yesterday, so the streak survives until tonight). */
export function cookingStreak(days: ReadonlySet<string>, today: string): number {
  let day = days.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (days.has(day)) {
    streak += 1
    day = addDays(day, -1)
  }
  return streak
}

function top<T extends { count: number }>(items: Iterable<T>, limit: number, tieBreak: (a: T, b: T) => number): T[] {
  return [...items].sort((a, b) => b.count - a.count || tieBreak(a, b)).slice(0, limit)
}

export function computeStats(rows: readonly StatsRow[], now: number, timeZone?: string): HouseholdStats {
  const today = dayKey(now, timeZone)
  const month = today.slice(0, 7)
  const lastMonth = previousMonth(month)
  const dayOf = (iso: string) => dayKey(Date.parse(iso), timeZone)

  const cooks = batches(rows, "cooked")
  const trips = batches(rows, "shopped")

  // Cooking
  const cookDays = new Set<string>()
  const recipes = new Map<string, TopRecipe>()
  let cooksThisMonth = 0
  let cooksLastMonth = 0
  for (const cook of cooks) {
    const day = dayOf(cook.at)
    cookDays.add(day)
    if (day.startsWith(month)) cooksThisMonth += 1
    else if (day.startsWith(lastMonth)) cooksLastMonth += 1

    const recipe = cookedRecipe({ action: "cooked", details: cook.rows[0].details })
    if (!recipe) continue
    const key = recipe.id !== null ? `id:${recipe.id}` : `title:${recipe.title.toLowerCase()}`
    const current = recipes.get(key)
    if (!current) recipes.set(key, { id: recipe.id, title: recipe.title, count: 1, lastAt: cook.at })
    else {
      current.count += 1
      if (Date.parse(cook.at) > Date.parse(current.lastAt)) {
        current.lastAt = cook.at
        current.title = recipe.title
      }
    }
  }

  // The chart: this week and the CHART_WEEKS - 1 before it.
  const thisWeek = weekStart(today)
  const weeks: WeekCount[] = Array.from({ length: CHART_WEEKS }, (_, i) => ({
    start: addDays(thisWeek, (i - (CHART_WEEKS - 1)) * 7),
    count: 0,
  }))
  const weekIndex = new Map(weeks.map((week, i) => [week.start, i]))
  for (const cook of cooks) {
    const i = weekIndex.get(weekStart(dayOf(cook.at)))
    if (i !== undefined) weeks[i].count += 1
  }

  // Shopping
  const items = new Map<string, TopItem & { lastAt: string }>()
  let tripsThisMonth = 0
  let itemsThisMonth = 0
  for (const trip of trips) {
    if (dayOf(trip.at).startsWith(month)) {
      tripsThisMonth += 1
      itemsThisMonth += trip.rows.length
    }
    for (const row of trip.rows) {
      const key = row.itemName.trim().toLowerCase()
      if (!key) continue
      const current = items.get(key)
      if (!current) items.set(key, { name: row.itemName.trim(), count: 1, lastAt: row.createdAt })
      else {
        current.count += 1
        if (Date.parse(row.createdAt) > Date.parse(current.lastAt)) {
          current.lastAt = row.createdAt
          current.name = row.itemName.trim()
        }
      }
    }
  }

  // People
  const people = new Map<string, PersonStats>()
  const person = (actorId: string | null) => {
    const key = actorId ?? "-"
    let stats = people.get(key)
    if (!stats) {
      stats = { actorId, cooks: 0, trips: 0, itemsBought: 0 }
      people.set(key, stats)
    }
    return stats
  }
  for (const cook of cooks) person(cook.actorId).cooks += 1
  for (const trip of trips) {
    const stats = person(trip.actorId)
    stats.trips += 1
    stats.itemsBought += trip.rows.length
  }

  const oldest = rows.reduce<string | null>(
    (min, row) => (min === null || Date.parse(row.createdAt) < Date.parse(min) ? row.createdAt : min),
    null,
  )

  return {
    since: oldest,
    cooks: { total: cooks.length, thisMonth: cooksThisMonth, lastMonth: cooksLastMonth, streak: cookingStreak(cookDays, today) },
    trips: { total: trips.length, thisMonth: tripsThisMonth, itemsThisMonth },
    weeks,
    topRecipes: top(recipes.values(), TOP_RECIPES, (a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)),
    mostBought: top(items.values(), TOP_ITEMS, (a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)).map(
      ({ name, count }) => ({ name, count }),
    ),
    people: [...people.values()].sort(
      (a, b) => b.cooks + b.trips - (a.cooks + a.trips) || b.itemsBought - a.itemsBought,
    ),
  }
}

/** "Sep 21" for a week's start. */
export function weekLabel(start: string): string {
  return new Date(toUtc(start)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}
