import type { Metadata } from "next"
import { ArrowLeft, CircleAlert, Clock, ExternalLink, KeyRound, MoonStar, Pencil, Users } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { requireHousehold } from "@/features/household/queries"
import { normalizeIngredientName } from "@/lib/ingredients/catalog"
import { CookSheet } from "@/features/recipes/components/cook-sheet"
import { IngredientChecklist, type ChecklistLine } from "@/features/recipes/components/ingredient-checklist"
import { RecipeImage } from "@/features/recipes/components/recipe-image"
import { SaveButton } from "@/features/recipes/components/save-button"
import { SourceTag } from "@/features/recipes/components/source-tag"
import { SpoonacularCredit } from "@/features/recipes/components/spoonacular-credit"
import { TheMealDbCredit } from "@/features/recipes/components/themealdb-credit"
import { getRecipeDetail, getSavedIds } from "@/features/recipes/queries"
import { parseRecipeRef } from "@/features/recipes/ref"

export const metadata: Metadata = { title: "Recipe" }

function BackLink() {
  return (
    <Link
      href="/recipes"
      className="-my-2 inline-flex h-11 w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Recipes
    </Link>
  )
}

export default async function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  const ref = parseRecipeRef((await params).id)
  if (ref === null) notFound()

  const { household } = await requireHousehold()
  const [result, savedIds] = await Promise.all([getRecipeDetail(household.id, ref), getSavedIds(household.id)])
  if (result.status === "not-found") notFound()

  if (result.status === "resting") {
    return (
      <>
        <BackLink />
        <EmptyState icon={MoonStar} title="Recipe searches are resting until tomorrow">
          We&apos;ve used today&apos;s free Spoonacular lookups, and nobody opened this recipe in the last hour. It&apos;ll
          open again after midnight UTC.
        </EmptyState>
      </>
    )
  }

  if (result.status === "no-key" || result.status === "error") {
    return (
      <>
        <BackLink />
        <EmptyState
          icon={result.status === "no-key" ? KeyRound : CircleAlert}
          title={result.status === "no-key" ? "Recipes aren't set up yet" : "Couldn't load this recipe"}
        >
          {result.status === "no-key"
            ? "Recipes need a Spoonacular key, which hasn't been added yet."
            : `${result.problem.message} Try again in a bit.`}
        </EmptyState>
      </>
    )
  }

  const { recipe, ingredients, onList, cook } = result
  const listKeys = new Set(onList.keys)
  const listIds = new Set(onList.ids)
  const lines: ChecklistLine[] = ingredients.map((ingredient, index) => ({
    index,
    original: ingredient.original,
    name: ingredient.name,
    status: ingredient.status,
    pantryName: ingredient.pantryName,
    onList: (ingredient.id !== null && listIds.has(ingredient.id)) || listKeys.has(normalizeIngredientName(ingredient.name)),
    optional: recipe.optional[index] ?? false,
  }))
  const have = lines.filter((line) => line.status !== "need").length
  const saved = savedIds.has(recipe.ref)
  const image = recipe.source === "spoonacular" ? recipe.image : null
  const editable = recipe.source === "user" && recipe.householdId === household.id

  return (
    <article className="grid grid-cols-1 gap-5">
      <BackLink />
      <RecipeImage src={recipe.image} eager className="aspect-[4/3] w-full rounded-2xl" />
      <header className="grid gap-2">
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-2xl leading-tight font-semibold tracking-tight break-words">{recipe.title}</h1>
          <SaveButton
            recipeId={recipe.ref}
            title={recipe.title}
            image={image}
            saved={saved}
            variant="outline"
            className="-mt-0.5 shrink-0"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          <SourceTag source={recipe.source} />
          {recipe.readyInMinutes ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden /> {recipe.readyInMinutes} min
            </span>
          ) : null}
          {recipe.servings ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" aria-hidden /> Serves {recipe.servings}
            </span>
          ) : null}
          {recipe.cuisine ? <span>{recipe.cuisine}</span> : null}
        </div>
        {editable ? (
          <Button asChild variant="outline" size="lg" className="mt-1 h-11 w-full">
            <Link href={`/recipes/${recipe.ref}/edit`}>
              <Pencil aria-hidden /> Edit recipe
            </Link>
          </Button>
        ) : null}
      </header>

      <section className="grid gap-2.5">
        <h2 className="font-semibold">
          Ingredients{" "}
          <span className="font-normal text-muted-foreground">
            · you have {have} of {lines.length}
          </span>
        </h2>
        <IngredientChecklist recipeId={recipe.ref} lines={lines} />
        <CookSheet recipeId={recipe.ref} title={recipe.title} image={image} lines={cook} saved={saved} />
      </section>

      {recipe.steps.length > 0 ? (
        <section className="grid gap-2.5">
          <h2 className="font-semibold">Steps</h2>
          <ol className="grid gap-3">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="min-w-0 pt-0.5 break-words">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {recipe.sourceUrl ? (
        <a
          href={recipe.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-center text-sm font-medium hover:bg-muted"
        >
          {recipe.source === "user" ? "Original recipe" : "Full recipe"}
          {recipe.sourceName ? ` on ${recipe.sourceName}` : ""} <ExternalLink className="size-4 shrink-0" aria-hidden />
        </a>
      ) : null}
      {recipe.source === "spoonacular" ? (
        <SpoonacularCredit>{recipe.sourceName ? `Recipe by ${recipe.sourceName}` : null}</SpoonacularCredit>
      ) : recipe.source === "themealdb" ? (
        <TheMealDbCredit href={recipe.creditUrl ?? undefined} />
      ) : null}
    </article>
  )
}
