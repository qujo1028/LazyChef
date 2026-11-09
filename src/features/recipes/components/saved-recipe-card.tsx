import { CircleCheck } from "lucide-react"

import { displayName } from "@/features/pantry/display"

import { canMakeNow, type SavedRecipe } from "../saved"
import { CookedLabel } from "./cooked-label"
import { RecipeTile } from "./recipe-tile"

function MatchLine({ recipe }: { recipe: SavedRecipe }) {
  const { match } = recipe
  if (match === null) return <p className="text-xs text-muted-foreground">Open it to check your pantry</p>
  if (canMakeNow(recipe)) {
    return (
      <p className="inline-flex items-center gap-1 text-xs font-medium text-primary">
        <CircleCheck className="size-3.5 shrink-0" aria-hidden /> Can make now
      </p>
    )
  }
  return (
    <p className="line-clamp-2 text-xs text-muted-foreground">
      <span className="font-medium text-amber-700 dark:text-amber-400">Need {match.need.length}:</span>{" "}
      {match.need.map(displayName).join(", ")}
    </p>
  )
}

export function SavedRecipeCard({ recipe, serverNow }: { recipe: SavedRecipe; serverNow: number }) {
  return (
    <RecipeTile
      id={recipe.id}
      source={recipe.source}
      title={recipe.title}
      image={recipe.image}
      readyInMinutes={recipe.readyInMinutes}
      saved
    >
      <MatchLine recipe={recipe} />
      <p className="text-xs text-muted-foreground">
        {recipe.history ? <CookedLabel history={recipe.history} serverNow={serverNow} /> : "Not cooked yet"}
      </p>
    </RecipeTile>
  )
}
