"use client"

import { AlarmClock, ChevronRight, Infinity as InfinityIcon } from "lucide-react"
import { useId, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { CATEGORY_META, type Category } from "@/lib/ingredients/types"
import { cn } from "@/lib/utils"

import { expiryInfo, type ExpiryInfo } from "../dates"
import { amountLabel, canUseOne, displayName } from "../display"
import type { PantrySections } from "../group"
import type { PantryItem } from "../types"

type RowActions = {
  onOpen: (item: PantryItem) => void
  onUseOne: (item: PantryItem) => void
}

/** The grouped list: expiring soon, one card per category, staples as chips, then "Ran out". */
export function PantrySectionList({
  sections,
  today,
  searching,
  ...actions
}: RowActions & { sections: PantrySections; today: string; searching: boolean }) {
  return (
    // grid-cols-1 (= minmax(0, 1fr)) so a long, truncated name can't widen the page.
    <div className="grid grid-cols-1 gap-6">
      {sections.expiring.length > 0 ? (
        <Section
          title="Expiring soon"
          icon={<AlarmClock className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />}
          count={sections.expiring.length}
        >
          <ItemCard items={sections.expiring} today={today} showEmoji {...actions} />
        </Section>
      ) : null}

      {sections.categories.map(({ category, items }) => (
        <Section key={category} title={CATEGORY_META[category].label} icon={<Emoji category={category} />} count={items.length}>
          <ItemCard items={items} today={today} {...actions} />
        </Section>
      ))}

      {sections.staples.length > 0 ? (
        <Section
          title="Always on hand"
          icon={<InfinityIcon className="size-4 text-primary" aria-hidden />}
          count={sections.staples.length}
        >
          <ul className="flex flex-wrap gap-2">
            {sections.staples.map((item) => (
              <li key={item.id} className="min-w-0 max-w-full">
                <button
                  type="button"
                  onClick={() => actions.onOpen(item)}
                  className="inline-flex h-11 max-w-full items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
                >
                  <Emoji category={item.category} />
                  <span className="truncate">{displayName(item.name)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {sections.ranOut.length > 0 ? (
        <RanOutSection items={sections.ranOut} today={today} forceOpen={searching} {...actions} />
      ) : null}
    </div>
  )
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon: React.ReactNode
  count: number
  children: React.ReactNode
}) {
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

function ItemCard({
  items,
  today,
  showEmoji = false,
  muted = false,
  ...actions
}: RowActions & { items: PantryItem[]; today: string; showEmoji?: boolean; muted?: boolean }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} today={today} showEmoji={showEmoji} muted={muted} {...actions} />
      ))}
    </ul>
  )
}

function ItemRow({
  item,
  today,
  showEmoji,
  muted,
  onOpen,
  onUseOne,
}: RowActions & { item: PantryItem; today: string; showEmoji: boolean; muted: boolean }) {
  const name = displayName(item.name)
  const expiry = expiryInfo(item.expires_on, today)
  return (
    <li className="flex items-center gap-1 pr-2">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-3.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted/60"
      >
        {showEmoji ? <Emoji category={item.category} /> : null}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={cn("truncate text-[15px] font-medium", muted && "text-muted-foreground")}>{name}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="tabular-nums">{amountLabel(item)}</span>
            {expiry && expiry.tone !== "later" && !muted ? <ExpiryBadge info={expiry} /> : null}
          </span>
        </span>
      </button>
      {canUseOne(item) ? (
        <button
          type="button"
          onClick={() => onUseOne(item)}
          aria-label={`Use one ${name}`}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border bg-background text-sm font-semibold tabular-nums transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted dark:border-input dark:bg-input/30"
        >
          −1
        </button>
      ) : null}
    </li>
  )
}

export function ExpiryBadge({ info }: { info: ExpiryInfo }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        info.tone === "expired" && "bg-destructive/10 text-destructive dark:bg-destructive/20",
        info.tone === "soon" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
      )}
    >
      {info.label}
    </Badge>
  )
}

function RanOutSection({
  items,
  today,
  forceOpen,
  ...actions
}: RowActions & { items: PantryItem[]; today: string; forceOpen: boolean }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const expanded = open || forceOpen
  return (
    <section aria-label="Ran out" className="grid grid-cols-1 gap-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="-mx-1 flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} aria-hidden />
        Ran out
        <span className="font-normal tabular-nums">{items.length}</span>
      </button>
      <div id={listId} hidden={!expanded}>
        {expanded ? <ItemCard items={items} today={today} showEmoji muted {...actions} /> : null}
      </div>
    </section>
  )
}
