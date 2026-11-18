import "server-only"

import { cookies } from "next/headers"

import { localFits, spoonacularFits } from "@lazychef/core/recipes/prefs"
import { getCacheStore } from "@/features/recipes/cache"
import { suggestionsCacheKey } from "@/features/recipes/cache-core"
import { findLocalCandidates } from "@/features/recipes/local"
import { rankLocal } from "@lazychef/core/recipes/local-match"
import { buildPantryIndex, pantrySearchNames, sortSuggestions, type Suggestion } from "@lazychef/core/recipes/match"
import { localDateKey } from "@lazychef/core/dates/days"
import type { PantryItem } from "@lazychef/core/pantry/types"
import { spoonacularDiet } from "@lazychef/core/preferences/diet"
import { getMyPreferences } from "@/features/preferences/queries"
import { hasRestrictions } from "@lazychef/core/preferences/options"
import { NO_FILTERS, TIMEZONE_COOKIE } from "@lazychef/core/recipes/filters"
import type { RecipeSummary } from "@/lib/spoonacular"
import { createClient } from "@/lib/supabase/server"

import { COOK_ROW_LIMIT } from "@lazychef/core/habit/constants"
import { toCookEvents, type CookEvent } from "@lazychef/core/habit/cook-events"
import { FALLBACK_TIME_ZONE, validTimeZone } from "@lazychef/core/habit/timezone"

/** The viewer's time zone from the cookie TimezoneSync set (decoded, validated), or null before the first visit. */
export async function getViewerTimeZone(): Promise<string | null> {
  const raw = (await cookies()).get(TIMEZONE_COOKIE)?.value
  if (!raw) return null
  try {
    return validTimeZone(decodeURIComponent(raw))
  } catch {
    return null
  }
}

/** One person's cooks in a household, one event per batch (newest rows first, capped). */
export async function getViewerCookEvents(householdId: string, viewerId: string): Promise<CookEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("activity_log")
    .select("batch_id, details, created_at")
    .eq("household_id", householdId)
    .eq("actor_id", viewerId)
    .eq("action", "cooked")
    .order("created_at", { ascending: false })
    .limit(COOK_ROW_LIMIT)
  if (error) throw error
  return toCookEvents(data.map((row) => ({ batchId: Number(row.batch_id), createdAt: row.created_at, details: row.details })))
}

/** Whether anyone in the household has ever cooked. */
async function householdHasCooked(householdId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("activity_log")
    .select("id")
    .eq("household_id", householdId)
    .eq("action", "cooked")
    .limit(1)
  if (error) throw error
  return data.length > 0
}

export type CardRecipe = { id: string; title: string }

export type CardRecipes = {
  /** The best "Make now" recipe. */
  makeNow: CardRecipe | null
  /** A recipe exactly one ingredient short, and what it lacks. */
  almost: { id: string; title: string; missing: string } | null
}

/**
 * Ideas for the card's nudges WITHOUT spending anything: our own recipe library (a database
 * call) and Spoonacular's results only if they are already in the shared hourly cache (the
 * unfiltered "any meal" search). No Spoonacular or AI request is ever made from here.
 */
async function getCardRecipes(householdId: string, items: readonly PantryItem[]): Promise<CardRecipes> {
  const today = localDateKey()
  const names = pantrySearchNames(items, today)
  if (names.length === 0) return { makeNow: null, almost: null }
  const prefs = await getMyPreferences()
  const diet = hasRestrictions(prefs) ? prefs : null
  const index = buildPantryIndex(items, today)

  const [local, cached] = await Promise.all([
    findLocalCandidates(householdId, items, NO_FILTERS)
      .then((candidates) => candidates.filter((recipe) => localFits(recipe, diet)))
      .catch(() => []),
    (async () => {
      try {
        const spoon = diet ? spoonacularDiet(diet) : null
        const key = suggestionsCacheKey(names, { type: null, maxTime: null, query: null }, spoon)
        const hit = await getCacheStore().get(key)
        return Array.isArray(hit?.value) ? (hit.value as RecipeSummary[]).filter((recipe) => spoonacularFits(recipe, diet)) : []
      } catch {
        return []
      }
    })(),
  ])

  const ranked = rankLocal(index, local)
  const extra = cached.length > 0 ? sortSuggestions(index, cached) : { makeNow: [], almostThere: [] }
  const makeNow: Suggestion | undefined = ranked.makeNow[0] ?? extra.makeNow[0]
  const almost = [...ranked.almostThere, ...extra.almostThere].find((s) => s.need.length === 1)
  return {
    makeNow: makeNow ? { id: makeNow.id, title: makeNow.title } : null,
    almost: almost ? { id: almost.id, title: almost.title, missing: almost.need[0] } : null,
  }
}

export type WeekCardData = {
  events: CookEvent[]
  /** The zone cookie, or null until the browser has set it (the card then uses UTC and TimezoneSync fills it in). */
  zone: string | null
  timeZone: string
  /** Server time (ms), so the first render's day matches between server and browser. */
  serverNow: number
  householdCooked: boolean
  recipes: CardRecipes
}

/** Everything the Pantry "This week" card needs. Each part degrades to empty rather than failing the page. */
export async function getWeekCardData(
  householdId: string,
  viewerId: string,
  items: readonly PantryItem[],
): Promise<WeekCardData> {
  const serverNow = Date.now()
  const [zone, events, householdCooked, recipes] = await Promise.all([
    getViewerTimeZone(),
    getViewerCookEvents(householdId, viewerId).catch((error) => {
      console.error("Loading cooks for the week card failed:", error instanceof Error ? error.message : error)
      return [] as CookEvent[]
    }),
    householdHasCooked(householdId).catch(() => true),
    getCardRecipes(householdId, items).catch(() => ({ makeNow: null, almost: null }) as CardRecipes),
  ])
  return { events, zone, timeZone: zone ?? FALLBACK_TIME_ZONE, serverNow, householdCooked, recipes }
}
