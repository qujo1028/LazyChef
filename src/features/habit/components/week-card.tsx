"use client"

import { Flame, Medal, Target, X } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { useNow } from "@/features/pantry/components/use-clock"
import { useHouseholdChanges } from "@/features/household/components/household-channel"
import { cn } from "@/lib/utils"

import { DEFAULT_GOAL } from "../constants"
import { mergeCookEvents, recipeKeyOf, type CookEvent } from "../cook-days"
import { dismissKey, pickNudges, type NudgeId } from "../nudges"
import type { WeekCardData } from "../queries"
import { summarize } from "../summary"
import { TZ_COOKIE, validTimeZone } from "../timezone"
import { nextTier, TIER_LABELS, type Tier } from "../tiers"
import { weekDayKeys } from "../week"

const RADIUS = 30
const LENGTH = 2 * Math.PI * RADIUS
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]
const DISMISS_KEY = "lazychef.week-nudges"

const TIER_STYLE: Record<Tier, string> = {
  bronze: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  silver: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  gold: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
}

/** The tiny slice of the pantry the card reads: expiring food, from the live pantry list. */
export type ExpiringSummary = { count: number; first: string | null }

// Dismissals live in localStorage (try/catch: the card renders fine without it). A tiny external
// store so the first server render and hydration show every nudge, then the saved choices apply.
const dismissListeners = new Set<() => void>()

function subscribeDismissed(onChange: () => void) {
  dismissListeners.add(onChange)
  window.addEventListener("storage", onChange)
  return () => {
    dismissListeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

function readDismissedRaw(): string {
  try {
    return window.localStorage.getItem(DISMISS_KEY) ?? ""
  } catch {
    return ""
  }
}

function parseDismissed(raw: string, today: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(raw || "null")
    if (parsed && typeof parsed === "object" && "day" in parsed && "keys" in parsed) {
      const { day, keys } = parsed as { day: unknown; keys: unknown }
      // Dismissals are for one day: yesterday's are forgotten.
      if (day === today && Array.isArray(keys)) return new Set(keys.filter((k): k is string => typeof k === "string"))
    }
  } catch {
    // Corrupt: nothing is dismissed.
  }
  return new Set()
}

function writeDismissed(today: string, keys: Set<string>) {
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify({ day: today, keys: [...keys] }))
  } catch {
    // Not remembered, but it still hides for this visit (see below).
  }
  for (const listener of dismissListeners) listener()
}

function subscribeNever() {
  return () => {}
}

function browserZone(): string | null {
  return validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
}

/**
 * The Pantry's one unfinished-state card: this week's cook days against the goal, tier, streak,
 * the active challenge and up to two nudges. Server-rendered with the viewer's cook events (so
 * there is no flash), then kept live from the household channel.
 */
