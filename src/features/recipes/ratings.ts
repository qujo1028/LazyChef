import "server-only"

import { requireViewer } from "@/features/household/queries"
import { createClient } from "@/lib/supabase/server"

import { getCacheStore } from "./cache"
import { recipeCacheKey } from "./cache-core"
import { getLocalCards } from "./local"
import { cookAgainRefs, unratedCooks, type Rating, type UnratedCook } from "@lazychef/core/recipes/ratings-core"
import { cookedRecipe } from "@lazychef/core/activity/feed"
import type { RecipeSource } from "@lazychef/core/recipes/ref"

/** The viewer's vote on one recipe, if any. */
export async function getMyRating(householdId: string, ref: string): Promise<Rating | null> {
  const viewer = await requireViewer()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("recipe_ratings")
    .select("rating")
    .eq("household_id", householdId)
    .eq("user_id", viewer.id)
    .eq("recipe_ref", ref)
    .maybeSingle()
  if (error) throw error
  return data?.rating === 1 || data?.rating === -1 ? data.rating : null
}

/** Everyone's votes in the household. */
export async function getHouseholdRatings(householdId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("recipe_ratings")
    .select("user_id, recipe_ref, rating, updated_at")
    .eq("household_id", householdId)
  if (error) throw error
  return data
}

/** Whether the viewer has ever cooked this recipe (only then can they rate it). */
export async function hasCooked(householdId: string, ref: string): Promise<boolean> {
  const viewer = await requireViewer()
  const supabase = await createClient()
  const key = /^\d+$/.test(ref) ? "recipe_id" : "local_recipe_id"
  const { data, error } = await supabase
    .from("activity_log")
    .select("id")
    .eq("household_id", householdId)
    .eq("actor_id", viewer.id)
    .eq("action", "cooked")
    .filter(`details->>${key}`, "eq", ref)
    .limit(1)
  if (error) throw error
  return data.length > 0
}

/** The viewer's own cooks they haven't rated yet (see unratedCooks), newest first. */
export async function getMyUnratedCooks(householdId: string, timeZone: string | undefined): Promise<UnratedCook[]> {
  const viewer = await requireViewer()
  const supabase = await createClient()
  const [cooked, rated] = await Promise.all([
    supabase
      .from("activity_log")
      .select("batch_id, details, created_at")
      .eq("household_id", householdId)
      .eq("actor_id", viewer.id)
      .eq("action", "cooked")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("recipe_ratings").select("recipe_ref").eq("household_id", householdId).eq("user_id", viewer.id),
  ])
  if (cooked.error) throw cooked.error
  if (rated.error) throw rated.error
  return unratedCooks(
    cooked.data,
    new Set(rated.data.map((row) => row.recipe_ref)),
    Date.now(),
    timeZone,
  ).slice(0, 5)
}

export type CookAgainCard = {
  id: string
  source: RecipeSource
  title: string
  image: string | null
  readyInMinutes: number | null
}

/**
 * The household's thumbs-up recipes as cards. Ours come from the database; Spoonacular's
 * titles from the activity log and photos from the hourly cache. Never calls Spoonacular.
 */
export async function getCookAgain(householdId: string): Promise<CookAgainCard[]> {
  const refs = cookAgainRefs(await getHouseholdRatings(householdId))
  if (refs.length === 0) return []
  const spoonIds = refs.filter((ref) => /^\d+$/.test(ref)).map(Number)
  const localIds = refs.filter((ref) => !/^\d+$/.test(ref))
  const supabase = await createClient()

  const [locals, cached, cooked, saved] = await Promise.all([
    getLocalCards(localIds, householdId),
    spoonIds.length > 0
      ? getCacheStore().getMany(spoonIds.map(recipeCacheKey))
      : Promise.resolve(new Map<string, unknown>()),
    spoonIds.length > 0
      ? supabase
          .from("activity_log")
          .select("details")
          .eq("household_id", householdId)
          .eq("action", "cooked")
          .not("details->recipe_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    spoonIds.length > 0
      ? supabase.from("saved_recipes").select("recipe_id, title, image_url").eq("household_id", householdId).in("recipe_id", spoonIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (cooked.error) throw cooked.error
  if (saved.error) throw saved.error

  const titles = new Map<string, string>()
  for (const row of cooked.data) {
    const recipe = cookedRecipe({ action: "cooked", details: row.details })
    if (recipe?.id && !titles.has(recipe.id)) titles.set(recipe.id, recipe.title)
  }
  const savedBy = new Map(saved.data.map((row) => [String(row.recipe_id), row]))
  const localById = new Map(locals.map((card) => [card.id, card]))

  return refs.flatMap((ref): CookAgainCard[] => {
    const local = localById.get(ref)
    if (local) {
      return [{ id: ref, source: local.source, title: local.title, image: local.image, readyInMinutes: local.readyInMinutes }]
    }
    if (!/^\d+$/.test(ref)) return []
    const detail = cached.get(recipeCacheKey(Number(ref))) as { image?: string | null; readyInMinutes?: number | null } | undefined
    const bookmark = savedBy.get(ref)
    const title = bookmark?.title ?? titles.get(ref)
    if (!title) return []
    return [
      {
        id: ref,
        source: "spoonacular",
        title,
        image: bookmark?.image_url ?? detail?.image ?? `https://img.spoonacular.com/recipes/${ref}-312x231.jpg`,
        readyInMinutes: detail?.readyInMinutes ?? null,
      },
    ]
  })
}
