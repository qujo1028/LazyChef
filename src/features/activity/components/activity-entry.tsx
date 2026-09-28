"use client"

import { Minus, Pencil, Plus, RefreshCw, Trash2, type LucideIcon } from "lucide-react"
import { useState } from "react"

import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"

import {
  describeItem,
  resolveActor,
  summarizeEntry,
  visibleItemCount,
  type ActivityAction,
  type ActivityEntry,
  type ActivityMember,
} from "../feed"
import { shortTime } from "../time"

type ActionStyle = { icon: LucideIcon; badge: string; text: string }

const ACTION_STYLES: Record<ActivityAction, ActionStyle> = {
  added: { icon: Plus, badge: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  restocked: { icon: RefreshCw, badge: "bg-sky-500", text: "text-sky-600 dark:text-sky-400" },
  used: { icon: Minus, badge: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  updated: { icon: Pencil, badge: "bg-violet-500", text: "text-violet-600 dark:text-violet-400" },
  removed: { icon: Trash2, badge: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
}

/** For actions added to the enum later (cooked, shopped, …) before they get their own style. */
const FALLBACK_STYLE: ActionStyle = { icon: Pencil, badge: "bg-muted-foreground", text: "text-muted-foreground" }

function styleFor(action: ActivityAction): ActionStyle {
  return ACTION_STYLES[action] ?? FALLBACK_STYLE
}

export function ActivityEntryItem({
  entry,
  viewerId,
  members,
  now,
  timeZone,
  isNew,
}: {
  entry: ActivityEntry
  viewerId: string
  members: ReadonlyMap<string, ActivityMember>
  now: number
  timeZone: string | undefined
  isNew: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const actor = resolveActor(entry.rows[0], viewerId, members)
  const summary = summarizeEntry(entry)
  const style = styleFor(summary.action)
  const BadgeIcon = style.icon

  const total = entry.rows.length
  const collapsedCount = visibleItemCount(total)
  const shown = summary.grouped ? entry.rows.slice(0, expanded ? total : collapsedCount) : []
  const hidden = total - collapsedCount

  return (
    <li
      className={cn(
        "flex gap-3 py-3",
        isNew && "animate-in duration-300 fade-in slide-in-from-top-2 motion-reduce:animate-none",
      )}
    >
      <div className="relative h-10 shrink-0">
        <UserAvatar name={actor.name} src={actor.avatarUrl} className="size-10" />
        <span
          className={cn(
            "absolute -right-1 -bottom-1 inline-flex size-5 items-center justify-center rounded-full text-white ring-2 ring-background",
            style.badge,
          )}
        >
          <BadgeIcon className="size-3" strokeWidth={3} aria-hidden />
        </span>
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 text-[15px] leading-snug break-words">
            <span className="font-semibold">{actor.label}</span> {summary.verb}{" "}
            <span className={summary.grouped ? undefined : "font-medium"}>{summary.object}</span>
          </p>
          <time dateTime={entry.createdAt} className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-muted-foreground">
            {shortTime(Date.parse(entry.createdAt), now, timeZone)}
          </time>
        </div>

        {summary.detail ? <p className="mt-0.5 text-sm text-muted-foreground">{summary.detail}</p> : null}

        {shown.length > 0 ? (
          <ul className="mt-2 grid gap-1.5">
            {shown.map((row) => {
              const rowStyle = styleFor(row.action)
              const RowIcon = rowStyle.icon
              return (
                <li key={row.id} className="flex items-center gap-2 text-sm">
                  <RowIcon className={cn("size-3.5 shrink-0", rowStyle.text)} strokeWidth={2.5} aria-hidden />
                  <span className="min-w-0 truncate">{describeItem(row)}</span>
                  {summary.mixed && row.action !== summary.action ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{row.action}</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}

        {summary.grouped && hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="-mb-2 -ml-1 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {expanded ? "Show less" : `and ${hidden} more`}
          </button>
        ) : null}
      </div>
    </li>
  )
}
