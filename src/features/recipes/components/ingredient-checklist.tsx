"use client"

import { Check, ListPlus } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { callAction } from "@/lib/call-action"
import { displayName } from "@/features/pantry/display"

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

/** The recipe's ingredients split into "You need" (with boxes to add to the list) and "You have". */
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

  const haveLines = lines.filter((line) => line.status !== "need")
  const needLines = lines.filter((line) => line.status === "need")

  return (
    <div className="grid gap-4">
      {needLines.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            You need <span className="font-normal">· {needLines.length}</span>
          </h3>
          <ul className="divide-y rounded-xl border bg-card">
            {needLines.map((line) => {
              const id = `ingredient-${line.index}`
              const onList = isOnList(line)
              return (
                <li key={line.index} className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
                  {onList ? (
                    <span
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      aria-hidden
                    >
                      <ListPlus className="size-3" />
                    </span>
                  ) : (
                    <Checkbox
                      id={id}
                      checked={selected.has(line.index)}
                      onCheckedChange={(value) => toggle(line.index, value === true)}
                      aria-label={`Add ${line.name} to the shopping list`}
                      // 20px box, 44px hit area (the row's label toggles it too).
                      className="size-5 after:-inset-3"
                    />
                  )}
                  <label htmlFor={onList ? undefined : id} className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm leading-snug">{line.original}</span>
                    {onList ? <span className="text-xs text-muted-foreground">On the shopping list</span> : null}
                  </label>
                </li>
              )
            })}
          </ul>
          {addable.length > 0 ? (
            <Button size="lg" className="h-12 w-full text-base" disabled={pending || chosen.length === 0} onClick={addToList}>
              <ListPlus aria-hidden />
              {pending
                ? "Adding…"
                : chosen.length === 0
                  ? "Pick what to add"
                  : chosen.length === addable.length
                    ? "Add missing to list"
                    : `Add ${plural(chosen.length, "item")} to the list`}
            </Button>
          ) : null}
        </div>
      ) : null}

      {haveLines.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-primary">
            You have <Check className="inline size-4 align-[-3px]" aria-hidden /> <span className="font-normal">· {haveLines.length}</span>
          </h3>
          <ul className="divide-y rounded-xl border bg-card">
            {haveLines.map((line) => (
              <li key={line.index} className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
                  <Check className="size-3" />
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm leading-snug">{line.original}</span>
                  <span className="text-xs text-muted-foreground">
                    {line.status === "basic"
                      ? "Pantry basic"
                      : `You have ${line.pantryName ? displayName(line.pantryName).toLowerCase() : "it"}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
