import { CircleCheck, Clock } from "lucide-react"
import Link from "next/link"

import { displayName } from "@/features/pantry/display"

import { canMakeNow, type SavedRecipe } from "../saved"
import { CookedLabel } from "./cooked-label"
import { recipeHref } from "../ref"
import { RecipeImage } from "./recipe-image"
import { SaveButton } from "./save-button"
import { SourceTag } from "./source-tag"

function MatchLine({ recipe }: { recipe: SavedRecipe }) {
  const { match } = recipe
  if (match === null) return <p className="text-sm text-muted-foreground">Open it to check your pantry</p>
  if (canMakeNow(recipe)) {
    return (
      <p className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <CircleCheck className="size-4 shrink-0" aria-hidden /> Can make now
      </p>
    )
  }
  return (
    <p className="line-clamp-2 text-sm">
      <span className="font-medium text-amber-700 dark:text-amber-400">
        Have {match.have} of {match.have + match.need.length}.
      </span>{" "}
      Need {match.need.map(displayName).join(", ")}
    </p>
  )
}

export function SavedRecipeCard({ recipe, serverNow }: { recipe: SavedRecipe; serverNow: number }) {
  return (
    <li className="relative min-w-0">
      <Link
        href={recipeHref(recipe.id)}
        className="flex gap-3 rounded-xl border bg-card p-2.5 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
      >
        <RecipeImage src={recipe.image} className="size-24 shrink-0 rounded-lg" />
        <div className="grid min-w-0 content-start gap-1 py-0.5">
          <h3 className="line-clamp-2 pr-9 leading-snug font-semibold">{recipe.title}</h3>
          <SourceTag source={recipe.source} />
          <MatchLine recipe={recipe} />
          <p className="text-xs text-muted-foreground">
            {recipe.readyInMinutes ? (
              <span className="mr-2 inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden />
                {recipe.readyInMinutes} min
              </span>
            ) : null}
            {recipe.history ? <CookedLabel history={recipe.history} serverNow={serverNow} /> : "Not cooked yet"}
          </p>
        </div>
      </Link>
      <SaveButton
        recipeId={recipe.id}
        title={recipe.title}
        image={recipe.source === "spoonacular" ? recipe.image : null}
        saved
        className="absolute top-1 right-1"
      />
    </li>
  )
}
