import Link from "next/link"

import { cn } from "@/lib/utils"

import { filtersHref, isAuto, type MealFilter, type RecipeFilters } from "../filters"

const STRIP_MEALS: { value: MealFilter; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "main course", label: "Dinner" },
]

function StripChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted active:bg-muted",
      )}
    >
      {children}
    </Link>
  )
}

/**
 * "Auto: Dinner | Breakfast | Lunch | Dinner" under the search row. Auto follows the viewer's
 * clock; tapping the active manual meal goes back to Auto. `autoMeal` is null until the
 * time zone cookie is known.
 */
export function MealStrip({ filters, autoMeal }: { filters: RecipeFilters; autoMeal: string | null }) {
  const auto = { ...filters, type: null, anyMeal: false }
  return (
    <nav aria-label="Meal" className="-mt-1 -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5">
      <StripChip href={filtersHref(auto)} active={isAuto(filters)}>
        {autoMeal ? `Auto: ${autoMeal}` : "Auto"}
      </StripChip>
      {STRIP_MEALS.map((meal) => {
        const active = filters.type === meal.value
        return (
          <StripChip key={meal.value} href={filtersHref(active ? auto : { ...filters, type: meal.value, anyMeal: false })} active={active}>
            {meal.label}
          </StripChip>
        )
      })}
    </nav>
  )
}
