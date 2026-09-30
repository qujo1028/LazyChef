import type { Metadata } from "next"
import { ChefHat, CircleAlert, KeyRound, MoonStar, Plus, Sparkles } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { requireHousehold } from "@/features/household/queries"
import type { Usage } from "@/features/recipes/cache-core"
import { RecipeCard } from "@/features/recipes/components/recipe-card"
import { RecipesTabs } from "@/features/recipes/components/recipes-tabs"
import { RecipeFilterBar } from "@/features/recipes/components/recipe-filters"
import { SpoonacularCredit } from "@/features/recipes/components/spoonacular-credit"
import { filtersHref, hasFilters, NO_FILTERS, parseFilters, type RecipeFilters } from "@/features/recipes/filters"
import type { Suggestion } from "@/features/recipes/match"
import { getRecipeSuggestions, getSavedIds } from "@/features/recipes/queries"
import { DAILY_POINTS } from "@/lib/spoonacular/cost"

export const metadata: Metadata = { title: "Recipes" }

function Section({
  title,
  description,
  recipes,
  savedIds,
}: {
  title: string
  description: string
  recipes: Suggestion[]
  savedIds: ReadonlySet<number>
}) {
  if (recipes.length === 0) return null
  return (
    <section className="grid grid-cols-1 gap-2.5">
      <div>
        <h2 className="font-semibold">
          {title} <span className="font-normal text-muted-foreground">· {recipes.length}</span>
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ul className="grid grid-cols-1 gap-2.5">
        {recipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} saved={savedIds.has(recipe.id)} />
        ))}
      </ul>
    </section>
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

export default async function RecipesPage({ searchParams }: PageProps<"/recipes">) {
  const { household } = await requireHousehold()
  const filters = parseFilters(await searchParams)
  const [result, savedIds] = await Promise.all([getRecipeSuggestions(household.id, filters), getSavedIds(household.id)])

  const heading = (
    <>
      <PageHeading title="Recipes" description="What you can cook with what you have." />
      <RecipesTabs current="/recipes" />
    </>
  )

  if (result.status === "empty-pantry") {
    return (
      <>
        {heading}
        <EmptyState icon={ChefHat} title="Add some food first">
          <p>Recipe ideas come from what&apos;s in your pantry. Add a few things and check back.</p>
          <Button asChild size="lg" className="mt-4 h-12 w-full text-base">
            <Link href="/pantry/add">
              <Plus aria-hidden /> Add food
            </Link>
          </Button>
        </EmptyState>
      </>
    )
  }

  if (result.status === "no-key") {
    return (
      <>
        {heading}
        <EmptyState icon={KeyRound} title="Recipes are almost ready">
          Recipe ideas need a Spoonacular key, which hasn&apos;t been added yet. Your pantry and list work fine in the
          meantime.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      {heading}
      <RecipeFilterBar filters={filters} />
      {result.status === "resting" ? (
        <EmptyState icon={MoonStar} title="Recipe searches are resting until tomorrow">
          <p>
            We&apos;ve used today&apos;s free Spoonacular searches. New ones start again in {hoursUntil(result.resetsAt)}
            {" "}(midnight UTC). Recipes anyone opened in the last hour still open fine.
          </p>
          {hasFilters(filters) ? (
            <p className="mt-2">
              Searches without filters from the last hour may still be saved. <ClearFilters filters={filters} />
            </p>
          ) : null}
        </EmptyState>
      ) : result.status === "error" ? (
        <EmptyState icon={CircleAlert} title="Couldn't find recipes right now">
          {result.problem.message} Try again in a bit.
        </EmptyState>
      ) : result.makeNow.length + result.almostThere.length === 0 ? (
        <EmptyState icon={Sparkles} title="No matches yet">
          {hasFilters(filters) ? (
            <>
              Nothing fits those filters with what you have. <ClearFilters filters={filters} />
            </>
          ) : (
            "Add a few more things to your pantry and you'll start seeing ideas."
          )}
        </EmptyState>
      ) : (
        <>
          <Section title="Make now" description="You have everything for these." recipes={result.makeNow} savedIds={savedIds} />
          <Section
            title="Almost there"
            description="Just 1 to 3 things away."
            recipes={result.almostThere}
            savedIds={savedIds}
          />
        </>
      )}
      <SpoonacularCredit>
        {result.status === "ok" ? `Found ${minutesAgo(result.savedAt)} · refreshes hourly${pointsLeft(result.usage)}` : null}
      </SpoonacularCredit>
    </>
  )
}
