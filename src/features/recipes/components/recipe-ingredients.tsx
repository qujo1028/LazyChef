"use client"

import { Minus, Plus, Users } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

import type { CookLine } from "../cook"
import { clampServings, MAX_SERVINGS, MIN_SERVINGS, scaleFactor } from "../scale"
import { IngredientsWithSwaps } from "../substitutions/components/ingredients-with-swaps"
import { CookSheet } from "./cook-sheet"
import { IngredientChecklist, type ChecklistLine } from "./ingredient-checklist"

/**
 * Ingredients, the serving scaler and "I cooked this", sharing one servings value. The
 * servings live only in this component: every visit starts at the recipe's own number.
 * Without a known serving count there is nothing to scale, so the control is hidden.
 */
export function RecipeIngredients({
  recipeId,
  title,
  image,
  lines,
  cook,
  saved,
  baseServings,
  withSwaps,
  sendCopy,
}: {
  recipeId: string
  title: string
  image: string | null
  lines: ChecklistLine[]
  cook: CookLine[]
  saved: boolean
  baseServings: number | null
  withSwaps: boolean
  sendCopy: boolean
}) {
  const [servings, setServings] = useState(baseServings ?? 1)
  const scale = baseServings ? scaleFactor(servings, baseServings) : 1
  const step = (by: number) => setServings((current) => clampServings(current + by))

  return (
    <>
      {baseServings ? (
        <div className="flex items-center gap-2 text-sm">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Servings</span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              onClick={() => step(-1)}
              disabled={servings <= MIN_SERVINGS}
              aria-label="Fewer servings"
            >
              <Minus aria-hidden />
            </Button>
            <span className="min-w-10 text-center text-base font-semibold tabular-nums" aria-live="polite">
              {servings}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              onClick={() => step(1)}
              disabled={servings >= MAX_SERVINGS}
              aria-label="More servings"
            >
              <Plus aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
      {withSwaps ? (
        <IngredientsWithSwaps recipeId={recipeId} title={title} lines={lines} sendCopy={sendCopy} scale={scale} />
      ) : (
        <IngredientChecklist recipeId={recipeId} lines={lines} scale={scale} />
      )}
      <CookSheet recipeId={recipeId} title={title} image={image} lines={cook} saved={saved} scale={scale} />
    </>
  )
}
