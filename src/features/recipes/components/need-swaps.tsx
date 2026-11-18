"use client"

import { Replace } from "lucide-react"
import { useState } from "react"

import { displayName } from "@/features/pantry/display"

import { SwapSheet } from "./swap-sheet"

/** "Almost there" cards: tap a missing ingredient to see swaps. */
export function NeedSwaps({ names, recipeTitle }: { names: string[]; recipeTitle: string }) {
  const [open, setOpen] = useState<string | null>(null)
  if (names.length === 0) return null
  return (
    <>
      <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Swap a missing ingredient">
        {names.map((name) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => setOpen(name)}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`Swap ${name}`}
            >
              <Replace className="size-3.5" aria-hidden /> {displayName(name)}
            </button>
          </li>
        ))}
      </ul>
      <SwapSheet ingredient={open} recipeTitle={recipeTitle} onClose={() => setOpen(null)} />
    </>
  )
}
