import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeading } from "@/components/page-heading"
import { requireHousehold } from "@/features/household/queries"
import { RecipeForm } from "@/features/recipes/components/recipe-form"
import { getLocalRecipe } from "@/features/recipes/local"
import type { OwnRecipeDraft } from "@/features/recipes/own-recipe"
import { parseRecipeRef } from "@/features/recipes/ref"

export const metadata: Metadata = { title: "Edit recipe" }

const OPTIONAL = /\(\s*optional\s*\)|\boptional\b|\bto serve\b|\bfor garnish\b|\bto garnish\b/i

export default async function EditRecipePage({ params }: PageProps<"/recipes/[id]/edit">) {
  const ref = parseRecipeRef((await params).id)
  if (ref?.kind !== "local") notFound()

  const { household } = await requireHousehold()
  const recipe = await getLocalRecipe(ref.id, household.id)
  // Only the household's own recipes can be edited (the shared library can't).
  if (!recipe || recipe.source !== "user" || recipe.householdId !== household.id) notFound()

  const initial: OwnRecipeDraft = {
    title: recipe.title,
    readyInMinutes: recipe.readyInMinutes ? String(recipe.readyInMinutes) : "",
    servings: recipe.servings ? String(recipe.servings) : "",
    mealTypes: recipe.mealTypes,
    ingredients: recipe.lines
      .map((line) => (line.optional && !OPTIONAL.test(line.original) ? `${line.original} (optional)` : line.original))
      .join("\n"),
    steps: recipe.steps.length > 0 ? recipe.steps : [""],
    photoPath: recipe.photoPath,
  }

  return (
    <>
      <Link
        href={`/recipes/${recipe.id}`}
        className="-my-2 inline-flex h-11 w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to the recipe
      </Link>
      <PageHeading title="Edit recipe" />
      <RecipeForm householdId={household.id} recipeId={recipe.id} initial={initial} initialPhotoUrl={recipe.photoPath ? recipe.image : null} />
    </>
  )
}
