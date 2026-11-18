"use client"

import { Crown, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { EmptyState } from "@/components/empty-state"
import { UserAvatar } from "@/components/user-avatar"
import type { ActivityMember } from "@/features/activity/feed"
import { useHouseholdChanges } from "@/features/household/components/household-channel"
import { useViewerTime } from "@/lib/use-viewer-time"
import { cn } from "@/lib/utils"

import type { CookRow } from "../cook-days"
import { computeLeaderboard, type BoardEntry } from "../leaderboard"
import { InviteButton } from "./invite-button"

type Mode = "week" | "allTime"

function days(n: number, plus = false) {
  return `${n}${plus ? "+" : ""} ${n === 1 && !plus ? "day" : "days"}`
}

function Toggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const options: { value: Mode; label: string }[] = [
    { value: "week", label: "Weekly" },
    { value: "allTime", label: "All time" },
  ]
  return (
    <div role="group" aria-label="Board period" className="inline-flex rounded-full bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-10 rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            mode === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Row({
  entry,
  mode,
  max,
  isViewer,
  truncated,
}: {
  entry: BoardEntry
  mode: Mode
  max: number
  isViewer: boolean
  truncated: boolean
}) {
  const count = mode === "week" ? entry.week : entry.allTime
  const rank = mode === "week" ? entry.weekRank : entry.allTimeRank
  return (
    <li
      className={cn(
        "grid gap-2 rounded-xl border bg-card px-3.5 py-3",
        isViewer && "border-primary/50 bg-primary/5",
      )}
      aria-current={isViewer ? "true" : undefined}
    >
      <div className="flex items-center gap-3">
        <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted-foreground tabular-nums">{rank}</span>
        <UserAvatar name={entry.name} src={entry.avatarUrl} className="size-10" />
        <p className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">
          <span className="truncate">{isViewer ? `${entry.name} (you)` : entry.name}</span>
          {entry.wonLastWeek ? (
            <>
              <Crown className="size-4 shrink-0 text-amber-500" aria-hidden />
              <span className="sr-only">Won last week</span>
            </>
          ) : null}
        </p>
        <span className="shrink-0 text-sm font-medium tabular-nums">{days(count, truncated && mode === "allTime")}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full", isViewer ? "bg-primary" : "bg-primary/45")}
          style={{ width: count === 0 || max === 0 ? "0%" : `${Math.max(6, (count / max) * 100)}%` }}
        />
      </div>
    </li>
  )
}

export function LeaderboardView({
  rows,
  members,
  viewerId,
  serverNow,
  truncated,
  householdName,
  inviteCode,
}: {
  rows: CookRow[]
  members: ActivityMember[]
  viewerId: string
  serverNow: number
  /** The row cap cut off older history, so all-time counts are "at least". */
  truncated: boolean
  householdName: string
  inviteCode: string
}) {
  const router = useRouter()
  const { now, timeZone } = useViewerTime(serverNow)
  const [mode, setMode] = useState<Mode>("week")
  // Cooks that arrived live since the page loaded (see the filter below for refreshes).
  const [liveRows, setLiveRows] = useState<CookRow[]>([])

  useHouseholdChanges("activity_log", (change) => {
    if (change.operation === "INSERT" && change.record?.action === "cooked") {
      const record = change.record
      setLiveRows((current) => [...current, { action: "cooked", actorId: record.actor_id, createdAt: record.created_at }])
    } else if (change.operation === "DELETE" && change.oldRecord?.action === "cooked") {
      // An undone cook: the server knows which days still have one.
      router.refresh()
    }
  })

  const board = useMemo(
    () =>
      computeLeaderboard(
        // Live rows the server has since caught up on (after a refresh) are dropped; counting
        // days makes any overlap harmless anyway.
        [...rows, ...liveRows.filter((row) => Date.parse(row.createdAt) > serverNow)],
        members.map((m) => ({ userId: m.userId, displayName: m.displayName, avatarUrl: m.avatarUrl })),
        now,
        timeZone,
      ),
    [rows, liveRows, serverNow, members, now, timeZone],
  )

  if (members.length < 2) {
    return (
      <EmptyState icon={Users} title="Cooking is better together">
        Invite a housemate and see who cooked the most days each week.
        <div className="mt-4 flex justify-center">
          <InviteButton householdName={householdName} inviteCode={inviteCode} />
        </div>
      </EmptyState>
    )
  }

  const entries = mode === "week" ? board.weekly : board.allTime
  const max = Math.max(0, ...entries.map((e) => (mode === "week" ? e.week : e.allTime)))
  const winners = board.lastWeekWinners.map((e) => (e.userId === viewerId ? "You" : e.name))
  const nobodyYet = mode === "week" && max === 0

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Toggle mode={mode} onChange={setMode} />
        <p className="text-xs text-muted-foreground">
          {mode === "week" ? "Cook days this week. Resets Monday." : "Cook days since you started."}
        </p>
      </div>

      {winners.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Crown className="size-4 shrink-0 text-amber-500" aria-hidden />
          <span>Last week&apos;s winner: {winners.join(" and ")}</span>
        </p>
      ) : null}

      {nobodyYet ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Nobody has cooked yet this week. A fresh start for everyone.
        </p>
      ) : null}

      <ol className="grid gap-2" aria-label={mode === "week" ? "This week" : "All time"}>
        {entries.map((entry) => (
          <Row
            key={entry.userId}
            entry={entry}
            mode={mode}
            max={max}
            isViewer={entry.userId === viewerId}
            truncated={truncated}
          />
        ))}
      </ol>

      <p className="text-xs text-muted-foreground">
        One cook day counts once, however many meals you make that day.
        {truncated && mode === "allTime" ? " All time covers your most recent history, so these are at least counts." : ""}
      </p>
    </div>
  )
}
