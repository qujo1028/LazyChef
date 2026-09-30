import type { Metadata } from "next"
import { BookOpen, Plus } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { requireHousehold } from "@/features/household/queries"
import { RecipeCard } from "@/features/recipes/components/recipe-card"
import { RecipesTabs } from "@/features/recipes/components/recipes-tabs"
import { getOurRecipes, getSavedIds } from "@/features/recipes/queries"

export const metadata: Metadata = { title: "Our recipes" }

export default async function OurRecipesPage() {
  const { household } = await requireHousehold()
  const [{ recipes }, savedIds] = await Promise.all([getOurRecipes(household.id), getSavedIds(household.id)])
  const ready = recipes.filter((recipe) => recipe.need.length === 0).length

  return (
    <>
      <PageHeading
        title="Recipes"
        description={
          recipes.length === 0
            ? "Your household's own recipes."
            : `${recipes.length} of your own${ready > 0 ? ` · ${ready} you can make now` : ""}`
        }
      />
      <RecipesTabs current="/recipes/ours" />
      <Button asChild size="lg" className="h-12 w-full text-base">
        <Link href="/recipes/new">
          <Plus aria-hidden /> Add your own recipe
        </Link>
      </Button>
      {recipes.length === 0 ? (
        <EmptyState icon={BookOpen} title="No recipes of your own yet">
          Add the ones you make all the time. They show up in Make now and Almost there, and only your household can see
          them.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} saved={savedIds.has(recipe.id)} />
          ))}
        </ul>
      )}
    </>
  )
}
