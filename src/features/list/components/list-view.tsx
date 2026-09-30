"use client"

import { ListChecks, PackageCheck, ScanBarcode, ShoppingCart } from "lucide-react"
import { useId, useMemo, useRef, useState } from "react"

import { EmptyState } from "@/components/empty-state"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { useToday } from "@/features/pantry/components/use-clock"
import type { ExistingItem } from "@/features/pantry/merge"
import { CATEGORY_META, type Category } from "@/lib/ingredients/types"

import { checkedByLabel } from "../display"
import { groupList, listSummary } from "../group"
import type { ListItem } from "../types"
import { EditListItemSheet } from "./edit-list-item-sheet"
import { ListQuickAdd } from "./list-quick-add"
import { ListRow } from "./list-row"
import { PutAwaySheet } from "./put-away-sheet"
import { ScanToCheckSheet } from "./scan-to-check-sheet"
import { useList } from "./use-list"

export function ListView({
  householdId,
  viewerId,
  items: serverItems,
  members,
  pantry,
  fetchedAt,
  serverToday,
}: {
  householdId: string
  viewerId: string
  items: ListItem[]
  members: { userId: string; displayName: string }[]
  pantry: ExistingItem[]
  fetchedAt: number
  serverToday: string
}) {
  const today = useToday(serverToday)
  const { items, apply, toggle, setItemChecked } = useList({ householdId, viewerId, serverItems, fetchedAt })
  const [scanning, setScanning] = useState(false)
  const sections = useMemo(() => groupList(items.values()), [items])
  const [editing, setEditing] = useState<{ id: string; open: boolean } | null>(null)
  const [putAway, setPutAway] = useState({ open: false, session: 0 })
  const opener = useRef<HTMLElement | null>(null)

  const empty = sections.toBuyCount === 0 && sections.inCart.length === 0

  function edit(item: ListItem) {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null
    setEditing({ id: item.id, open: true })
  }

  function restoreFocus(event: Event) {
    event.preventDefault()
    const element = opener.current
    opener.current = null
    if (element?.isConnected) element.focus({ preventScroll: true })
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeading title="Shopping list" description={listSummary(sections.toBuyCount, sections.inCart.length)} />
        {sections.toBuyCount > 0 ? (
          <Button variant="outline" className="h-11 shrink-0" onClick={() => setScanning(true)}>
            <ScanBarcode aria-hidden />
            Scan
          </Button>
        ) : null}
      </div>
      <ListQuickAdd />
      <ScanToCheckSheet
        open={scanning}
        onOpenChange={setScanning}
        items={items}
        setItemChecked={setItemChecked}
        apply={apply}
      />

      {empty ? (
        <EmptyState icon={ListChecks} title="Nothing on the list yet">
          Type above to add things, tap &ldquo;Add to list&rdquo; on anything that ran out in the pantry, or add a
          recipe&apos;s missing ingredients.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {sections.toBuyCount === 0 ? (
            <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
              Got everything. Put it away when you&apos;re home.
            </p>
          ) : null}
          {sections.toBuy.map(({ category, items: lines }) => (
            <Section key={category} title={CATEGORY_META[category].label} icon={<Emoji category={category} />} count={lines.length}>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {lines.map((item) => (
                  <ListRow key={item.id} item={item} onToggle={(line) => toggle(line.id)} onEdit={edit} />
                ))}
              </ul>
            </Section>
          ))}
          {sections.inCart.length > 0 ? (
            <Section
              title="In the cart"
              icon={<ShoppingCart className="size-4 text-primary" aria-hidden />}
              count={sections.inCart.length}
            >
              <ul className="divide-y overflow-hidden rounded-xl border bg-card/60">
                {sections.inCart.map((item) => (
                  <ListRow
                    key={item.id}
                    item={item}
                    detail={checkedByLabel(item.checked_by, members, viewerId)}
                    onToggle={(line) => toggle(line.id)}
                    onEdit={edit}
                  />
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      )}

      {sections.inCart.length > 0 ? (
        <>
          {/* Room to scroll the last row above the button. */}
          <div className="h-16" aria-hidden />
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-30">
            <div className="mx-auto flex max-w-lg px-4">
              <Button
                size="lg"
                className="pointer-events-auto h-14 w-full rounded-full text-base shadow-lg shadow-primary/25"
                onClick={() => setPutAway((current) => ({ open: true, session: current.session + 1 }))}
              >
                <PackageCheck className="size-5" aria-hidden />
                Put away {sections.inCart.length} {sections.inCart.length === 1 ? "item" : "items"}
              </Button>
            </div>
          </div>
        </>
      ) : null}

      <EditListItemSheet
        item={editing ? (items.get(editing.id) ?? null) : null}
        open={editing?.open ?? false}
        onOpenChange={(open) => setEditing((current) => (current ? { ...current, open } : null))}
        onCloseAutoFocus={restoreFocus}
        apply={apply}
      />
      <PutAwaySheet
        open={putAway.open}
        onOpenChange={(open) => setPutAway((current) => ({ ...current, open }))}
        session={putAway.session}
        checked={sections.inCart}
        pantry={pantry}
        today={today}
        apply={apply}
      />
    </>
  )
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-2">
      <h2 id={id} className="flex items-center gap-2 px-1 text-sm font-semibold">
        {icon}
        {title}
        <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  )
}

function Emoji({ category }: { category: Category }) {
  return (
    <span className="text-base leading-none" aria-hidden>
      {(CATEGORY_META[category] ?? CATEGORY_META.other).emoji}
    </span>
  )
}
