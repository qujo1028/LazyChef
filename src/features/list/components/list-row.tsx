"use client"

import { Check, Pencil } from "lucide-react"

import { displayName } from "@/features/pantry/display"
import { cn } from "@/lib/utils"

import { amountText } from "../display"
import type { ListItem } from "../types"

/**
 * One line. Most of the row is a single big tap target that checks it off (thumb-sized,
 * one-handed); the pencil opens the editor.
 */
export function ListRow({
  item,
  detail,
  onToggle,
  onEdit,
}: {
  item: ListItem
  /** Extra text under the name for checked lines ("Checked by Sam"). */
  detail?: string
  onToggle: (item: ListItem) => void
  onEdit: (item: ListItem) => void
}) {
  const checked = item.checked_at !== null
  const name = displayName(item.name)
  const amount = amountText(item)
  const meta = [amount, item.note, item.recipe_title ? `for ${item.recipe_title}` : null, detail].filter(Boolean)
  return (
    <li className="flex items-center gap-1 pr-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onToggle(item)}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted/60"
      >
        <span
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
          )}
          aria-hidden
        >
          {checked ? <Check className="size-4" strokeWidth={3} /> : null}
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={cn("truncate text-[15px] font-medium", checked && "text-muted-foreground line-through")}>
            {name}
          </span>
          {meta.length > 0 ? (
            <span className="line-clamp-2 text-sm text-muted-foreground">{meta.join(" · ")}</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onEdit(item)}
        aria-label={`Edit ${name}`}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
      >
        <Pencil className="size-4" aria-hidden />
      </button>
    </li>
  )
}
