"use client"

import { Check, ListPlus } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { callAction } from "@/lib/call-action"
import { displayName } from "@/features/pantry/display"
import { cn } from "@/lib/utils"

import { describeListAdditions } from "@/features/list/plan"

import { addRecipeIngredientsToList } from "../actions"
import type { IngredientStatus } from "../match"

export type ChecklistLine = {
  /** Position in the recipe's ingredient list (what the server action takes). */
  index: number
  original: string
  name: string
  status: IngredientStatus
  pantryName: string | null
  onList: boolean
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

/** The recipe's ingredients: what you have, and what you need with boxes to add to the list. */
export function IngredientChecklist({ recipeId, lines }: { recipeId: number; lines: ChecklistLine[] }) {
  const [added, setAdded] = useState<ReadonlySet<number>>(() => new Set())
  const isOnList = (line: ChecklistLine) => line.onList || added.has(line.index)
  const addable = lines.filter((line) => line.status === "need" && !isOnList(line))
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set(addable.map((line) => line.index)))
  const [pending, startTransition] = useTransition()

  const chosen = addable.filter((line) => selected.has(line.index)).map((line) => line.index)

  function toggle(index: number, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(index)
      else next.delete(index)
      return next
    })
  }

  function addToList() {
    if (chosen.length === 0) return
    startTransition(async () => {
      const result = await callAction(() => addRecipeIngredientsToList(recipeId, chosen))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setAdded((current) => new Set([...current, ...chosen]))
      toast.success(describeListAdditions(result), { description: "Shopping list" })
    })
  }

  return (
    <div className="grid gap-3">
      <ul className="divide-y rounded-xl border bg-card">
        {lines.map((line) => {
          const id = `ingredient-${line.index}`
          const onList = isOnList(line)
          return (
            <li key={line.index} className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
              {line.status === "need" && !onList ? (
                <Checkbox
                  id={id}
                  checked={selected.has(line.index)}
                  onCheckedChange={(value) => toggle(line.index, value === true)}
                  aria-label={`Add ${line.name} to the shopping list`}
                  // 20px box, 44px hit area (the row's label toggles it too).
                  className="size-5 after:-inset-3"
                />
              ) : (
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
                    line.status === "need" ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
                  )}
                  aria-hidden
                >
                  {line.status === "need" ? <ListPlus className="size-3" /> : <Check className="size-3" />}
                </span>
              )}
              <label htmlFor={line.status === "need" && !onList ? id : undefined} className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm leading-snug">{line.original}</span>
                <span
                  className={cn(
                    "text-xs",
                    line.status === "need" && !onList ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                  )}
                >
                  {line.status === "have"
                    ? `You have ${line.pantryName ? displayName(line.pantryName).toLowerCase() : "it"}`
                    : line.status === "basic"
                      ? "Pantry basic"
                      : onList
                        ? "On the shopping list"
                        : "Need"}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {addable.length > 0 ? (
        <Button size="lg" className="h-12 w-full text-base" disabled={pending || chosen.length === 0} onClick={addToList}>
          <ListPlus aria-hidden />
          {pending ? "Adding…" : chosen.length === 0 ? "Pick what to add" : `Add ${plural(chosen.length, "item")} to the list`}
        </Button>
      ) : null}
    </div>
  )
}
