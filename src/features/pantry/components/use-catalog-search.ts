"use client"

import { useCallback, useRef, useState } from "react"

import type { CatalogEntry } from "@/lib/ingredients/types"

type Search = (query: string, limit?: number) => CatalogEntry[]

/**
 * The ingredient library is big, so it's only downloaded when someone starts adding food
 * (call `load` on focus). `search` is null until it arrives.
 */
export function useCatalogSearch(): { search: Search | null; load: () => void } {
  const [search, setSearch] = useState<Search | null>(null)
  const started = useRef(false)

  const load = useCallback(() => {
    if (started.current) return
    started.current = true
    import("@/lib/ingredients/catalog")
      .then((catalog) => setSearch(() => catalog.searchIngredients))
      .catch((error: unknown) => {
        // Offline or a stale deploy: typing still works, just without suggestions. Retry next focus.
        console.warn("Couldn't load the ingredient library", error)
        started.current = false
      })
  }, [])

  return { search, load }
}
