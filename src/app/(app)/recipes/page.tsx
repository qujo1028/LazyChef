import type { Metadata } from "next"
import { ChefHat, CircleAlert, MoonStar, Plus, Search, Sparkles } from "lucide-react"
import { cookies } from "next/headers"
import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { requireHousehold } from "@/features/household/queries"
import { ALLERGIES, DIETS, hasRestrictions, labelOf, type FoodPreferences } from "@lazychef/core/preferences/options"
import { getMyPreferences } from "@/features/preferences/queries"
import { AiIdeaCard } from "@/features/recipes/ai-idea/ai-idea-card"
import { MealIdeas } from "@/features/recipes/ai-idea/meal-ideas-area"
import { ideaMealFor, THIN_MEAL_BELOW } from "@/features/recipes/ai-idea/meal-ideas"
import type { Usage } from "@/features/recipes/cache-core"
import { CookAgain } from "@/features/recipes/components/cook-again"
import { RatingPrompt } from "@/features/recipes/components/rating-prompt"
import { RecipeCard } from "@/features/recipes/components/recipe-card"
import { OursTab } from "@/features/recipes/components/ours-tab"
import { RecipeSheet } from "@/features/recipes/components/recipe-sheet"
import { parseRecipeView, RecipesTabs } from "@/features/recipes/components/recipes-tabs"
import { SavedTab } from "@/features/recipes/components/saved-tab"
import { ActiveFilters, RecipeFilterButton } from "@/features/recipes/components/recipe-filters"
import { RecipeSearch } from "@/features/recipes/components/recipe-search"
import { MealStrip } from "@/features/recipes/components/meal-strip"
import { TimezoneSync } from "@/features/recipes/components/timezone-sync"
import { RecipeGrid } from "@/features/recipes/components/recipe-tile"
import { ShowMoreGrid } from "@/features/recipes/components/show-more-grid"
import { SpoonacularCredit } from "@/features/recipes/components/spoonacular-credit"
import { TheMealDbCredit } from "@/features/recipes/components/themealdb-credit"
import {
  autoLabel,
  filtersHref,
  hasFilters,
  hourInZone,
  isAuto,
  NO_FILTERS,
  parseFilters,
  parseMore,
  resolveMeals,
  TIMEZONE_COOKIE,
  type RecipeFilters,
} from "@lazychef/core/recipes/filters"
import type { Suggestion } from "@lazychef/core/recipes/match"
import { getRecipeIdeas, getSavedIds, type SpoonacularPart } from "@/features/recipes/queries"
import { getCookAgain, getMyUnratedCooks } from "@/features/recipes/ratings"
import { isAiAvailable } from "@/lib/llm/ai"
import { firstParam } from "@/lib/search-params"
import { DAILY_POINTS } from "@/lib/spoonacular/cost"

export const metadata: Metadata = { title: "Recipes" }

/** How many "Almost there" ideas show before "Show all". */
const ALMOST_THERE_PREVIEW = 6

function cards(recipes: Suggestion[], savedIds: ReadonlySet<string>) {
  return recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} saved={savedIds.has(recipe.id)} />)
}

function SectionHeading({ title, count, hint }: { title: string; count: number; hint?: string }) {
  return (
    <div className="grid gap-0.5">
      <h2 className="font-heading text-xl font-semibold">
        {title} <span className="font-sans text-sm font-normal text-muted-foreground tabular-nums">· {count}</span>
      </h2>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SearchRow({ filters, prefs, autoMeal }: { filters: RecipeFilters; prefs: FoodPreferences; autoMeal: string | null }) {
  return (
    <>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <RecipeSearch filters={filters} />
        </div>
        <RecipeFilterButton filters={filters} autoMeal={autoMeal} />
      </div>
      <MealStrip filters={filters} autoMeal={autoMeal} />
      <ActiveFilters filters={filters} />
      <DietNote filters={filters} prefs={prefs} />
    </>
  )
}

/** "Fits your diet: Vegetarian, no Peanut · Show all", or the way back when showing all. */
function DietNote({ filters, prefs }: { filters: RecipeFilters; prefs: FoodPreferences }) {
  if (!hasRestrictions(prefs)) return null
  const parts = [
    prefs.diet !== "none" ? labelOf(DIETS, prefs.diet) : null,
    prefs.allergies.length ? `no ${prefs.allergies.map((a) => labelOf(ALLERGIES, a).toLowerCase()).join(", ")}` : null,
  ].filter(Boolean)
  return (
    <p className="-mt-2 text-sm text-muted-foreground">
      {filters.all ? "Showing all recipes. " : `Fits your preferences: ${parts.join(", ")}. `}
      <Link
        href={filtersHref({ ...filters, all: !filters.all })}
        scroll={false}
        className="font-medium text-primary underline underline-offset-2"
      >
        {filters.all ? "Use my preferences" : "Show all"}
      </Link>
    </p>
  )
}

function minutesAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  return minutes < 1 ? "just now" : `${minutes} min ago`
}

function hoursUntil(iso: string) {
  const hours = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000))
  return hours === 1 ? "about an hour" : `about ${hours} hours`
}

