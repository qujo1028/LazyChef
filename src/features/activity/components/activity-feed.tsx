"use client"

import { History } from "lucide-react"
import { useMemo, useState, useSyncExternalStore } from "react"

import { EmptyState } from "@/components/empty-state"
import { useHouseholdChanges } from "@/features/household/components/household-channel"

import {
  ACTIVITY_LIMIT,
  groupActivity,
  mergeActivityRows,
  rowFromRecord,
  type ActivityMember,
  type ActivityRow,
} from "../feed"
import { groupByDay } from "../time"
import { ActivityEntryItem } from "./activity-entry"

// Relative times re-render every 30 s. The server doesn't know the viewer's time
// zone, so the server render and hydration use UTC and the server's clock; the
// browser switches to local time right after.
const TICK_MS = 30_000

function subscribeClock(onTick: () => void) {
  const id = window.setInterval(onTick, TICK_MS)
  return () => window.clearInterval(id)
}

function readClock() {
  return Math.floor(Date.now() / TICK_MS) * TICK_MS
}

function subscribeNever() {
  return () => {}
}

export function ActivityFeed({
  householdId,
  initialRows,
  members,
  viewerId,
  serverNow,
}: {
  householdId: string
  initialRows: ActivityRow[]
  members: ActivityMember[]
  viewerId: string
  serverNow: number
}) {
  const [liveRows, setLiveRows] = useState<ActivityRow[]>([])

  useHouseholdChanges("activity_log", (change) => {
    const record = change.record
    if (change.operation !== "INSERT" || !record || record.household_id !== householdId) return
    const row = rowFromRecord(record)
    setLiveRows((rows) => (rows.some((r) => r.id === row.id) ? rows : [row, ...rows].slice(0, ACTIVITY_LIMIT)))
  })

  const now = useSyncExternalStore(subscribeClock, readClock, () => serverNow)
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false)
  const timeZone = hydrated ? undefined : "UTC"

  const memberMap = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])
  const rows = useMemo(() => mergeActivityRows(initialRows, liveRows), [initialRows, liveRows])
  const entries = useMemo(() => groupActivity(rows), [rows])
  const liveIds = useMemo(() => new Set(liveRows.map((row) => row.id)), [liveRows])
  const days = groupByDay(entries, (entry) => Date.parse(entry.createdAt), now, timeZone)

  if (entries.length === 0) {
    return (
      <EmptyState icon={History} title="No activity yet">
        When anyone in the household adds or uses something, it shows up here.
      </EmptyState>
    )
  }

  return (
    <div className="grid gap-5">
      {days.map((day) => (
        <section key={day.key} aria-label={day.label}>
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{day.label}</h2>
          <ul className="divide-y">
            {day.items.map((entry) => (
              <ActivityEntryItem
                key={entry.key}
                entry={entry}
                viewerId={viewerId}
                members={memberMap}
                now={now}
                timeZone={timeZone}
                isNew={liveIds.has(entry.rows[0].id)}
              />
            ))}
          </ul>
        </section>
      ))}
      {rows.length >= ACTIVITY_LIMIT ? (
        <p className="text-center text-xs text-muted-foreground">Showing the latest {ACTIVITY_LIMIT} changes.</p>
      ) : null}
    </div>
  )
}
