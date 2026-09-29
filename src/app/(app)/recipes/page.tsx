import type { Metadata } from "next"
import { ChefHat, CircleAlert, KeyRound, Plus, Sparkles } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { requireHousehold } from "@/features/household/queries"
import { RecipeCard } from "@/features/recipes/components/recipe-card"
import { RecipeFilterBar } from "@/features/recipes/components/recipe-filters"
import { filtersHref, hasFilters, NO_FILTERS, parseFilters } from "@/features/recipes/filters"
import type { Suggestion } from "@/features/recipes/match"
import { getRecipeSuggestions } from "@/features/recipes/queries"
import type { Usage } from "@/features/recipes/cache"

export const metadata: Metadata = { title: "Recipes" }

function Section({ title, description, recipes }: { title: string; description: string; recipes: Suggestion[] }) {
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
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </ul>
    </section>
  )
}

function minutesAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  return minutes < 1 ? "just now" : `${minutes} min ago`
}

function Footer({ savedAt, usage }: { savedAt: string; usage: Usage | null }) {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Found {minutesAgo(savedAt)} · refreshes hourly
      {usage?.left !== null && usage?.left !== undefined ? ` · ${Math.floor(usage.left)} of 50 Spoonacular points left today` : ""}
      <br />
      Recipes from{" "}
      <a href="https://spoonacular.com/food-api" className="underline underline-offset-2" target="_blank" rel="noreferrer">
        Spoonacular
      </a>
    </p>
  )
}

export default async function RecipesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { household } = await requireHousehold()
  const filters = parseFilters(await searchParams)
  const result = await getRecipeSuggestions(household.id, filters)

  const heading = <PageHeading title="Recipes" description="What you can cook with what you have." />

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
        <EmptyState icon={KeyRound} title="Recipes aren't set up yet">
          The app needs a Spoonacular API key (SPOONACULAR_API_KEY) to find recipes. Once it&apos;s added, ideas show
          up here.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      {heading}
      <RecipeFilterBar filters={filters} />
      {result.status === "error" ? (
        <EmptyState icon={CircleAlert} title="Couldn't find recipes right now">
          {result.problem.message}
          {result.problem.code === "quota"
            ? " Recipes you've already opened in the last hour still work."
            : " Try again in a bit."}
        </EmptyState>
      ) : result.makeNow.length + result.almostThere.length === 0 ? (
        <EmptyState icon={Sparkles} title="No matches yet">
          {hasFilters(filters) ? (
            <>
              Nothing fits those filters with what you have.{" "}
              <Link href={filtersHref(NO_FILTERS)} className="font-medium text-primary underline underline-offset-2">
                Clear filters
              </Link>
            </>
          ) : (
            "Add a few more things to your pantry and you'll start seeing ideas."
          )}
        </EmptyState>
      ) : (
        <>
          <Section title="Make now" description="You have everything for these." recipes={result.makeNow} />
          <Section title="Almost there" description="Just 1 to 3 things away." recipes={result.almostThere} />
        </>
      )}
      {result.status === "ok" ? <Footer savedAt={result.savedAt} usage={result.usage} /> : null}
    </>
  )
}
