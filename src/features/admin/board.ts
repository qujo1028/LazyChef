// Pure helpers for the admin board. No server-only import: the client board view uses them too.

export const STATUS_LABELS = { next: "status: next", "in-progress": "status: in-progress" } as const

export type Column = "backlog" | "next" | "in-progress" | "review" | "done"
/** The columns an issue can be moved to by hand. */
export type IssueColumn = "backlog" | "next" | "in-progress"

export const COLUMN_TITLES: Record<Column, string> = {
  backlog: "Backlog",
  next: "Up next",
  "in-progress": "In progress",
  review: "In review",
  done: "Done",
}

export type BoardIssue = {
  number: number
  title: string
  url: string
  labels: string[]
  assignee: { login: string; avatarUrl: string } | null
  createdAt: string
  closedAt: string | null
  state: "open" | "closed"
}

export type ReviewState = "approved" | "changes_requested" | "review_needed"
export type CiState = "success" | "failure" | "pending"

export type BoardPull = {
  number: number
  title: string
  url: string
  author: string
  draft: boolean
  createdAt: string
  reviewState: ReviewState | null
  ci: CiState | null
  linkedIssues: number[]
}

export function isStatusLabel(label: string): boolean {
  return /^status:/i.test(label.trim())
}

/** The board column for an issue. If both status labels are set, in-progress wins. */
export function columnFor(issue: Pick<BoardIssue, "state" | "labels">): Exclude<Column, "review"> {
  if (issue.state === "closed") return "done"
  const names = issue.labels.map((l) => l.trim().toLowerCase())
  if (names.includes(STATUS_LABELS["in-progress"])) return "in-progress"
  if (names.includes(STATUS_LABELS.next)) return "next"
  return "backlog"
}

/** The labels after moving an issue: every other `status:*` label goes, the rest stay. */
export function labelsForMove(currentLabels: string[], target: IssueColumn): string[] {
  const kept = currentLabels.filter((l) => !isStatusLabel(l))
  return target === "backlog" ? kept : [...kept, STATUS_LABELS[target]]
}

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi

/** Issue numbers a PR body says it closes ("Fixes #12"), in order, without repeats. */
export function linkedIssues(prBody: string | null | undefined): number[] {
  const found: number[] = []
  for (const match of (prBody ?? "").matchAll(CLOSING)) {
    const n = Number(match[1])
    if (!found.includes(n)) found.push(n)
  }
  return found
}

/** "now", "5m", "3h", "3d", "6w", "4mo", "2y". */
export function ageLabel(date: string | Date, now: string | Date | number): string {
  const ms = new Date(now).getTime() - new Date(date).getTime()
  if (!Number.isFinite(ms) || ms < 60_000) return "now"
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d`
  if (days < 60) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

export type Review = { user: string | null; state: string }

/**
 * Review state from a PR's reviews (oldest first): each reviewer's latest approval or
 * change request counts; comments don't. Any outstanding change request wins.
 */
export function reviewStateFor(reviews: Review[]): ReviewState {
  const latest = new Map<string, string>()
  for (const { user, state } of reviews) {
    const s = state.toUpperCase()
    if (!user) continue
    if (s === "APPROVED" || s === "CHANGES_REQUESTED") latest.set(user, s)
    else if (s === "DISMISSED") latest.delete(user)
  }
  const states = [...latest.values()]
  if (states.includes("CHANGES_REQUESTED")) return "changes_requested"
  if (states.includes("APPROVED")) return "approved"
  return "review_needed"
}
