"use client"

import { LoaderCircle, Plus } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { callAction } from "@/lib/call-action"
import { IngredientCombobox } from "@/features/pantry/components/ingredient-combobox"

import { addListText, deleteListItems } from "../actions"
import { describeListAdditions } from "../plan"

/**
 * Always-there add box: "2 lbs chicken breast", "milk, eggs", or a pasted list. Adds right
 * away (no review); Undo takes new lines back off. The text stays if it fails.
 */
export function ListQuickAdd() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value || pending) {
      inputRef.current?.focus()
      return
    }
    startTransition(async () => {
      const result = await callAction(() => addListText(value))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setText((current) => (current.trim() === value ? "" : current))
      const ids = result.ids
      toast.success(describeListAdditions(result), {
        action:
          ids.length > 0
            ? {
                label: "Undo",
                onClick: () =>
                  void callAction(() => deleteListItems(ids)).then((undo) => {
                    if (undo.error !== undefined) toast.error(undo.error)
                  }),
              }
            : undefined,
      })
    })
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-2">
      <IngredientCombobox
        className="min-w-0 flex-1"
        inputRef={inputRef}
        value={text}
        onValueChange={setText}
        placeholder="Add milk, 2 lbs chicken…"
        aria-label="Add to the list"
      />
      <Button type="submit" size="lg" className="h-12 min-w-12 px-4" disabled={pending} aria-label="Add">
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Plus className="size-5" aria-hidden />}
      </Button>
    </form>
  )
}
