import { Clock } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

import { filtersHref, MEAL_FILTERS, TIME_FILTERS, type RecipeFilters } from "../filters"

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted active:bg-muted",
      )}
    >
      {children}
    </Link>
  )
}

/** Meal type and cook-time chips. Tapping an active chip turns it off. */
export function RecipeFilterBar({ filters }: { filters: RecipeFilters }) {
  return (
    <nav aria-label="Recipe filters" className="-mx-4 grid gap-2">
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip href={filtersHref({ ...filters, type: null })} active={filters.type === null}>
          Any meal
        </Chip>
        {MEAL_FILTERS.map((meal) => (
          <Chip
            key={meal.value}
            href={filtersHref({ ...filters, type: filters.type === meal.value ? null : meal.value })}
            active={filters.type === meal.value}
          >
            {meal.label}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {TIME_FILTERS.map((minutes) => (
          <Chip
            key={minutes}
            href={filtersHref({ ...filters, maxTime: filters.maxTime === minutes ? null : minutes })}
            active={filters.maxTime === minutes}
          >
            <Clock className="size-3.5" aria-hidden />
            {minutes === 60 ? "Under 1 hr" : `Under ${minutes} min`}
          </Chip>
        ))}
      </div>
    </nav>
  )
}
