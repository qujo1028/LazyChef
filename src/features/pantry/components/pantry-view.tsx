"use client"

import { Plus, Search, ShoppingBasket, X } from "lucide-react"
import Link from "next/link"
import { useDeferredValue, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { PageHeading } from "@/components/page-heading"
import { addPantryItemToList } from "@/features/list/components/add-to-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { pantrySummary, remainingMessage } from "../display"
import { groupPantry } from "../group"
import type { PantryItem, PantryMember } from "../types"
import { EditItemSheet } from "./edit-item-sheet"
import { GettingStarted } from "./getting-started"
import { PantrySectionList } from "./pantry-sections"
import { QuickAddSheet, type QuickAddSeed } from "./quick-add-sheet"
import { useToday } from "./use-clock"
import { usePantry } from "./use-pantry"

export function PantryView({
  householdId,
  viewerId,
  items: serverItems,
  members,
  fetchedAt,
  serverToday,
}: {
  householdId: string
  viewerId: string
  items: PantryItem[]
  members: PantryMember[]
  fetchedAt: number
  serverToday: string
}) {
  const today = useToday(serverToday)
  const { items, apply, adjust } = usePantry({ householdId, serverItems, fetchedAt })

  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [quickAdd, setQuickAdd] = useState<{ open: boolean; seed: QuickAddSeed }>({
    open: false,
    seed: { text: "", n: 0 },
  })
  const [editing, setEditing] = useState<{ id: string; open: boolean } | null>(null)
  // Focused in the same tap that opens the sheet, so phones raise the keyboard (iOS only
  // does that for focus() inside a user gesture); the sheet then moves focus to its input.
  const keyboardPrimer = useRef<HTMLInputElement>(null)
  // What opened the current sheet, to put focus back on when it closes.
  const opener = useRef<HTMLElement | null>(null)

  function rememberOpener() {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null
  }

  function restoreFocus(event: Event) {
    event.preventDefault()
    const element = opener.current
    opener.current = null
    // Never refocus a text field: on a phone that would pop the keyboard back up.
    if (!element?.isConnected || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return
    element.focus({ preventScroll: true })
  }

  const all = useMemo(() => groupPantry(items.values(), today), [items, today])
  const shown = useMemo(
    () => (deferredQuery.trim() ? groupPantry(items.values(), today, deferredQuery) : all),
    [all, items, today, deferredQuery],
  )
  const existingNames = useMemo(
    () => new Set([...items.values()].map((item) => item.name.trim().toLowerCase())),
    [items],
  )

  const empty = all.total === 0
  const onlyStaples = !empty && all.staples.length === all.total
  const searching = deferredQuery.trim() !== ""

  function openQuickAdd(text?: string) {
    rememberOpener()
    keyboardPrimer.current?.focus({ preventScroll: true })
    setQuickAdd((current) => ({
      open: true,
      seed: text === undefined ? current.seed : { text, n: current.seed.n + 1 },
    }))
  }

  function takeOne(item: PantryItem) {
    // The database stops at 0, so Undo gives back only what was actually taken (0.5 of 0.5, not 1).
    const taken = Math.min(1, Math.max(0, item.quantity ?? 0))
    adjust(item.id, -1, {
      onDone: (quantity) =>
        toast.success(remainingMessage(item.name, quantity, item.unit), {
          id: `used-${item.id}`,
          action: { label: "Undo", onClick: () => adjust(item.id, taken) },
        }),
    })
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeading title="Pantry" description={pantrySummary(all.total - all.ranOut.length, all.expiring.length)} />
        <Button asChild variant="outline" className="h-11 shrink-0">
          <Link href="/pantry/add">
            <ShoppingBasket aria-hidden />
            Bulk add
          </Link>
        </Button>
      </div>

      {!empty ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            aria-label="Search the pantry"
            placeholder="Search the pantry"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      {searching && shown.total === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing called &ldquo;{deferredQuery.trim()}&rdquo; in the pantry.
          </p>
          <Button variant="outline" className="h-11" onClick={() => openQuickAdd(deferredQuery.trim())}>
            <Plus aria-hidden />
            Add &ldquo;{deferredQuery.trim()}&rdquo;
          </Button>
        </div>
      ) : (
        <PantrySectionList
          sections={shown}
          today={today}
          searching={searching}
          onOpen={(item) => {
            rememberOpener()
            setEditing({ id: item.id, open: true })
          }}
          onUseOne={takeOne}
          onAddToList={(item) => void addPantryItemToList(item)}
        />
      )}

      {(empty || onlyStaples) && !searching ? (
        <GettingStarted onlyStaples={onlyStaples} existingNames={existingNames} onAddFood={() => openQuickAdd()} />
      ) : null}

      {/* Room to scroll the last row above the Add food button. */}
      <div className="h-16" aria-hidden />

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-30">
        <div className="mx-auto flex max-w-lg justify-end px-4">
          <Button
            size="lg"
            className="pointer-events-auto h-14 rounded-full px-6 text-base shadow-lg shadow-primary/25"
            onClick={() => openQuickAdd()}
          >
            <Plus className="size-5" aria-hidden />
            Add food
          </Button>
        </div>
      </div>
      <input
        ref={keyboardPrimer}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-0 size-px text-base opacity-0"
      />

      <QuickAddSheet
        open={quickAdd.open}
        onOpenChange={(open) => setQuickAdd((current) => ({ ...current, open }))}
        seed={quickAdd.seed}
        today={today}
        onCloseAutoFocus={restoreFocus}
      />
      <EditItemSheet
        item={editing ? (items.get(editing.id) ?? null) : null}
        open={editing?.open ?? false}
        onOpenChange={(open) => setEditing((current) => (current ? { ...current, open } : null))}
        members={members}
        viewerId={viewerId}
        today={today}
        serverNow={fetchedAt}
        apply={apply}
        adjust={adjust}
        onCloseAutoFocus={restoreFocus}
      />
    </>
  )
}
