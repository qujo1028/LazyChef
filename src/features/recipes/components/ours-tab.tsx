import { BookOpen, Plus } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"
import { requireHousehold } from "@/features/household/queries"
import { getOurRecipes, getSavedIds } from "@/features/recipes/queries"

import { RecipeCard } from "./recipe-card"
import { RecipeSheet } from "./recipe-sheet"
import { RecipeGrid } from "./recipe-tile"
import { RecipesTabs } from "./recipes-tabs"

/** Recipes, "Ours" view (?view=ours). `openNew` opens the add sheet on arrival (?new=1). */
export async function OursTab({ openNew }: { openNew: boolean }) {
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
      <RecipesTabs current="ours" />
      <RecipeSheet householdId={household.id} defaultOpen={openNew} variant="default" className="h-12 w-full text-base">
        <Plus aria-hidden /> Add your own recipe
      </RecipeSheet>
      {recipes.length === 0 ? (
        <EmptyState icon={BookOpen} title="No recipes of your own yet">
          Add the ones you make all the time. They show up in Make now and Almost there, and only your household can see
          them.
        </EmptyState>
      ) : (
        <RecipeGrid>
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} saved={savedIds.has(recipe.id)} />
          ))}
        </RecipeGrid>
      )}
    </>
  )
}
