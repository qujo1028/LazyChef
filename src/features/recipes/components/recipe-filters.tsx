"use client"

import { Clock, SlidersHorizontal, X } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

import { filtersHref, MEAL_FILTERS, NO_FILTERS, TIME_FILTERS, type RecipeFilters, type TimeFilter } from "../filters"

function timeLabel(minutes: TimeFilter) {
  return minutes === 60 ? "Under 1 hr" : `Under ${minutes} min`
}

function mealLabel(type: RecipeFilters["type"]) {
  return MEAL_FILTERS.find((meal) => meal.value === type)?.label ?? null
}

function Chip({
  href,
  active,
  onPick,
  children,
}: {
  href: string
  active: boolean
  onPick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      scroll={false}
      onClick={onPick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted active:bg-muted",
      )}
    >
      {children}
    </Link>
  )
}

/** "Filters" button that opens a sheet of meal and cook-time options. Each tap applies right away. */
export function RecipeFilterButton({ filters }: { filters: RecipeFilters }) {
  const [open, setOpen] = useState(false)
  const count = (filters.type ? 1 : 0) + (filters.maxTime ? 1 : 0)
  const close = () => setOpen(false)

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("relative size-12 shrink-0 rounded-xl p-0", count > 0 && "border-primary text-primary")}
          aria-label={count > 0 ? `Filters, ${count} on` : "Filters"}
        >
          <SlidersHorizontal className="size-5" aria-hidden />
          {count > 0 ? (
            <span className="absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums">
              {count}
            </span>
          ) : null}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto grid w-full max-w-md gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-lg">Filters</DrawerTitle>
            <DrawerDescription>Narrow ideas by meal and how long they take.</DrawerDescription>
          </DrawerHeader>
          <section className="grid gap-2.5" aria-label="Meal">
            <h3 className="text-sm font-semibold">Meal</h3>
            <div className="flex flex-wrap gap-2">
              <Chip href={filtersHref({ ...filters, type: null })} active={filters.type === null} onPick={close}>
                Any meal
              </Chip>
              {MEAL_FILTERS.map((meal) => (
                <Chip key={meal.value} href={filtersHref({ ...filters, type: meal.value })} active={filters.type === meal.value} onPick={close}>
                  {meal.label}
                </Chip>
              ))}
            </div>
          </section>
          <section className="grid gap-2.5" aria-label="Cook time">
            <h3 className="text-sm font-semibold">Cook time</h3>
            <div className="flex flex-wrap gap-2">
              <Chip href={filtersHref({ ...filters, maxTime: null })} active={filters.maxTime === null} onPick={close}>
                Any time
              </Chip>
              {TIME_FILTERS.map((minutes) => (
                <Chip key={minutes} href={filtersHref({ ...filters, maxTime: minutes })} active={filters.maxTime === minutes} onPick={close}>
                  <Clock className="size-3.5" aria-hidden />
                  {timeLabel(minutes)}
                </Chip>
              ))}
            </div>
          </section>
          {count > 0 ? (
            <Button asChild variant="ghost" size="lg" className="h-12 text-base">
              <Link href={filtersHref({ ...NO_FILTERS, query: filters.query })} scroll={false} onClick={close}>
                Clear filters
              </Link>
            </Button>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/** The filters that are on, as small removable pills under the search box. */
export function ActiveFilters({ filters }: { filters: RecipeFilters }) {
  const pills = [
    filters.type ? { label: mealLabel(filters.type), href: filtersHref({ ...filters, type: null }) } : null,
    filters.maxTime ? { label: timeLabel(filters.maxTime), href: filtersHref({ ...filters, maxTime: null }) } : null,
  ].filter((pill) => pill !== null)
  if (pills.length === 0) return null
  return (
    <div className="-mt-2 flex flex-wrap gap-2">
      {pills.map((pill) => (
        <Link
          key={pill.href}
          href={pill.href}
          scroll={false}
          aria-label={`Remove filter: ${pill.label}`}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-primary/10 pr-2 pl-3 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
        >
          {pill.label}
          <X className="size-3.5" aria-hidden />
        </Link>
      ))}
    </div>
  )
}