export function WeekCard({
  data,
  viewerId,
  expiring,
  goal = DEFAULT_GOAL,
}: {
  data: WeekCardData
  viewerId: string
  expiring: ExpiringSummary
  goal?: number
}) {
  // The server uses the zone cookie (UTC on a first visit); the browser's own zone and clock
  // take over right after hydrating.
  const timeZone = useSyncExternalStore(subscribeNever, () => browserZone() ?? data.timeZone, () => data.timeZone)
  const now = useNow(data.serverNow)
  const [live, setLive] = useState<CookEvent[]>([])
  // Dismissed this visit even if storage is blocked.
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(() => new Set())
  const rawDismissed = useSyncExternalStore(subscribeDismissed, readDismissedRaw, () => "")

  // Remember the zone for the server (it cannot know it otherwise).
  useEffect(() => {
    try {
      document.cookie = `${TZ_COOKIE}=${encodeURIComponent(timeZone)}; path=/; max-age=31536000; samesite=lax`
    } catch {
      // Cookies blocked: the server keeps using UTC.
    }
  }, [timeZone])

  // Your own cooks from another device (or this one) arrive live, one row each; a batch is one cook.
  useHouseholdChanges("activity_log", (change) => {
    const record = change.record
    if (change.operation !== "INSERT" || !record || record.action !== "cooked" || record.actor_id !== viewerId) return
    const event: CookEvent = { batchId: Number(record.batch_id), at: record.created_at, recipeKey: recipeKeyOf(record.details) }
    setLive((current) => mergeCookEvents(current, [event]))
  })

  const events = useMemo(() => mergeCookEvents(data.events, live), [data.events, live])
  const summary = useMemo(() => summarize(events, now, timeZone), [events, now, timeZone])
  const today = summary.today

  const dismissed = useMemo(() => {
    const keys = parseDismissed(rawDismissed, today)
    for (const key of sessionDismissed) keys.add(key)
    return keys
  }, [rawDismissed, today, sessionDismissed])

  const dismiss = useCallback(
    (id: NudgeId) => {
      const key = dismissKey(today, id)
      setSessionDismissed((current) => new Set(current).add(key))
      writeDismissed(today, new Set([...parseDismissed(readDismissedRaw(), today), key]))
    },
    [today],
  )

  const neverCooked = !data.householdCooked && events.length === 0
  const nudges = pickNudges(
    {
      expiring,
      almost: data.recipes.almost,
      comeback: summary.comeback,
      firstCook: neverCooked ? data.recipes.makeNow : null,
    },
    dismissed,
    today,
  )

  const cooks = summary.cooksThisWeek
  const filled = Math.min(1, cooks / Math.max(1, goal))
  const next = nextTier(cooks)
  const metGoal = cooks >= goal
  const streak = summary.streak
  const showStreak = streak.count > 0 && !summary.comeback
  const week = weekDayKeys(today)

  let headline: string
  let sub: string
  if (neverCooked) {
    headline = "Start your week"
    sub = `Cook ${goal} nights this week and see the ring fill.`
  } else if (summary.comeback) {
    headline = "Welcome back"
    sub = `Aim for ${goal} nights this week.`
  } else if (metGoal) {
    headline = "Goal reached"
    sub = next ? `${next.at - cooks} more ${next.at - cooks === 1 ? "night" : "nights"} for ${TIER_LABELS[next.tier]}.` : "A full week. Nice."
  } else {
    headline = "This week"
    sub = `${goal - cooks} more ${goal - cooks === 1 ? "night" : "nights"} to hit your goal.`
  }

  return (
    <section aria-label="This week" className="grid gap-3 rounded-2xl border bg-card p-4 text-card-foreground">
      <div className="flex items-center gap-4">
        <div className="relative size-[76px] shrink-0">
          <svg viewBox="0 0 76 76" className="size-[76px] -rotate-90" role="img" aria-label={`${cooks} of ${goal} cooks this week`}>
            <circle cx="38" cy="38" r={RADIUS} fill="none" strokeWidth="7" className="stroke-muted" />
            <circle
              cx="38"
              cy="38"
              r={RADIUS}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              className={cn("stroke-primary transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none", metGoal && "stroke-emerald-500")}
              strokeDasharray={LENGTH}
              strokeDashoffset={LENGTH * (1 - filled)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none" aria-hidden>
            <span className="text-xl font-semibold tabular-nums">{cooks}</span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">of {goal}</span>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 gap-1.5">
          <div>
            <h2 className="text-base leading-tight font-semibold">{headline}</h2>
            <p className="text-sm text-muted-foreground">{sub}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {summary.tier ? (
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", TIER_STYLE[summary.tier])}>
                <Medal className="size-3.5" aria-hidden />
                {TIER_LABELS[summary.tier]}
              </span>
            ) : null}
            {showStreak ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                <Flame className="size-3.5 fill-current" aria-hidden />
                {streak.count} {streak.count === 1 ? "day" : "days"}
                {streak.atRisk ? <span className="font-normal"> · cook today to keep it</span> : null}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <ol className="grid grid-cols-7 gap-1" aria-label="Days this week">
        {week.map((day, i) => {
          const cooked = summary.days.has(day)
          const isToday = day === today
          return (
            <li key={day} className="grid justify-items-center gap-1 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-xs",
                  cooked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  isToday && !cooked && "border-primary border-dashed",
                )}
              >
                {cooked ? <span aria-hidden>✓</span> : null}
                <span className="sr-only">{`${WEEKDAYS[i]} ${day}: ${cooked ? "cooked" : isToday ? "today, not yet" : "no cook"}`}</span>
              </span>
              <span aria-hidden className={cn(isToday && "font-semibold text-foreground")}>
                {WEEKDAYS[i]}
              </span>
            </li>
          )
        })}
      </ol>

      {summary.challenge ? (
        <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
          <Target className="size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{summary.challenge.title}</p>
            <p className="text-xs text-muted-foreground">{summary.challenge.label}</p>
          </div>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: summary.challenge.target }, (_, i) => (
              <span key={i} className={cn("size-2 rounded-full", i < summary.challenge!.progress ? "bg-primary" : "bg-border")} />
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">Both challenges done this week.</p>
      )}

      {nudges.length > 0 ? (
        <ul className="grid gap-1">
          {nudges.map((nudge) => (
            <li key={nudge.id} className="flex items-center gap-1 text-sm">
              <p className="min-w-0 flex-1 py-2">
                {nudge.text}{" "}
                <Link href={nudge.href} className="font-medium text-primary underline-offset-4 hover:underline">
                  {nudge.cta}
                </Link>
              </p>
              <button
                type="button"
                onClick={() => dismiss(nudge.id)}
                aria-label={`Dismiss: ${nudge.text}`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