function pointsLeft(usage: Usage | null) {
  return usage?.left !== null && usage?.left !== undefined ? ` · ${Math.floor(usage.left)} of ${DAILY_POINTS} Spoonacular points left today` : ""
}

function ClearFilters({ filters }: { filters: RecipeFilters }) {
  if (!hasFilters(filters)) return null
  return (
    <Link href={filtersHref(NO_FILTERS)} className="font-medium text-primary underline underline-offset-2">
      Clear filters
    </Link>
  )
}

/**
 * What Spoonacular added, or why it didn't: a line under the results. With nothing local
 * to show, the page shows a full empty state instead (see SpoonacularEmpty).
 */
function SpoonacularNote({ part, filters }: { part: SpoonacularPart; filters: RecipeFilters }) {
  if (part.status === "skipped") {
    return (
      <Button asChild variant="outline" size="lg" className="h-12 w-full text-base">
        <Link href={filtersHref(filters, { more: true })} scroll={false}>
          <Sparkles aria-hidden /> Show more ideas
        </Link>
      </Button>
    )
  }
  if (part.status === "ok") return null
  const text =
    part.status === "resting"
      ? `More ideas from Spoonacular are resting until tomorrow (in ${hoursUntil(part.resetsAt)}).`
      : part.status === "no-key"
        ? "More ideas need a Spoonacular key, which hasn't been added yet."
        : `Couldn't get more ideas from Spoonacular right now. ${part.problem.message}`
  return <p className="text-center text-xs text-muted-foreground">{text}</p>
}

function SpoonacularEmpty({ part, filters, autoMeal }: { part: SpoonacularPart; filters: RecipeFilters; autoMeal: string | null }) {
  if (part.status === "resting") {
    return (
      <EmptyState icon={MoonStar} title="Recipe searches are resting until tomorrow">
        <p>
          None of our own recipes fit, and we&apos;ve used today&apos;s free Spoonacular searches. New ones start again in{" "}
          {hoursUntil(part.resetsAt)} (midnight UTC).
        </p>
        {hasFilters(filters) ? (
          <p className="mt-2">
            <ClearFilters filters={filters} />
          </p>
        ) : null}
        <WorldHint filters={filters} />
      </EmptyState>
    )
  }
  if (part.status === "error") {
    return (
      <EmptyState icon={CircleAlert} title="Couldn't find recipes right now">
        {part.problem.message} Try again in a bit.
      </EmptyState>
    )
  }
  return (
    <EmptyState icon={filters.query ? Search : Sparkles} title={filters.query ? `Nothing called “${filters.query}”` : "No matches yet"}>
      {isAuto(filters) && autoMeal && !filters.query ? (
        <>
          Nothing fits {autoMeal.toLowerCase()} right now with what you have.{" "}
          <Link href={filtersHref({ ...filters, type: null, anyMeal: true })} scroll={false} className="font-medium text-primary underline underline-offset-2">
            Show any meal
          </Link>
        </>
      ) : hasFilters(filters) ? (
        <>
          Nothing fits with what you have. <ClearFilters filters={filters} />
        </>
      ) : (
        "Add a few more things to your pantry and you'll start seeing ideas."
      )}
      <WorldHint filters={filters} />
    </EmptyState>
  )
}

/** With world recipes off, an empty result might just be hiding them: offer the switch. */
function WorldHint({ filters }: { filters: RecipeFilters }) {
  if (filters.world) return null
  return (
    <p className="mt-2">
      <Link href={filtersHref({ ...filters, world: true })} className="font-medium text-primary underline underline-offset-2">
        Include world recipes
      </Link>
    </p>
  )
}

function Credits({ recipes, part }: { recipes: Suggestion[]; part: SpoonacularPart }) {
  const mealDb = recipes.some((recipe) => recipe.source === "themealdb")
  const spoonacular = part.status === "ok" && recipes.some((recipe) => recipe.source === "spoonacular")
  return (
    <div className="grid gap-1">
      {mealDb ? <TheMealDbCredit /> : null}
      {spoonacular && part.status === "ok" ? (
        <SpoonacularCredit>{`Found ${minutesAgo(part.savedAt)} · refreshes hourly${pointsLeft(part.usage)}`}</SpoonacularCredit>
      ) : null}
    </div>
  )
}

