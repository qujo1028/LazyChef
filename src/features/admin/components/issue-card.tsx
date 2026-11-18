"use client"

import { ExternalLink, MoreHorizontal } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ageLabel, type BoardIssue, COLUMN_TITLES, isStatusLabel, type IssueColumn } from "@/features/admin/board"

const MOVE_TARGETS: IssueColumn[] = ["backlog", "next", "in-progress"]

export function IssueCard({
  issue,
  column,
  now,
  onMove,
  onClose,
  onReopen,
}: {
  issue: BoardIssue
  column: "backlog" | "next" | "in-progress" | "done"
  now: string
  onMove: (column: IssueColumn) => void
  onClose: () => void
  onReopen: () => void
}) {
  const labels = issue.labels.filter((l) => !isStatusLabel(l))
  const date = column === "done" && issue.closedAt ? issue.closedAt : issue.createdAt
  const age = ageLabel(date, now)

  return (
    <li className="min-w-0 rounded-xl border bg-card p-3 text-sm text-card-foreground">
      <div className="flex items-start justify-between gap-2">
        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 font-medium break-words hover:underline"
        >
          {issue.title}
          <ExternalLink className="ml-1 inline size-3 align-baseline text-muted-foreground" aria-hidden />
          <span className="sr-only"> (opens GitHub)</span>
        </a>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="-mt-1 -mr-1 shrink-0"
              aria-label={`Actions for issue #${issue.number}`}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {MOVE_TARGETS.filter((target) => target !== column).map((target) => (
              <DropdownMenuItem key={target} onSelect={() => onMove(target)}>
                Move to {COLUMN_TITLES[target]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {column === "done" ? (
              <DropdownMenuItem onSelect={onReopen}>Reopen</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={onClose}>Close</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {labels.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {labels.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          #{issue.number} · <span title={column === "done" ? "Closed" : "Opened"}>{age}</span>
        </span>
        {issue.assignee ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar size="sm">
              <AvatarImage src={issue.assignee.avatarUrl} alt="" />
              <AvatarFallback>{issue.assignee.login.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="truncate">{issue.assignee.login}</span>
          </span>
        ) : null}
      </div>
    </li>
  )
}
