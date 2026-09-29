"use client"

import { LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { callAction } from "@/features/pantry/components/call-action"
import { ReviewList } from "@/features/pantry/components/review-list"
import { describeAdditions, type ExistingItem } from "@/features/pantry/merge"
import { draftsToItems, type ReviewDraft } from "@/features/pantry/review"
import { normalizeIngredientName } from "@/lib/ingredients/library/normalize"
import { convertQuantity } from "@/lib/units"

import { putAway } from "../actions"
import type { ListChange } from "../list-state"
import { draftsFromListItems, mergeHints } from "../put-away"
import type { ListItem } from "../types"

const MERGE_DEPS = { normalize: normalizeIngredientName, convert: convertQuantity }

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

/**
 * "Put away N items": the checked lines as the pantry's review cards (amounts pre-filled,
 * add expiry dates), noting which top up something already there. Removing a card still
 * clears that line; it just isn't added to the pantry.
 */
export function PutAwaySheet({
  open,
  onOpenChange,
  session,
  checked,
  pantry,
  today,
  apply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Bumped each time the sheet opens, to start from the lines checked right then. */
  session: number
  checked: readonly ListItem[]
  pantry: readonly ExistingItem[]
  today: string
  apply: (change: ListChange) => void
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto w-full max-w-lg">
        {checked.length > 0 || session > 0 ? (
          <PutAwayContent
            key={session}
            checked={checked}
            pantry={pantry}
            today={today}
            apply={apply}
            close={() => onOpenChange(false)}
          />
        ) : (
          <DrawerTitle className="sr-only">Put away</DrawerTitle>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function PutAwayContent({
  checked,
  pantry,
  today,
  apply,
  close,
}: {
  checked: readonly ListItem[]
  pantry: readonly ExistingItem[]
  today: string
  apply: (change: ListChange) => void
  close: () => void
}) {
  const router = useRouter()
  // The lines this trip covers: what was checked when the sheet opened.
  const [ids] = useState(() => checked.map((item) => item.id))
  const [drafts, setDrafts] = useState<ReviewDraft[]>(() => draftsFromListItems(checked))
  const [showErrors, setShowErrors] = useState(false)
  const [pending, startTransition] = useTransition()

  const hints = useMemo(() => mergeHints(drafts, pantry, MERGE_DEPS), [drafts, pantry])
  const skipped = ids.length - drafts.length

  function finish(items: Parameters<typeof putAway>[1]) {
    startTransition(async () => {
      const result = await callAction(() => putAway(ids, items))
      if (result.error !== undefined) {
        toast.error(result.error)
        // Probably a housemate got there first: show the list as it is now.
        router.refresh()
        return
      }
      for (const id of ids) apply({ type: "remove", id })
      const pantryText = items.length > 0 ? describeAdditions(result) : null
      toast.success(pantryText ? `Put away: ${pantryText.toLowerCase()}` : `Cleared ${plural(result.cleared, "item")}`, {
        description: items.length > 0 && skipped > 0 ? `${plural(skipped, "item")} cleared without adding` : undefined,
      })
      close()
    })
  }

  function confirm() {
    if (pending) return
    const items = draftsToItems(drafts)
    if (!items) {
      setShowErrors(true)
      return
    }
    finish(items)
  }

  const primary =
    drafts.length === 0 ? `Clear ${plural(ids.length, "item")}` : `Put away ${drafts.length === 1 ? "1 item" : `${drafts.length} items`}`

  return (
    <>
      <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="text-lg">Put the groceries away</DrawerTitle>
        <DrawerDescription>
          Check amounts and add expiry dates. Tap ✕ on anything that doesn&apos;t go in the pantry.
        </DrawerDescription>
      </DrawerHeader>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain px-4 pb-2">
        {skipped > 0 ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            {plural(skipped, "item")} will come off the list without going in the pantry.
          </p>
        ) : null}
        <ReviewList
          drafts={drafts}
          onChange={setDrafts}
          today={today}
          showErrors={showErrors}
          disabled={pending}
          hints={hints}
        />
      </div>
      <DrawerFooter className="border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button type="button" size="lg" className="h-12 text-base" onClick={confirm} disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {pending ? "Putting away…" : primary}
        </Button>
        {drafts.length > 0 ? (
          <Button type="button" variant="ghost" size="lg" onClick={() => finish([])} disabled={pending}>
            Clear without adding to the pantry
          </Button>
        ) : null}
      </DrawerFooter>
    </>
  )
}
