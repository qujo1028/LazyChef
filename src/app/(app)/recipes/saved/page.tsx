import type { Metadata } from "next"
import { Heart } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { requireHousehold } from "@/features/household/queries"
import { RecipesTabs } from "@/features/recipes/components/recipes-tabs"
import { SavedRecipeCard } from "@/features/recipes/components/saved-recipe-card"
import { getSavedRecipes } from "@/features/recipes/queries"
import { canMakeNow, parseSavedSort, SAVED_SORTS, sortSaved } from "@/features/recipes/saved"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Saved recipes" }

export default async function SavedRecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { household } = await requireHousehold()
  const sort = parseSavedSort((await searchParams).sort)
  const { recipes, unmatched, fetchedAt: serverNow } = await getSavedRecipes(household.id)
  const sorted = sortSaved(recipes, sort)
  const ready = recipes.filter(canMakeNow).length

  return (
    <>
      <PageHeading
        title="Recipes"
        description={
          recipes.length === 0
            ? "Your household's favorites."
            : `${recipes.length} saved${ready > 0 ? ` · ${ready} you can make now` : ""}`
        }
      />
      <RecipesTabs current="/recipes/saved" />

      {recipes.length === 0 ? (
        <EmptyState icon={Heart} title="Nothing saved yet">
          <p>Tap the heart on any recipe to keep it here. Everyone in your household sees the same list.</p>
          <Button asChild size="lg" className="mt-4 h-12 w-full text-base">
            <Link href="/recipes">Find recipes</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Sort saved recipes" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {SAVED_SORTS.map((option) => (
              <Link
                key={option.value}
                href={option.value === "ready" ? "/recipes/saved" : `/recipes/saved?sort=${option.value}`}
                scroll={false}
                aria-current={sort === option.value ? "true" : undefined}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  sort === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted active:bg-muted",
                )}
              >
                {option.label}
              </Link>
            ))}
          </nav>
          <ul className="grid grid-cols-1 gap-2.5">
            {sorted.map((recipe) => (
              <SavedRecipeCard key={recipe.id} recipe={recipe} serverNow={serverNow} />
            ))}
          </ul>
          {unmatched > 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              Couldn&apos;t check {unmatched === 1 ? "1 recipe" : `${unmatched} recipes`} against your pantry right now
              (Spoonacular&apos;s daily limit). Try again later.
            </p>
          ) : null}
        </>
      )}
    </>
  )
}
