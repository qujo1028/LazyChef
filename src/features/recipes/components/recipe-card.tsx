import { AlarmClock, Clock } from "lucide-react"
import Link from "next/link"

import { displayName } from "@/features/pantry/display"

import type { Suggestion } from "../match"
import { RecipeImage } from "./recipe-image"
import { SaveButton } from "./save-button"

function list(names: string[]) {
  return names.map(displayName).join(", ")
}

export function RecipeCard({ recipe, saved }: { recipe: Suggestion; saved: boolean }) {
  return (
    <li className="relative min-w-0">
      <Link
        href={`/recipes/${recipe.id}`}
        className="flex gap-3 rounded-xl border bg-card p-2.5 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
      >
        <RecipeImage src={recipe.image} className="size-24 shrink-0 rounded-lg" />
        <div className="grid min-w-0 content-start gap-1 py-0.5">
          <h3 className="line-clamp-2 pr-9 leading-snug font-semibold">{recipe.title}</h3>
          <p className="text-xs text-muted-foreground">
            {recipe.readyInMinutes ? (
              <span className="mr-2 inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden />
                {recipe.readyInMinutes} min
              </span>
            ) : null}
            {recipe.have.length} from your pantry
          </p>
          {recipe.need.length > 0 ? (
            <p className="line-clamp-2 text-sm">
              <span className="font-medium text-amber-700 dark:text-amber-400">Need:</span> {list(recipe.need)}
            </p>
          ) : null}
          {recipe.usesExpiring.length > 0 ? (
            <p className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <AlarmClock className="size-3 shrink-0" aria-hidden />
              <span className="truncate">Uses up {list(recipe.usesExpiring)}</span>
            </p>
          ) : null}
        </div>
      </Link>
      <SaveButton recipeId={recipe.id} title={recipe.title} saved={saved} className="absolute top-1 right-1" />
    </li>
  )
}
