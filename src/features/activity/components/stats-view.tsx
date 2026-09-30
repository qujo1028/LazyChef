"use client"

import { BarChart3, ChefHat, Flame, ListPlus, ShoppingBag, ShoppingBasket, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { addListItems } from "@/features/list/actions"
import { displayName } from "@/features/pantry/display"
import { callAction } from "@/lib/call-action"
import { useViewerTime } from "@/lib/use-viewer-time"
import { cn } from "@/lib/utils"

import { resolveActor, type ActivityMember } from "../feed"
import { computeStats, weekLabel, type HouseholdStats, type StatsRow } from "../stats"

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Tile({ icon: Icon, value, label, note, tone }: { icon: LucideIcon; value: string; label: string; note?: string; tone: string }) {
  return (
    <div className="grid content-start gap-1 rounded-xl border bg-card p-3.5">
      <Icon className={cn("size-5", tone)} aria-hidden />
      <p className="text-2xl leading-none font-semibold tabular-nums">{value}</p>
      <p className="text-sm leading-snug">{label}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function WeekChart({ weeks }: { weeks: HouseholdStats["weeks"] }) {
  const max = Math.max(1, ...weeks.map((week) => week.count))
  const total = weeks.reduce((sum, week) => sum + week.count, 0)
  return (
    <figure className="grid gap-2 rounded-xl border bg-card p-3.5">
      <figcaption className="text-sm text-muted-foreground">
        {plural(total, "meal")} in the last {weeks.length} weeks
      </figcaption>
      <div className="flex h-32 items-end gap-1" aria-hidden>
        {weeks.map((week, i) => (
          <div key={week.start} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            {week.count > 0 ? (
              <span className="text-center text-[10px] leading-none text-muted-foreground tabular-nums">{week.count}</span>
            ) : null}
            <div
              className={cn(
                "w-full rounded-t-md",
                i === weeks.length - 1 ? "bg-primary" : "bg-primary/40",
                week.count === 0 && "bg-muted",
              )}
              style={{ height: week.count === 0 ? "4px" : `${Math.max(8, (week.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
        <span>{weekLabel(weeks[0].start)}</span>
        <span>This week</span>
      </div>
      <ul className="sr-only">
        {weeks.map((week) => (
          <li key={week.start}>
            Week of {weekLabel(week.start)}: {plural(week.count, "meal")}
          </li>
        ))}
      </ul>
    </figure>
  )
}

function MostBought({ items }: { items: HouseholdStats["mostBought"] }) {
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set())
  const [pending, startTransition] = useTransition()

  function add(name: string) {
    startTransition(async () => {
      const result = await callAction(() => addListItems([{ name, quantity: null, unit: null }]))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setAdded((current) => new Set([...current, name]))
      toast.success(result.added > 0 ? `Added ${name} to the list` : `${displayName(name)} is already on the list`)
    })
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((item) => (
        <li key={item.name} className="flex min-h-14 items-center gap-2 pr-2 pl-3.5">
          <span className="min-w-0 flex-1 truncate">{displayName(item.name)}</span>
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{plural(item.count, "trip")}</span>
          {added.has(item.name) ? (
            <span className="w-11 shrink-0 text-center text-xs text-muted-foreground">On list</span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              onClick={() => add(item.name)}
              aria-label={`Add ${item.name} to the shopping list`}
            >
              <ListPlus aria-hidden />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function StatsView({
  rows,
  members,
  viewerId,
  serverNow,
}: {
  rows: StatsRow[]
  members: ActivityMember[]
  viewerId: string
  serverNow: number
}) {
  const { now, timeZone } = useViewerTime(serverNow)
  const stats = useMemo(() => computeStats(rows, now, timeZone), [rows, now, timeZone])
  const memberMap = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])

  if (stats.since === null) {
    return (
      <EmptyState icon={BarChart3} title="No stats yet">
        Tap &quot;I cooked this&quot; on a recipe or put away a shopping trip, and your household&apos;s numbers show up
        here.
      </EmptyState>
    )
  }

  const { cooks, trips } = stats
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          icon={ChefHat}
          tone="text-orange-600 dark:text-orange-400"
          value={`${cooks.thisMonth}`}
          label={cooks.thisMonth === 1 ? "meal cooked this month" : "meals cooked this month"}
          note={`${cooks.lastMonth} last month`}
        />
        <Tile
          icon={Flame}
          tone="text-rose-600 dark:text-rose-400"
          value={`${cooks.streak}`}
          label={cooks.streak === 1 ? "day cooking streak" : "days cooking streak"}
          note={cooks.streak === 0 ? "Cook today to start one" : "Days in a row with a meal"}
        />
        <Tile
          icon={ShoppingBag}
          tone="text-teal-600 dark:text-teal-400"
          value={`${trips.thisMonth}`}
          label={trips.thisMonth === 1 ? "shopping trip this month" : "shopping trips this month"}
          note={`${plural(trips.itemsThisMonth, "item")} bought`}
        />
        <Tile
          icon={BarChart3}
          tone="text-sky-600 dark:text-sky-400"
          value={`${cooks.total}`}
          label={cooks.total === 1 ? "meal cooked in all" : "meals cooked in all"}
          note={`${plural(trips.total, "trip")} in all`}
        />
      </div>

      <Section title="Meals per week">
        <WeekChart weeks={stats.weeks} />
      </Section>

      <Section title="Most cooked">
        {stats.topRecipes.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Recipes you cook with &quot;I cooked this&quot; show up here.
          </p>
        ) : (
          <ol className="divide-y rounded-xl border bg-card">
            {stats.topRecipes.map((recipe, i) => {
              const body = (
                <>
                  <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{recipe.title}</span>
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{plural(recipe.count, "time")}</span>
                </>
              )
              return (
                <li key={`${recipe.id ?? recipe.title}`}>
                  {recipe.id !== null ? (
                    <Link
                      href={`/recipes/${recipe.id}`}
                      className="flex min-h-14 items-center gap-3 px-3.5 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex min-h-14 items-center gap-3 px-3.5">{body}</div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </Section>

      <Section title="Housemates">
        <ul className="divide-y rounded-xl border bg-card">
          {stats.people.map((person) => {
            const actor = resolveActor({ actorId: person.actorId, actor: null }, viewerId, memberMap)
            return (
              <li key={person.actorId ?? "-"} className="flex min-h-16 items-center gap-3 px-3.5 py-2">
                <UserAvatar name={actor.name} src={actor.avatarUrl} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{actor.isViewer ? "You" : actor.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {plural(person.cooks, "meal")} · {plural(person.trips, "trip")} · {plural(person.itemsBought, "item")}{" "}
                    bought
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="Most bought">
        {stats.mostBought.length === 0 ? (
          <p className="flex items-start gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <ShoppingBasket className="mt-0.5 size-4 shrink-0" aria-hidden />
            What you buy shows up here after you put away a shopping trip on the List tab.
          </p>
        ) : (
          <MostBought items={stats.mostBought} />
        )}
      </Section>
    </div>
  )
}
