"use client"

import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

import { RecipeGrid } from "./recipe-tile"

/** A tile grid that shows the first `initial` tiles and a "Show all N" button for the rest. */
export function ShowMoreGrid({ items, initial }: { items: ReactNode[]; initial: number }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, initial)
  return (
    <div className="grid gap-4">
      <RecipeGrid>{shown}</RecipeGrid>
      {!all && items.length > initial ? (
        <Button type="button" variant="outline" size="lg" className="h-12 w-full text-base" onClick={() => setAll(true)}>
          Show all {items.length} <ChevronDown aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}
