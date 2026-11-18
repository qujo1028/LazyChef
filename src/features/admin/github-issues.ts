import "server-only"

import { z } from "zod"

import {
  type BoardIssue,
  type BoardPull,
  type CiState,
  linkedIssues,
  reviewStateFor,
  STATUS_LABELS,
} from "@/features/admin/board"
import { gh, GitHubError } from "@/features/admin/github"

const MAX_PULLS_WITH_DETAILS = 20

const labelSchema = z.union([z.string(), z.object({ name: z.string() })])
const issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  html_url: z.string(),
  state: z.enum(["open", "closed"]),
  labels: z.array(labelSchema).default([]),
  assignee: z.object({ login: z.string(), avatar_url: z.string() }).nullable().default(null),
  created_at: z.string(),
  closed_at: z.string().nullable().default(null),
  pull_request: z.unknown().optional(),
})
type RawIssue = z.infer<typeof issueSchema>

const pullSchema = z.object({
  number: z.number(),
  title: z.string(),
  html_url: z.string(),
  draft: z.boolean().default(false),
  body: z.string().nullable().default(null),
  created_at: z.string(),
  user: z.object({ login: z.string() }).nullable().default(null),
  head: z.object({ sha: z.string() }),
})
const reviewsSchema = z.array(z.object({ user: z.object({ login: z.string() }).nullable(), state: z.string() }))
const ciSchema = z.object({ state: z.string() })

function parseList<T extends z.ZodType>(schema: T, data: unknown): z.infer<T>[] {
  const parsed = z.array(schema).safeParse(data)
  if (!parsed.success) throw new GitHubError("http")
  return parsed.data
}

function toBoardIssue(raw: RawIssue): BoardIssue {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.html_url,
    labels: raw.labels.map((l) => (typeof l === "string" ? l : l.name)),
    assignee: raw.assignee ? { login: raw.assignee.login, avatarUrl: raw.assignee.avatar_url } : null,
    createdAt: raw.created_at,
    closedAt: raw.closed_at,
    state: raw.state,
  }
}

/** Open issues. GitHub's issues endpoint also returns PRs; those are dropped. */
export async function listOpenIssues(): Promise<BoardIssue[]> {
  const data = await gh<unknown>("/issues?state=open&per_page=100")
  return parseList(issueSchema, data)
    .filter((i) => !i.pull_request)
    .map(toBoardIssue)
}

/** Issues closed in the last `days` days, newest first. */
export async function listRecentlyClosedIssues(days = 7, now: number = Date.now()): Promise<BoardIssue[]> {
  const cutoff = now - days * 86_400_000
  const since = new Date(cutoff).toISOString()
  const data = await gh<unknown>(`/issues?state=closed&sort=updated&direction=desc&since=${encodeURIComponent(since)}&per_page=100`)
  return parseList(issueSchema, data)
    .filter((i) => !i.pull_request && i.closed_at && new Date(i.closed_at).getTime() >= cutoff)
    .map(toBoardIssue)
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))
}

function ciStateFor(state: string): CiState {
  if (state === "success") return "success"
  if (state === "failure" || state === "error") return "failure"
  return "pending"
}

/** Open PRs with review state and CI (for the first 20; the rest show links only). */
export async function listOpenPulls(): Promise<BoardPull[]> {
  const data = await gh<unknown>("/pulls?state=open&per_page=50")
  const pulls = parseList(pullSchema, data)
  return Promise.all(
    pulls.map(async (pull, index): Promise<BoardPull> => {
      const base: BoardPull = {
        number: pull.number,
        title: pull.title,
        url: pull.html_url,
        author: pull.user?.login ?? "unknown",
        draft: pull.draft,
        createdAt: pull.created_at,
        reviewState: null,
        ci: null,
        linkedIssues: linkedIssues(pull.body),
      }
      if (index >= MAX_PULLS_WITH_DETAILS) return base
      const [reviews, ci] = await Promise.allSettled([
        gh<unknown>(`/pulls/${pull.number}/reviews?per_page=100`),
        gh<unknown>(`/commits/${pull.head.sha}/status`),
      ])
      if (reviews.status === "fulfilled") {
        const parsed = reviewsSchema.safeParse(reviews.value)
        if (parsed.success) {
          base.reviewState = reviewStateFor(parsed.data.map((r) => ({ user: r.user?.login ?? null, state: r.state })))
        }
      }
      if (ci.status === "fulfilled") {
        const parsed = ciSchema.safeParse(ci.value)
        if (parsed.success) base.ci = ciStateFor(parsed.data.state)
      }
      return base
    }),
  )
}

/** One issue, read fresh (not from the 60 s cache) because a write is about to build on it. */
export async function getIssue(number: number): Promise<BoardIssue & { isPull: boolean }> {
  const parsed = issueSchema.safeParse(await gh<unknown>(`/issues/${number}`, { revalidate: 0 }))
  if (!parsed.success) throw new GitHubError("http")
  return { ...toBoardIssue(parsed.data), isPull: Boolean(parsed.data.pull_request) }
}

export async function setIssueLabels(number: number, labels: string[]): Promise<void> {
  await gh(`/issues/${number}/labels`, { method: "PUT", body: { labels } })
}

export async function setIssueState(
  number: number,
  state: "open" | "closed",
  reason?: "completed" | "not_planned" | "reopened",
): Promise<void> {
  await gh(`/issues/${number}`, { method: "PATCH", body: { state, ...(reason ? { state_reason: reason } : {}) } })
}

const STATUS_LABEL_COLORS: Record<keyof typeof STATUS_LABELS, string> = { next: "0e8a16", "in-progress": "fbca04" }

/** Creates the status labels if the repo lacks them. A 422 means one already exists, which is fine. */
export async function ensureStatusLabels(): Promise<void> {
  for (const key of Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]) {
    try {
      await gh("/labels", { method: "POST", body: { name: STATUS_LABELS[key], color: STATUS_LABEL_COLORS[key] } })
    } catch (error) {
      if (error instanceof GitHubError && error.status === 422) continue
      throw error
    }
  }
}