/** Recipes, "Ideas" view: what you can cook now, search, filters, AI ideas. */
async function IdeasTab({ params }: { params: Awaited<PageProps<"/recipes">["searchParams"]> }) {
  const [{ household }, prefs] = await Promise.all([requireHousehold(), getMyPreferences()])
  const filters = parseFilters(params, { worldDefault: prefs.worldRecipes })
  const more = parseMore(params)
  const recipePrefs = { diet: !filters.all && hasRestrictions(prefs) ? prefs : null, cuisines: prefs.cuisines }
  // The server only knows UTC: TimezoneSync saves the phone's zone in a cookie. Without it
  // (first visit) Auto acts as Any meal for this render.
  const zone = (await cookies()).get(TIMEZONE_COOKIE)?.value
  const hour = hourInZone(new Date(), zone)
  const autoMeal = autoLabel(hour)
  const meals = resolveMeals(filters, hour)
  const [result, savedIds, unratedCooks, cookAgain] = await Promise.all([
    getRecipeIdeas(household.id, filters, more, recipePrefs, meals),
    getSavedIds(household.id),
    getMyUnratedCooks(household.id, zone ? decodeURIComponent(zone) : undefined),
    getCookAgain(household.id),
  ])

  const heading = (
    <>
      <TimezoneSync current={zone ? decodeURIComponent(zone) : null} />
      <PageHeading title="Recipes" description="What you can cook with what you have." />
      <RecipesTabs current="ideas" />
      <RatingPrompt cooks={unratedCooks} />
    </>
  )

  if (result.status === "empty-pantry") {
    return (
      <>
        {heading}
        <SearchRow filters={filters} prefs={prefs} autoMeal={autoMeal} />
        <EmptyState icon={ChefHat} title="Add some food first">
          <p>Recipe ideas come from what&apos;s in your pantry. Add a few things and check back, or search for a recipe above.</p>
          <Button asChild size="lg" className="mt-4 h-12 w-full text-base">
            <Link href="/pantry?add=bulk">
              <Plus aria-hidden /> Add food
            </Link>
          </Button>
        </EmptyState>
      </>
    )
  }

  const shown = result.mode === "search" ? result.results : [...result.makeNow, ...result.almostThere]

  return (
    <>
      {heading}
      <SearchRow filters={filters} prefs={prefs} autoMeal={autoMeal} />
      {result.mode === "ideas" ? <CookAgain cards={cookAgain} /> : null}
      {shown.length === 0 ? (
        <SpoonacularEmpty part={result.spoonacular} filters={filters} autoMeal={autoMeal} />
      ) : result.mode === "search" ? (
        <section className="grid gap-3" aria-label="Search results">
          <SectionHeading title="Results" count={result.results.length} />
          <RecipeGrid>{cards(result.results, savedIds)}</RecipeGrid>
        </section>
      ) : (
        <>
          <section className="grid gap-3" aria-label="Make now">
            <SectionHeading
              title="Make now"
              count={result.makeNow.length}
              hint={result.makeNow.length === 0 ? "Nothing you can make with just what's here yet." : "You have everything for these."}
            />
            {result.makeNow.length > 0 ? <RecipeGrid>{cards(result.makeNow, savedIds)}</RecipeGrid> : null}
          </section>
          {result.almostThere.length > 0 ? (
            <section className="grid gap-3" aria-label="Almost there">
              <SectionHeading title="Almost there" count={result.almostThere.length} hint="One to three things away." />
              <ShowMoreGrid items={cards(result.almostThere, savedIds)} initial={ALMOST_THERE_PREVIEW} />
            </section>
          ) : null}
        </>
      )}
      {result.mode === "ideas" && isAiAvailable() && shown.length < THIN_MEAL_BELOW ? <MealIdeas meal={ideaMealFor(meals)} /> : null}
      {result.mode === "ideas" && isAiAvailable() ? <AiIdeaCard /> : null}
      {shown.length > 0 ? <SpoonacularNote part={result.spoonacular} filters={filters} /> : null}
      <RecipeSheet householdId={household.id} variant="ghost" className="h-12 w-full text-base">
        <Plus aria-hidden /> Add your own recipe
      </RecipeSheet>
      <Credits recipes={shown} part={result.spoonacular} />
    </>
  )
}

/** One screen, three views: Ideas | Saved | Ours (?view=). Each loads only its own data. */
export default async function RecipesPage({ searchParams }: PageProps<"/recipes">) {
  const params = await searchParams
  const view = parseRecipeView(params.view)
  if (view === "saved") return <SavedTab sortParam={params.sort} />
  if (view === "ours") return <OursTab openNew={firstParam(params.new) === "1"} />
  return <IdeasTab params={params} />
}
