import { CircleCheck } from "lucide-react"

import { displayName } from "@/features/pantry/display"

import type { Suggestion } from "../match"
import { RecipeTile } from "./recipe-tile"

/** A suggestion as a grid tile: what you have, or what's missing. */
export function RecipeCard({ recipe, saved }: { recipe: Suggestion; saved: boolean }) {
  const expiring = recipe.usesExpiring[0] ? displayName(recipe.usesExpiring[0]) : null
  return (
    <RecipeTile
      id={recipe.id}
      source={recipe.source}
      title={recipe.title}
      image={recipe.image}
      readyInMinutes={recipe.readyInMinutes}
      saved={saved}
      expiring={expiring}
    >
      {recipe.need.length === 0 ? (
        <p className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          <CircleCheck className="size-3.5 shrink-0" aria-hidden />
          You have everything
        </p>
      ) : (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          <span className="font-medium text-amber-700 dark:text-amber-400">Need {recipe.need.length}:</span>{" "}
          {recipe.need.map(displayName).join(", ")}
        </p>
      )}
    </RecipeTile>
  )
}
