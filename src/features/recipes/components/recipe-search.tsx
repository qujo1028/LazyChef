import { Search, X } from "lucide-react"
import Link from "next/link"

import { Input } from "@/components/ui/input"

import { filtersHref, MAX_QUERY_LENGTH, type RecipeFilters } from "../filters"

/**
 * Searches recipe titles (ours first, then Spoonacular's if there are few). A plain GET
 * form, so it works before the page's JavaScript loads. Keeps the other filters.
 */
export function RecipeSearch({ filters }: { filters: RecipeFilters }) {
  return (
    <form action="/recipes" method="get" role="search" className="relative">
      {filters.type ? <input type="hidden" name="type" value={filters.type} /> : null}
      {filters.maxTime ? <input type="hidden" name="time" value={filters.maxTime} /> : null}
      <label htmlFor="recipe-search" className="sr-only">
        Search recipes
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        id="recipe-search"
        name="q"
        type="search"
        defaultValue={filters.query ?? ""}
        placeholder="Search recipes"
        maxLength={MAX_QUERY_LENGTH}
        enterKeyHint="search"
        autoComplete="off"
        className="h-12 rounded-xl pr-12 pl-10 text-base"
      />
      {filters.query ? (
        <Link
          href={filtersHref({ ...filters, query: null })}
          aria-label="Clear search"
          className="absolute top-1/2 right-1 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </Link>
      ) : null}
    </form>
  )
}
