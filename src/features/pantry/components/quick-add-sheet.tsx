"use client"

import { ArrowRight, LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useId, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { FormMessage } from "@/components/form-message"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { parseLines } from "@/lib/ingredients/parse-line"

import { addItems, previewItems } from "../actions"
import { describeAdditions } from "../merge"
import type { SpoonacularStatus } from "../resolve-core"
import { draftsFromResolved, draftsToItems, type ReviewDraft } from "../review"
import { callAction } from "./call-action"
import { IngredientCombobox } from "./ingredient-combobox"
import { ReviewList, SpoonacularNote } from "./review-list"

/** Text to start the sheet with; bump `n` to apply it (e.g. "Add “oat milk”" from a search). */
export type QuickAddSeed = { text: string; n: number }

type Review = { drafts: ReviewDraft[]; spoonacular: SpoonacularStatus }

/** Sheet contents (text, review) survive closing it by accident; a successful add clears them. */
export function QuickAddSheet({
  open,
  onOpenChange,
  seed,
  today,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  seed: QuickAddSeed
  today: string
  /** Where focus goes when the sheet closes (it has no trigger button of its own). */
  onCloseAutoFocus?: (event: Event) => void
}) {
  const helpId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const batch = useRef(0)
  const [text, setText] = useState(seed.text)
  const [seenSeed, setSeenSeed] = useState(seed.n)
  const [review, setReview] = useState<Review | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set after a successful add: the next open starts fresh (the old review stays put
  // while the sheet slides away).
  const [cleared, setCleared] = useState(false)
  const [pending, startTransition] = useTransition()

  const newSeed = seed.n !== seenSeed
  if (open && (cleared || newSeed)) {
    setCleared(false)
    setSeenSeed(seed.n)
    setText(newSeed ? seed.text : "")
    setReview(null)
    setShowErrors(false)
    setError(null)
  }

  const count = useMemo(() => (text.trim() ? parseLines(text).length : 0), [text])

  function preview(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    if (!text.trim()) {
      setError("Type something to add, like “2 lbs chicken breast”.")
      inputRef.current?.focus()
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await callAction(() => previewItems(text))
      if (result.error !== undefined) {
        setError(result.error)
        return
      }
      batch.current += 1
      setShowErrors(false)
      setReview({ drafts: draftsFromResolved(result.items, batch.current), spoonacular: result.spoonacular })
    })
  }

  function add() {
    if (!review || pending) return
    const items = draftsToItems(review.drafts)
    if (!items) {
      setShowErrors(true)
      return
    }
    startTransition(async () => {
      const result = await callAction(() => addItems(items))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      toast.success(describeAdditions(result))
      setCleared(true)
      onOpenChange(false)
    })
  }

  function backToText() {
    setReview(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const drafts = review?.drafts ?? []

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="mx-auto w-full max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (!review) inputRef.current?.focus({ preventScroll: true })
        }}
        onEscapeKeyDown={(event) => {
          // Escape closes the suggestion list first (see IngredientCombobox).
          if (event.target instanceof HTMLElement && event.target.getAttribute("aria-expanded") === "true") {
            event.preventDefault()
          }
        }}
      >
        {review ? (
          <>
            <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
              <DrawerTitle className="text-lg">
                {drafts.length === 1 ? "Check it before adding" : `Check these ${drafts.length} items`}
              </DrawerTitle>
              <DrawerDescription>Fix a name, amount or category if it looks off.</DrawerDescription>
            </DrawerHeader>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain px-4 pb-2">
              <SpoonacularNote status={review.spoonacular} />
              <ReviewList
                drafts={drafts}
                onChange={(next) => {
                  if (next.length === 0) backToText()
                  else setReview({ ...review, drafts: next })
                }}
                today={today}
                showErrors={showErrors}
                disabled={pending}
              />
            </div>
            <DrawerFooter className="flex-row border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button type="button" variant="outline" size="lg" onClick={backToText} disabled={pending}>
                Back
              </Button>
              <Button type="button" size="lg" className="flex-1" onClick={add} disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                {pending ? "Adding…" : drafts.length === 1 ? "Add to pantry" : `Add ${drafts.length} to pantry`}
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <>
            <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
              <DrawerTitle className="text-lg">Add food</DrawerTitle>
              <DrawerDescription id={helpId}>
                Type what you have, like “2 lbs chicken breast”. Separate items with commas.
              </DrawerDescription>
            </DrawerHeader>
            <form
              onSubmit={preview}
              className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            >
              <div className="flex items-start gap-2">
                <IngredientCombobox
                  className="min-w-0 flex-1"
                  inputRef={inputRef}
                  value={text}
                  onValueChange={(value) => {
                    setText(value)
                    if (error) setError(null)
                  }}
                  placeholder="e.g. 2 lbs chicken breast"
                  aria-label="What did you get?"
                  aria-describedby={helpId}
                  aria-invalid={error ? true : undefined}
                />
                <Button type="submit" size="lg" className="h-12 min-w-[4.5rem]" disabled={pending}>
                  {pending ? <LoaderCircle className="animate-spin" aria-label="Reading your list" /> : "Add"}
                </Button>
              </div>
              <FormMessage error={error ?? undefined} />
              {count > 1 ? (
                <p className="px-1 text-sm text-muted-foreground" aria-live="polite">
                  {count} items. You can check them all before they&apos;re added.
                </p>
              ) : null}
              <Link
                href={text.trim() ? `/pantry/add?text=${encodeURIComponent(text.trim())}` : "/pantry/add"}
                onClick={() => onOpenChange(false)}
                className="inline-flex min-h-11 items-center gap-1 justify-self-start rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Adding a lot? Just went shopping
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </form>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
