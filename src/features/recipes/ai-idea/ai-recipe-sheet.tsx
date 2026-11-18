"use client"

import { Check, Clock, ListPlus, Users } from "lucide-react"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { AiLabel } from "@/components/ai/ai-consent"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { addListItems } from "@/features/list/actions"
import { callAction } from "@/lib/call-action"

import type { AiRecipe } from "./idea"

/** An idea as the sheet shows it: the recipe and the names still to buy. */
export type ShownIdea = { recipe: AiRecipe; missing: string[] }

/**
 * The whole AI recipe in a bottom sheet: what it is, ingredients marked have/need, every step,
 * "Add missing to the list", then the caller's own buttons (`actions`). Shared by "Stuck for
 * ideas?" and the automatic meal ideas.
 */
export function AiRecipeSheet({
  idea,
  open,
  onOpenChange,
  actions,
}: {
  idea: ShownIdea | null
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: ReactNode
}) {
  const recipe = idea?.recipe
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto w-full max-w-lg">
        {recipe && idea ? (
          <>
            <DrawerHeader className="gap-1.5 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
              <div>
                <AiLabel />
              </div>
              <DrawerTitle className="text-lg">{recipe.title}</DrawerTitle>
              <DrawerDescription>{recipe.description || "A simple idea from what's in your pantry."}</DrawerDescription>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden /> About {recipe.minutes} min
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-4" aria-hidden /> Serves {recipe.servings}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">Made by AI — check cooking times and allergens.</p>
            </DrawerHeader>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto overscroll-contain px-4 pb-4" data-vaul-no-drag>
              <section className="grid gap-2" aria-label="Ingredients">
                <h3 className="text-sm font-semibold">Ingredients</h3>
                <ul className="divide-y rounded-xl border bg-card">
                  {recipe.ingredients.map((ingredient, index) => (
                    <li key={index} className="flex min-h-11 items-center gap-2 px-3.5 py-2">
                      <span className="min-w-0 flex-1">
                        {ingredient.amount ? <span className="text-muted-foreground">{ingredient.amount} </span> : null}
                        {ingredient.name}
                      </span>
                      {ingredient.fromPantry ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Check className="size-3.5" aria-hidden /> Have it
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-400">Need</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="grid gap-2" aria-label="Steps">
                <h3 className="text-sm font-semibold">Steps</h3>
                <ol className="grid gap-3">
                  {recipe.steps.map((text, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 pt-0.5">{text}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            <DrawerFooter className="border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {/* Keyed by title so a different idea starts with the button enabled again. */}
              <AddMissingButton key={recipe.title} missing={idea.missing} />
              {actions}
            </DrawerFooter>
          </>
        ) : (
          <DrawerTitle className="sr-only">AI recipe idea</DrawerTitle>
        )}
      </DrawerContent>
    </Drawer>
  )
}

/** "Add 3 missing to the list" (nothing when nothing's missing). */
function AddMissingButton({ missing }: { missing: string[] }) {
  const [added, setAdded] = useState(false)
  const [adding, startAdding] = useTransition()

  function addMissing() {
    if (missing.length === 0) return
    startAdding(async () => {
      const result = await callAction(() => addListItems(missing.map((name) => ({ name, quantity: null, unit: null }))))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setAdded(true)
      toast.success(missing.length === 1 ? `Added ${missing[0]} to the shopping list` : `Added ${missing.length} items to the shopping list`)
    })
  }

  if (missing.length === 0) return null
  return (
    <Button type="button" variant="secondary" size="lg" className="h-12 text-base" disabled={adding || added} onClick={addMissing}>
      {added ? <Check aria-hidden /> : <ListPlus aria-hidden />}
      {added ? "On the shopping list" : missing.length === 1 ? `Add ${missing[0]} to the list` : `Add ${missing.length} missing to the list`}
    </Button>
  )
}
