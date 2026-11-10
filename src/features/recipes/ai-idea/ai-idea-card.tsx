"use client"

import { Check, Clock, ListPlus, LoaderCircle, RefreshCw, Sparkles, Users } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { AiLabel, useAiConsent } from "@/components/ai/ai-consent"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { addListItems } from "@/features/list/actions"
import { callAction } from "@/lib/call-action"

import { getAiRecipeIdea, type AiIdea } from "./actions"
import { MAX_HINT_LENGTH } from "./limits"

/**
 * "Ask AI for an idea": one simple recipe from what's in the pantry. Only rendered when the AI
 * assistant is set up. The idea isn't saved anywhere; closing the sheet lets it go.
 */
export function AiIdeaCard() {
  const hintId = useId()
  const [hint, setHint] = useState("")
  const [idea, setIdea] = useState<AiIdea | null>(null)
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState(false)
  const [asking, startAsking] = useTransition()
  const [adding, startAdding] = useTransition()
  const { ensureConsent, dialog } = useAiConsent("the names of the items in your pantry, and any hint you type")

  async function ask(avoidTitle?: string) {
    if (!(await ensureConsent())) return
    startAsking(async () => {
      const result = await callAction(() => getAiRecipeIdea(hint, avoidTitle))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setIdea({ recipe: result.recipe, missing: result.missing })
      setAdded(false)
      setOpen(true)
    })
  }

  function addMissing(names: string[]) {
    if (names.length === 0) return
    startAdding(async () => {
      const result = await callAction(() => addListItems(names.map((name) => ({ name, quantity: null, unit: null }))))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setAdded(true)
      toast.success(names.length === 1 ? `Added ${names[0]} to the shopping list` : `Added ${names.length} items to the shopping list`)
    })
  }

  const recipe = idea?.recipe
  const missing = idea?.missing ?? []

  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4" aria-label="Ask AI for an idea">
      <div className="grid gap-0.5">
        <h2 className="font-heading text-lg font-semibold">Stuck for ideas?</h2>
        <p className="text-sm text-muted-foreground">Get a simple recipe idea made from your pantry, using what expires first.</p>
      </div>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void ask()
        }}
      >
        <label htmlFor={hintId} className="sr-only">
          Optional hint
        </label>
        <Input
          id={hintId}
          value={hint}
          onChange={(event) => setHint(event.target.value)}
          maxLength={MAX_HINT_LENGTH}
          placeholder="Optional: quick, vegetarian, one pan…"
          autoComplete="off"
          enterKeyHint="go"
        />
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={asking}>
          {asking ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {asking ? "Thinking…" : "Ask AI for an idea"}
        </Button>
      </form>
      {dialog}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto w-full max-w-lg">
          {recipe ? (
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
                {missing.length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="h-12 text-base"
                    disabled={adding || added}
                    onClick={() => addMissing(missing)}
                  >
                    {added ? <Check aria-hidden /> : <ListPlus aria-hidden />}
                    {added
                      ? "On the shopping list"
                      : missing.length === 1
                        ? `Add ${missing[0]} to the list`
                        : `Add ${missing.length} missing to the list`}
                  </Button>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-12 flex-1 text-base"
                    disabled={asking}
                    onClick={() => void ask(recipe.title)}
                  >
                    {asking ? <LoaderCircle className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                    Try another
                  </Button>
                  <Button type="button" size="lg" className="h-12 flex-1 text-base" onClick={() => setOpen(false)}>
                    Done
                  </Button>
                </div>
              </DrawerFooter>
            </>
          ) : (
            <DrawerTitle className="sr-only">AI recipe idea</DrawerTitle>
          )}
        </DrawerContent>
      </Drawer>
    </section>
  )
}
