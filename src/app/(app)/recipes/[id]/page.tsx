import type { Metadata } from "next"
import { ArrowLeft, CircleAlert, Clock, ExternalLink, KeyRound, MoonStar, Users } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { EmptyState } from "@/components/empty-state"
import { requireHousehold } from "@/features/household/queries"
import { normalizeIngredientName } from "@/lib/ingredients/catalog"
import { CookSheet } from "@/features/recipes/components/cook-sheet"
import { IngredientChecklist, type ChecklistLine } from "@/features/recipes/components/ingredient-checklist"
import { RecipeImage } from "@/features/recipes/components/recipe-image"
import { SpoonacularCredit } from "@/features/recipes/components/spoonacular-credit"
import { getRecipeDetail } from "@/features/recipes/queries"

export const metadata: Metadata = { title: "Recipe" }

function parseId(value: string) {
  return /^\d{1,9}$/.test(value) ? Number(value) : null
}

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
  const recipeId = parseId((await params).id)
  if (recipeId === null) notFound()

  const { household } = await requireHousehold()
  const result = await getRecipeDetail(household.id, recipeId)
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
  }))
  const have = lines.filter((line) => line.status !== "need").length

  return (
    <article className="grid grid-cols-1 gap-5">
      <BackLink />
      <RecipeImage src={recipe.image} eager className="aspect-[4/3] w-full rounded-2xl" />
      <header className="grid gap-2">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">{recipe.title}</h1>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
        </p>
      </header>

      <section className="grid gap-2.5">
        <h2 className="font-semibold">
          Ingredients{" "}
          <span className="font-normal text-muted-foreground">
            · you have {have} of {lines.length}
          </span>
        </h2>
        <IngredientChecklist recipeId={recipe.id} lines={lines} />
      </section>

      {/* ── Phase 5: "I cooked this" ─────────────────────────────────────────────
          Takes the recipe's amounts out of the pantry (cook-plan.ts, cook_recipe()).
          Keep it after the ingredients and before the steps. */}
      <section aria-label="I cooked this">
        <CookSheet recipeId={recipe.id} title={recipe.title} lines={cook} />
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
                <span className="pt-0.5">{step}</span>
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
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium hover:bg-muted"
        >
          Full recipe{recipe.sourceName ? ` on ${recipe.sourceName}` : ""} <ExternalLink className="size-4" aria-hidden />
        </a>
      ) : null}
      <SpoonacularCredit>{recipe.sourceName ? `Recipe by ${recipe.sourceName}` : null}</SpoonacularCredit>
    </article>
  )
}
