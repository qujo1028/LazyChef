"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { CardNotice } from "@/features/admin/components/admin-card"
import { closeIssue, moveIssue, reopenIssue } from "@/features/admin/actions"
import {
  type BoardIssue,
  type BoardPull,
  type Column,
  COLUMN_TITLES,
  columnFor,
  type IssueColumn,
  labelsForMove,
} from "@/features/admin/board"
import { IssueCard } from "@/features/admin/components/issue-card"
import { PrCard } from "@/features/admin/components/pr-card"
import { actionError, callAction } from "@/lib/call-action"

type OptimisticChange =
  | { type: "move"; number: number; column: IssueColumn }
  | { type: "close"; number: number; at: string }
  | { type: "reopen"; number: number }

function applyChange(issues: BoardIssue[], change: OptimisticChange): BoardIssue[] {
  return issues.map((issue) => {
    if (issue.number !== change.number) return issue
    if (change.type === "move") {
      return { ...issue, state: "open", closedAt: null, labels: labelsForMove(issue.labels, change.column) }
    }
    if (change.type === "close") return { ...issue, state: "closed", closedAt: change.at }
    return { ...issue, state: "open", closedAt: null }
  })
}

const COLUMNS: Column[] = ["backlog", "next", "in-progress", "review", "done"]

export function BoardView({
  issues,
  pulls,
  now,
  reviewError,
  doneError,
}: {
  /** Open issues plus recently closed ones. */
  issues: BoardIssue[]
  /** Null when the pull request list couldn't be loaded. */
  pulls: BoardPull[] | null
  /** ISO time the page rendered at, so ages stay consistent. */
  now: string
  reviewError?: string
  doneError?: string
}) {
  const [optimistic, addOptimistic] = useOptimistic(issues, applyChange)
  const [, startTransition] = useTransition()

  function run(change: OptimisticChange, action: () => ReturnType<typeof moveIssue>) {
    startTransition(async () => {
      addOptimistic(change)
      const result = await callAction(action)
      const message = actionError(result)
      // When the transition ends, the optimistic state is dropped, so the card snaps back.
      if (message) toast.error(message)
    })
  }

  const byColumn: Record<Column, BoardIssue[]> = { backlog: [], next: [], "in-progress": [], review: [], done: [] }
  for (const issue of optimistic) byColumn[columnFor(issue)].push(issue)
  byColumn.done.sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))

  return (
    <div className="overflow-x-auto pb-2 lg:overflow-visible">
      <div className="flex snap-x snap-mandatory gap-3 lg:grid lg:grid-cols-5 lg:snap-none">
        {COLUMNS.map((column) => {
          const items = column === "review" ? (pulls ?? []) : byColumn[column]
          const error = column === "review" ? reviewError : column === "done" ? doneError : undefined
          const heading = `column-${column}`
          return (
            <section
              key={column}
              aria-labelledby={heading}
              className="min-w-[85%] snap-start rounded-2xl bg-muted/40 p-2 sm:min-w-[45%] lg:min-w-0"
            >
              <h2 id={heading} className="flex items-center justify-between px-1 py-1.5 text-sm font-semibold">
                {COLUMN_TITLES[column]}
                <span className="rounded-full bg-background px-2 text-xs font-medium text-muted-foreground tabular-nums">
                  {error ? "?" : items.length}
                </span>
              </h2>
              {error ? (
                <CardNotice kind="error" message={error} />
              ) : items.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Nothing here</p>
              ) : (
                <ul className="grid gap-2">
                  {column === "review"
                    ? (items as BoardPull[]).map((pull) => <PrCard key={pull.number} pull={pull} now={now} />)
                    : (items as BoardIssue[]).map((issue) => (
                        <IssueCard
                          key={issue.number}
                          issue={issue}
                          column={column as "backlog" | "next" | "in-progress" | "done"}
                          now={now}
                          onMove={(target) => run({ type: "move", number: issue.number, column: target }, () => moveIssue(issue.number, target))}
                          onClose={() => run({ type: "close", number: issue.number, at: new Date().toISOString() }, () => closeIssue(issue.number))}
                          onReopen={() => run({ type: "reopen", number: issue.number }, () => reopenIssue(issue.number))}
                        />
                      ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
