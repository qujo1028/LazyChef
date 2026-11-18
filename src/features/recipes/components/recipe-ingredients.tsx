"use client"

import { Minus, Plus } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

import type { CookLine } from "../cook"
import { clampServings, scaleFactor } from "../scale"
import { CookSheet } from "./cook-sheet"
import { IngredientChecklist, type ChecklistLine } from "./ingredient-checklist"

/** Ingredients + cook button sharing one servings value (not persisted: resets on every visit). */
export function RecipeIngredients({
  recipeId,
  title,
  baseServings,
  lines,
  cook,
  saved,
}: {
  recipeId: number
  title: string
  baseServings: number | null
  lines: ChecklistLine[]
  cook: CookLine[]
  saved: boolean
}) {
  const [servings, setServings] = useState(baseServings ?? 1)
  const factor = useMemo(() => scaleFactor(servings, baseServings), [servings, baseServings])

  return (
    <>
      {baseServings ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3.5 py-2">
          <span className="text-sm font-medium" id="servings-label">
            Servings
          </span>
          <div className="flex items-center gap-1" role="group" aria-labelledby="servings-label">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Fewer servings"
              disabled={servings <= 1}
              onClick={() => setServings((n) => clampServings(n - 1))}
            >
              <Minus aria-hidden />
            </Button>
            <span className="min-w-10 text-center text-base font-semibold tabular-nums" aria-live="polite">
              {servings}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="More servings"
              onClick={() => setServings((n) => clampServings(n + 1))}
            >
              <Plus aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
      <IngredientChecklist recipeId={recipeId} lines={lines} scale={factor} recipeTitle={title} />
      <CookSheet recipeId={recipeId} title={title} lines={cook} saved={saved} scale={factor} />
    </>
  )
}
